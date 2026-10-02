import {
  describe,
  expect,
  it,
} from "vitest";
import {
  loadAuthConfig,
} from "../src/auth/config.js";

const commonEnv = {
  MCP_PUBLIC_URL:
    "https://mcp.example.com/mcp",
  MCP_AUTH_ISSUER_URL:
    "https://auth.example.com",
  MCP_AUTHORIZATION_ENDPOINT:
    "https://auth.example.com/oauth2/authorize",
  MCP_TOKEN_ENDPOINT:
    "https://auth.example.com/oauth2/token",
};

describe("loadAuthConfig", () => {
  it("defaults to disabled local mode", () => {
    expect(
      loadAuthConfig({}),
    ).toEqual({
      mode: "disabled",
    });
  });

  it("loads a secure exact-audience JWT resource-server configuration", () => {
    const config =
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE: "jwt",
        MCP_AUTH_JWKS_URL:
          "https://auth.example.com/.well-known/jwks.json",
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
      audienceMode: "exact",
      audience:
        "https://mcp.example.com/mcp",
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
      allowInsecureLocalhost:
        false,
    });
  });

  it("supports client-id audience validation for shared DCR JWT audiences", () => {
    const config =
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE: "jwt",
        MCP_AUTH_JWKS_URL:
          "https://auth.example.com/.well-known/jwks.json",
        MCP_AUTH_AUDIENCE_MODE:
          "client_id",
        MCP_AUTH_REQUIRED_SCOPES:
          "openid",
        MCP_AUTH_SCOPES_SUPPORTED:
          "openid profile email offline_access",
      });

    expect(config).toMatchObject({
      mode: "jwt",
      audienceMode:
        "client_id",
    });
  });

  it("loads opaque-token introspection mode", () => {
    const config =
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE:
          "introspection",
        MCP_AUTH_INTROSPECTION_ENDPOINT:
          "https://auth.example.com/oauth/v2/introspect",
        MCP_AUTH_INTROSPECTION_CLIENT_ID:
          "api-client",
        MCP_AUTH_INTROSPECTION_CLIENT_SECRET:
          "secret",
        MCP_AUTH_INTROSPECTION_AUDIENCE:
          "project-123",
        MCP_AUTH_REQUIRED_SCOPES:
          "openid",
        MCP_AUTH_SCOPES_SUPPORTED:
          "openid project-audience",
      });

    expect(config).toMatchObject({
      mode: "introspection",
      introspectionClientId:
        "api-client",
      introspectionAudience:
        "project-123",
      requiredScopes: [
        "openid",
      ],
    });
  });

  it("requires introspection credentials in introspection mode", () => {
    expect(() =>
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE:
          "introspection",
        MCP_AUTH_INTROSPECTION_ENDPOINT:
          "https://auth.example.com/oauth/v2/introspect",
      }),
    ).toThrow(
      /MCP_AUTH_INTROSPECTION_CLIENT_ID/u,
    );
  });

  it("rejects unsupported audience modes", () => {
    expect(() =>
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE: "jwt",
        MCP_AUTH_JWKS_URL:
          "https://auth.example.com/.well-known/jwks.json",
        MCP_AUTH_AUDIENCE_MODE:
          "none",
      }),
    ).toThrow(
      /unsupported MCP_AUTH_AUDIENCE_MODE/u,
    );
  });

  it("rejects insecure remote URLs by default", () => {
    expect(() =>
      loadAuthConfig({
        ...commonEnv,
        MCP_AUTH_MODE:
          "introspection",
        MCP_PUBLIC_URL:
          "http://mcp.example.com/mcp",
        MCP_AUTH_INTROSPECTION_ENDPOINT:
          "https://auth.example.com/oauth/v2/introspect",
        MCP_AUTH_INTROSPECTION_CLIENT_ID:
          "api-client",
        MCP_AUTH_INTROSPECTION_CLIENT_SECRET:
          "secret",
      }),
    ).toThrow(
      /MCP_PUBLIC_URL must use https/u,
    );
  });
});
