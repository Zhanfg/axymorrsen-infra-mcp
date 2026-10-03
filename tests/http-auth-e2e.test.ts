import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadAuthConfig, type IntrospectionAuthConfig } from "../src/auth/config.js";
import { IntrospectionTokenVerifier, basicClientAuthorization } from "../src/auth/introspection-verifier.js";
import { createGatewayHttpServer } from "../src/http/server.js";

const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "auth-test", version: "1" } } };
const active = () => ({ active: true, iss: issuer, exp: Math.floor(Date.now() / 1000) + 300, client_id: "test-client", sub: "test-user", scope: "infra:connect", aud: ["test-project"], mcp_resources: ["github:repo:example/project"] });
let issuer: string;
let jwk: object;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let upstream: Server;
const upstreamCalls: string[] = [];
const gateways: ReturnType<typeof createGatewayHttpServer>[] = [];
let opaqueUrl: string;
let jwtUrl: string;
const secret = "http-fixture-secret";
const logLines: string[] = [];
let logSpy: ReturnType<typeof vi.spyOn>;

async function bind(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture failed to listen");
  return `http://127.0.0.1:${address.port}`;
}
async function gateway(mode: "jwt" | "introspection"): Promise<string> {
  const config = loadAuthConfig({
    MCP_AUTH_MODE: mode, MCP_AUTH_ALLOW_INSECURE_LOCALHOST: "true", MCP_PUBLIC_URL: "http://127.0.0.1/mcp",
    MCP_AUTH_ISSUER_URL: issuer, MCP_AUTHORIZATION_ENDPOINT: `${issuer}/authorize`, MCP_TOKEN_ENDPOINT: `${issuer}/token`,
    MCP_AUTH_JWKS_URL: `${issuer}/jwks`, MCP_AUTH_INTROSPECTION_ENDPOINT: `${issuer}/introspect`,
    MCP_AUTH_INTROSPECTION_CLIENT_ID: "api-client", MCP_AUTH_INTROSPECTION_CLIENT_SECRET: secret,
    MCP_AUTH_INTROSPECTION_AUDIENCE: "test-project", MCP_ALLOWED_ORIGINS: "http://localhost:6274",
  });
  const options = mode === "introspection" ? { runtime: {
    mode: "introspection" as const, config: config as IntrospectionAuthConfig,
    verifier: new IntrospectionTokenVerifier(config as IntrospectionAuthConfig, { timeoutMs: 500 }),
    resourceMetadataUrl: "http://127.0.0.1/.well-known/oauth-protected-resource/mcp", oauthMetadata: {},
  } } : {};
  const server = createGatewayHttpServer(config, options);
  gateways.push(server); return `${await bind(server.server)}/mcp`;
}
async function post(token?: string, body: string = JSON.stringify(init), url = opaqueUrl, extra: Record<string, string> = {}) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token === undefined ? {} : { authorization: token }), ...extra }, body });
}
async function jwt(options: { expired?: boolean; audience?: string; scope?: string; issuer?: string } = {}) {
  return new SignJWT({ client_id: "test-client", scope: options.scope ?? "infra:connect", mcp_resources: ["github:repo:example/project"] })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(options.issuer ?? issuer).setSubject("test-user")
    .setAudience(options.audience ?? "http://127.0.0.1/mcp").setIssuedAt()
    .setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : Math.floor(Date.now() / 1000) + 300).sign(keys.privateKey);
}
beforeAll(async () => {
  logSpy = vi.spyOn(process.stderr, "write").mockImplementation(((line: string) => { logLines.push(String(line)); return true; }) as typeof process.stderr.write);
  keys = await generateKeyPair("RS256");
  jwk = { ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256", use: "sig" };
  upstream = createServer(async (req, res) => {
    if (req.url === "/jwks") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ keys: [jwk] })); return; }
    let raw = ""; for await (const chunk of req) raw += chunk;
    expect(req.method).toBe("POST");
    expect(req.headers.authorization).toBe(basicClientAuthorization("api-client", secret));
    expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const token = new URLSearchParams(raw).get("token") ?? "";
    upstreamCalls.push(token);
    if (token === "timeout") return;
    const status = token.startsWith("http-") ? Number(token.slice(5)) : 200;
    res.writeHead(status, { "content-type": "application/json" });
    const payload = token === "inactive" ? { active: false }
      : token === "bad-json" ? null : token === "bad-schema" ? { ...active(), exp: "300" }
      : token === "no-scope" ? { ...active(), scope: "profile" }
      : token === "expired" ? { ...active(), exp: 1 }
      : token === "wrong-audience" ? { ...active(), aud: ["wrong-project"] }
      : token === "wrong-issuer" ? { ...active(), iss: "https://other.example" }
      : token === "not-yet-valid" ? { ...active(), nbf: Math.floor(Date.now() / 1000) + 500 }
      : active();
    res.end(token === "bad-json" ? "not json" : JSON.stringify(payload));
  });
  issuer = await bind(upstream);
  opaqueUrl = await gateway("introspection"); jwtUrl = await gateway("jwt");
});
afterAll(async () => {
  await Promise.all(gateways.map(g => g.close())); upstream.closeAllConnections();
  await new Promise<void>(resolve => upstream.close(() => resolve())); logSpy.mockRestore();
});

