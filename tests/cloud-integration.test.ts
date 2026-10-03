import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { basicClientAuthorization } from "../src/auth/introspection-verifier.js";

const env = process.env;
const configured = Boolean(env.MCP_INTEGRATION_ACCESS_TOKEN || env.MCP_INTEGRATION_CLIENT_SECRET || env.MCP_INTEGRATION_REFRESH_TOKEN);

// No production secrets are required for normal CI. Opt in through its secret store.
describe("optional deployed MCP integration", () => {
  it.skipIf(!configured)("obtains a token and verifies initialize, tools/list and the authenticated principal", async () => {
    let stage = "configuration";
    const client = new Client({ name: "cloud-integration", version: "1" });
    try {
      const url = new URL(env.MCP_INTEGRATION_URL ?? "");
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid endpoint");
      let token = env.MCP_INTEGRATION_ACCESS_TOKEN;
      if (!token) {
        stage = "token_acquisition";
        const tokenUrl = new URL(env.MCP_INTEGRATION_TOKEN_ENDPOINT ?? "");
        if (tokenUrl.protocol !== "https:" || tokenUrl.username || tokenUrl.password) throw new Error("invalid token endpoint");
        const clientId = env.MCP_INTEGRATION_CLIENT_ID;
        if (!clientId) throw new Error("missing test client ID");
        const body = new URLSearchParams({ grant_type: env.MCP_INTEGRATION_REFRESH_TOKEN ? "refresh_token" : "client_credentials" });
        if (env.MCP_INTEGRATION_REFRESH_TOKEN) body.set("refresh_token", env.MCP_INTEGRATION_REFRESH_TOKEN);
        if (env.MCP_INTEGRATION_SCOPE) body.set("scope", env.MCP_INTEGRATION_SCOPE);
        const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
        if (env.MCP_INTEGRATION_CLIENT_SECRET) headers.authorization = basicClientAuthorization(clientId, env.MCP_INTEGRATION_CLIENT_SECRET);
        else body.set("client_id", clientId);
        const res = await fetch(tokenUrl, { method: "POST", body, headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error("token request failed");
        const data: unknown = await res.json();
        if (!data || typeof data !== "object" || !("access_token" in data) || typeof data.access_token !== "string" || !data.access_token) throw new Error("no access token");
        token = data.access_token;
      }
      stage = "initialize";
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
      stage = "tools_list";
      const tools = await client.listTools();
      if (!tools.tools.some(tool => tool.name === "infra.identity")) throw new Error("identity method unavailable");
      stage = "principal_verification";
      const result = await client.callTool({ name: "infra.identity", arguments: {} });
      const principal = result.structuredContent;
      expect(result.isError !== true && principal?.authenticated === true).toBe(true);
      expect(typeof principal?.clientId === "string" && typeof principal?.subject === "string").toBe(true);
      expect(Array.isArray(principal?.scopes) && Array.isArray(principal?.allowedResources)).toBe(true);
      if (env.MCP_INTEGRATION_EXPECTED_SUBJECT) expect(principal?.subject === env.MCP_INTEGRATION_EXPECTED_SUBJECT).toBe(true);
    } catch {
      // Upstream/SKD errors may contain response bodies. Emit only the failing stage.
      throw new Error(`Deployed MCP integration failed at ${stage}; inspect redacted service diagnostics`);
    } finally { await client.close().catch(() => {}); }
  }, 45_000);
});
