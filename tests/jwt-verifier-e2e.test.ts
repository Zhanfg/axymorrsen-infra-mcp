import { createServer, type Server } from "node:http";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type KeyLike,
} from "jose";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import type { JwtAuthConfig } from "../src/auth/config.js";
import { JwtTokenVerifier } from "../src/auth/jwt-verifier.js";

describe("JWT verifier end-to-end", () => {
  let privateKey: KeyLike;
  let jwksServer: Server;
  let jwksUrl: URL;

  const issuer = new URL("https://issuer.example/");
  const resourceUrl = new URL("https://mcp.example.com/mcp");
  const audience = resourceUrl.href;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;

    const publicJwk = await exportJWK(pair.publicKey);
    const jwks = {
      keys: [
        {
          ...publicJwk,
          alg: "RS256",
          use: "sig",
          kid: "test-key",
        },
      ],
    };

    jwksServer = createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(jwks));
    });

    await new Promise<void>((resolve) => {
      jwksServer.listen(0, "127.0.0.1", resolve);
    });

    const address = jwksServer.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind JWKS test server");
    }

    jwksUrl = new URL(
      `http://127.0.0.1:${address.port}/jwks`,
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      jwksServer.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  });

  function config(): JwtAuthConfig {
    return {
      mode: "jwt",
      resourceUrl,
      audience,
      issuer,
      jwksUrl,
      authorizationEndpoint: new URL(
        "https://issuer.example/oauth2/authorize",
      ),
      tokenEndpoint: new URL(
        "https://issuer.example/oauth2/token",
      ),
      requiredScopes: ["infra:connect"],
      scopesSupported: [
        "infra:connect",
        "github:read",
      ],
      allowedHosts: ["mcp.example.com"],
      allowedOrigins: [],
      allowInsecureLocalhost: false,
    };
  }

  async function signedToken(
    overrides: {
      issuer?: string;
      audience?: string;
    } = {},
  ): Promise<string> {
    return new SignJWT({
      client_id: "desktop-client",
      scope: "infra:connect github:read",
      mcp_resources: [
        "github:repo:example/project",
      ],
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "test-key",
      })
      .setSubject("user-123")
      .setIssuer(overrides.issuer ?? issuer.href)
      .setAudience(overrides.audience ?? audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("accepts a correctly signed token for this MCP resource", async () => {
    const result =
      await new JwtTokenVerifier(
        config(),
      ).verifyAccessToken(
        await signedToken(),
      );

    expect(result.clientId).toBe(
      "desktop-client",
    );
    expect(result.scopes).toEqual([
      "infra:connect",
      "github:read",
    ]);
    expect(result.resource?.href).toBe(
      resourceUrl.href,
    );
    expect(result.extra).toEqual({
      subject: "user-123",
      allowedResources: [
        "github:repo:example/project",
      ],
    });
    expect(result.expiresAt).toBeTypeOf(
      "number",
    );
  });

  it("rejects a token minted for another audience", async () => {
    await expect(
      new JwtTokenVerifier(
        config(),
      ).verifyAccessToken(
        await signedToken({
          audience:
            "https://other.example/mcp",
        }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects a token minted by another issuer", async () => {
    await expect(
      new JwtTokenVerifier(
        config(),
      ).verifyAccessToken(
        await signedToken({
          issuer:
            "https://attacker.example/",
        }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});
