import {
  describe,
  expect,
  it,
} from "vitest";
import {
  loadAuthConfig,
} from "../src/auth/config.js";

const secureEnv = {
  MCP_AUTH_MODE: "jwt",
  MCP_PUBLIC_URL:
    "https://mcp.example.com/mcp",
  MCP_AUTH_ISSUER_URL:
    "https://auth.example.com",
  MCP_AUTH_JWKS_URL:
    "https://auth.example.com/.well-known/jwks.json",
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
        ...secureEnv,
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

  it("supports client-id audience validation for shared DCR audiences", () => {
    const config =
      loadAuthConfig({
        ...secureEnv,
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
      requiredScopes: [
        "openid",
      ],
      scopesSupported: [
        "openid",
        "profile",
        "email",
        "offline_access",
      ],
    });
  });

  it("rejects unsupported audience modes", () => {
    expect(() =>
      loadAuthConfig({
        ...secureEnv,
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
        ...secureEnv,
        MCP_PUBLIC_URL:
          "http://mcp.example.com/mcp",
      }),
    ).toThrow(
      /MCP_PUBLIC_URL must use https/u,
    );
  });
});
