import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../src/config/runtime.js";

describe("loadRuntimeConfig", () => {
  it("defaults to unauthenticated loopback-only mode", () => {
    const config = loadRuntimeConfig({});
    expect(config.bindHost).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
    expect(config.auth).toBeUndefined();
    expect(config.allowedHostnames).toContain("localhost");
  });

  it("refuses remote binding without authentication", () => {
    expect(() =>
      loadRuntimeConfig({
        MCP_BIND_HOST: "0.0.0.0",
        MCP_PUBLIC_MCP_URL: "https://mcp.example.com/mcp",
      }),
    ).toThrow(/requires OAuth\/OIDC authentication/u);
  });

  it("accepts a remote JWT resource-server configuration", () => {
    const config = loadRuntimeConfig({
      MCP_BIND_HOST: "0.0.0.0",
      MCP_PUBLIC_MCP_URL: "https://mcp.example.com/mcp",
      MCP_AUTH_ISSUER: "https://auth.example.com/",
      MCP_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
    });

    expect(config.auth?.audience).toBe("https://mcp.example.com/mcp");
    expect(config.auth?.requiredScopes).toEqual(["mcp"]);
    expect(config.allowedHostnames).toContain("mcp.example.com");
  });

  it("rejects insecure public remote URLs", () => {
    expect(() =>
      loadRuntimeConfig({
        MCP_BIND_HOST: "0.0.0.0",
        MCP_PUBLIC_MCP_URL: "http://mcp.example.com/mcp",
        MCP_AUTH_ISSUER: "https://auth.example.com/",
        MCP_AUTH_JWKS_URL: "https://auth.example.com/jwks",
      }),
    ).toThrow(/must use HTTPS/u);
  });
});
