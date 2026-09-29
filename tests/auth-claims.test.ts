import { describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import { OAuthError } from "@modelcontextprotocol/server";
import { authInfoFromJwtPayload } from "../src/auth/jwt-verifier.js";
import type { JwtAuthConfig } from "../src/auth/config.js";

const config: JwtAuthConfig = {
  mode: "jwt",
  resourceUrl: new URL("https://mcp.example.com/mcp"),
  audience: "https://mcp.example.com/mcp",
  issuer: new URL("https://auth.example.com"),
  jwksUrl: new URL(
    "https://auth.example.com/.well-known/jwks.json",
  ),
  authorizationEndpoint: new URL(
    "https://auth.example.com/oauth2/authorize",
  ),
  tokenEndpoint: new URL(
    "https://auth.example.com/oauth2/token",
  ),
  requiredScopes: ["infra:connect"],
  scopesSupported: ["infra:connect"],
  allowedHosts: ["mcp.example.com"],
  allowedOrigins: [],
  allowInsecureLocalhost: false,
};

describe("authInfoFromJwtPayload", () => {
  it("maps client, subject, scopes, expiry and resource allowlist", () => {
    const payload: JWTPayload = {
      sub: "user-123",
      exp: 4_000_000_000,
      scope: "infra:connect github:read",
      client_id: "client-abc",
      mcp_resources: [
        "github:repo:example/project",
      ],
    };

    expect(
      authInfoFromJwtPayload(
        "token-value",
        payload,
        config,
      ),
    ).toEqual({
      token: "token-value",
      clientId: "client-abc",
      scopes: [
        "infra:connect",
        "github:read",
      ],
      expiresAt: 4_000_000_000,
      resource: new URL("https://mcp.example.com/mcp"),
      extra: {
        subject: "user-123",
        allowedResources: [
          "github:repo:example/project",
        ],
      },
    });
  });

  it("accepts array scp claims", () => {
    const payload: JWTPayload = {
      sub: "client-only",
      exp: 4_000_000_000,
      scp: ["infra:connect", "cloudflare:dns:read"],
    };

    expect(
      authInfoFromJwtPayload(
        "token-value",
        payload,
        config,
      ).scopes,
    ).toEqual([
      "infra:connect",
      "cloudflare:dns:read",
    ]);
  });

  it("maps an explicit MCP step-up claim", () => {
    const info = authInfoFromJwtPayload(
      "token-value",
      {
        sub: "user-123",
        client_id: "client-abc",
        exp: 4_000_000_000,
        scope: "infra:connect",
        mcp_step_up: true,
      },
      config,
    );

    expect(info.extra).toMatchObject({
      subject: "user-123",
      stepUpAuthorized: true,
    });
  });

  it("rejects tokens without expiry", () => {
    expect(() =>
      authInfoFromJwtPayload(
        "token-value",
        {
          sub: "client-only",
          scope: "infra:connect",
        },
        config,
      ),
    ).toThrow(OAuthError);
  });
});