describe("HTTP authentication and MCP protocol", () => {
  it("rejects missing credentials without introspection", async () => {
    const before = upstreamCalls.length;
    const res = await post(); expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata");
    expect(upstreamCalls).toHaveLength(before);
  });
  it.each(["Bearer", "Basic ignored", "Bearer first second", "Bearer token,extra"])("rejects malformed header %s before forwarding", async header => {
    const before = upstreamCalls.length; expect((await post(header)).status).toBe(401); expect(upstreamCalls).toHaveLength(before);
  });
  it("accepts case-insensitive Bearer with multiple spaces", async () => { expect((await post("bEaReR   active")).status).toBe(200); });
  it.each(["inactive", "expired", "wrong-audience", "wrong-issuer", "not-yet-valid"])("rejects invalid opaque identity: %s", async token => { expect((await post(`Bearer ${token}`)).status).toBe(401); });
  it.each(["http-401", "http-403", "http-500", "http-429", "timeout", "bad-json", "bad-schema"])("reports provider/configuration failure as unavailable: %s", async token => {
    const res = await post(`Bearer ${token}`); expect(res.status).toBe(503);
    expect(res.headers.has("www-authenticate")).toBe(false);
    expect(await res.json()).toMatchObject({ error: "temporarily_unavailable" });
  });
  it("uses 403 for authenticated callers missing required scope", async () => {
    const res = await post("Bearer no-scope"); expect(res.status).toBe(403); expect(res.headers.get("www-authenticate")).toContain("insufficient_scope");
  });
  it.each([{ expired: true }, { audience: "wrong" }, { issuer: "https://other.example" }])("rejects invalid JWT %j", async overrides => { expect((await post(`Bearer ${await jwt(overrides)}`, undefined, jwtUrl)).status).toBe(401); });
  it("rejects tampered JWT signature", async () => {
    const valid = await jwt(); const parts = valid.split("."); parts[2] = `${parts[2]?.startsWith("A") ? "B" : "A"}${parts[2]?.slice(1)}`;
    expect((await post(`Bearer ${parts.join(".")}`, undefined, jwtUrl)).status).toBe(401);
  });
  it("validates exact issuer identifiers without adding a trailing slash", async () => { expect((await post(`Bearer ${await jwt()}`, undefined, jwtUrl)).status).toBe(200); });
  it("advertises the exact discovered issuer and public resource metadata", async () => {
    const base = jwtUrl.replace("/mcp", "");
    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(metadata.status).toBe(200); expect((await metadata.json()).issuer).toBe(issuer);
    const resource = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(resource.status).toBe(200); expect((await resource.json()).authorization_servers).toEqual([issuer]);
  });
  it("does not route opaque credentials into JWT verification", async () => {
    const before = upstreamCalls.length; expect((await post("Bearer active", undefined, jwtUrl)).status).toBe(401); expect(upstreamCalls).toHaveLength(before);
  });
  it.each(["introspection", "jwt"])("initializes and continues authenticated MCP over %s", async mode => {
    const token = mode === "jwt" ? await jwt() : "active";
    const client = new Client({ name: "protocol-fixture", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(mode === "jwt" ? jwtUrl : opaqueUrl), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
      const tools = await client.listTools(); expect(tools.tools.map(t => t.name)).toContain("infra.identity");
      const identity = await client.callTool({ name: "infra.identity", arguments: {} });
      expect(identity.structuredContent).toMatchObject({ authenticated: true, clientId: "test-client", subject: "test-user", scopes: ["infra:connect"], allowedResources: ["github:repo:example/project"] });
      expect(JSON.stringify(identity)).not.toContain(token);
      expect((await client.readResource({ uri: "docs://getting-started" })).contents.length).toBeGreaterThan(0);
      expect((await client.listPrompts()).prompts.length).toBeGreaterThan(0);
    } finally { await client.close(); }
  });
  it("requires authentication on continuation requests too", async () => { expect((await post(undefined, JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).status).toBe(401); });
  it("reports malformed MCP JSON as a protocol error", async () => { const res = await post("Bearer active", "{"); expect(res.status).toBe(400); expect((await res.json()).error.code).toBe(-32700); });
  it("permits configured browser preflight without requiring a token", async () => {
    const res = await fetch(opaqueUrl, { method: "OPTIONS", headers: { origin: "http://localhost:6274", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name" } });
    expect(res.status).toBe(204); expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:6274");
    const auth = await post(undefined, undefined, opaqueUrl, { origin: "http://localhost:6274" });
    expect(auth.status).toBe(401); expect(auth.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
  });
  it("rejects unknown origins and ignores spoofed forwarded host", async () => {
    expect((await post("Bearer active", undefined, opaqueUrl, { origin: "https://attacker.example" })).status).toBe(403);
    expect((await post("Bearer active", undefined, opaqueUrl, { "x-forwarded-host": "attacker.example" })).status).toBe(200);
  });
  it("health and readiness work without contacting ZITADEL", async () => {
    const before = upstreamCalls.length;
    for (const path of ["health", "healthz", "ready"]) { const res = await fetch(opaqueUrl.replace("/mcp", `/${path}`)); expect(res.status).toBe(200); expect(JSON.stringify(await res.json())).not.toContain(secret); }
    expect(upstreamCalls).toHaveLength(before);
  });
  it("keeps credentials out of diagnostics and reports failure categories", () => {
    const logs = logLines.join(""); expect(logs).not.toContain(secret); expect(logs).not.toContain(basicClientAuthorization("api-client", secret));
    expect(logs).not.toContain('"token":'); expect(logs).toContain('"requestId":'); expect(logs).toContain("introspection_client_auth_failed");
  });
});
