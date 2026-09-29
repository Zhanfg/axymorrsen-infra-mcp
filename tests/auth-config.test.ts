import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "../src/auth/config.js";

describe("loadAuthConfig", () => {
  it("defaults to disabled local mode", () => {
    expect(loadAuthConfig({})).toEqual({
      mode: "disabled",
    });
  });

  it("loads a secure JWT resource-server configuration", () => {
    const config = loadAuthConfig({
      MCP_AUTH_MODE: "jwt",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      MCP_AUTH_ISSUER_URL: "https://auth.example.com",
      MCP_AUTH_JWKS_URL:
        "https://auth.example.com/.well-known/jwks.json",
      MCP_AUTHORIZATION_ENDPOINT:
        "https://auth.example.com/oauth2/authorize",
      MCP_TOKEN_ENDPOINT:
        "https://auth.example.com/oauth2/token",
      MCP_AUTH_REQUIRED_SCOPES:
        "infra:connect github:read",
      MCP_AUTH_SCOPES_SUPPORTED:
        "infra:connect github:read github:write",
      MCP_ALLOWED_HOSTS:
        "mcp-internal.example.net",
      MCP_ALLOWED_ORIGINS:
        "https://trusted.example.com",
    });

    expect(config).toMatchObject({
      mode: "jwt",
      audience: "https://mcp.example.com/mcp",
      requiredScopes: [
        "infra:connect",
        "github:read",
      ],
      scopesSupported: [
        "infra:connect",
        "github:read",
        "github:write",
      ],
      allowedHosts: [
        "mcp.example.com",
        "mcp-internal.example.net",
      ],
      allowedOrigins: [
        "https://trusted.example.com",
      ],
      allowInsecureLocalhost: false,
    });
  });

  it("rejects insecure remote URLs by default", () => {
    expect(() =>
      loadAuthConfig({
        MCP_AUTH_MODE: "jwt",
        MCP_PUBLIC_URL: "http://mcp.example.com/mcp",
        MCP_AUTH_ISSUER_URL: "https://auth.example.com",
        MCP_AUTH_JWKS_URL:
          "https://auth.example.com/.well-known/jwks.json",
        MCP_AUTHORIZATION_ENDPOINT:
          "https://auth.example.com/oauth2/authorize",
        MCP_TOKEN_ENDPOINT:
          "https://auth.example.com/oauth2/token",
      }),
    ).toThrow(/MCP_PUBLIC_URL must use https/);
  });
});
