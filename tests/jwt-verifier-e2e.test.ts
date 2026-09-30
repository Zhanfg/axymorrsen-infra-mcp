import {
  createServer,
  type Server,
} from "node:http";
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
import type {
  JwtAuthConfig,
} from "../src/auth/config.js";
import {
  JwtTokenVerifier,
} from "../src/auth/jwt-verifier.js";

describe("JWT verifier end-to-end", () => {
  let privateKey: KeyLike;
  let jwksServer: Server;
  let jwksUrl: URL;

  const issuer =
    new URL(
      "https://issuer.example/",
    );
  const resourceUrl =
    new URL(
      "https://mcp.example.com/mcp",
    );
  const audience =
    resourceUrl.href;

  beforeAll(async () => {
    const pair =
      await generateKeyPair(
        "RS256",
      );
    privateKey =
      pair.privateKey;

    const publicJwk =
      await exportJWK(
        pair.publicKey,
      );

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

    jwksServer =
      createServer(
        (_req, res) => {
          res.writeHead(200, {
            "content-type":
              "application/json",
            "cache-control":
              "no-store",
          });
          res.end(
            JSON.stringify(jwks),
          );
        },
      );

    await new Promise<void>(
      (resolve) => {
        jwksServer.listen(
          0,
          "127.0.0.1",
          resolve,
        );
      },
    );

    const address =
      jwksServer.address();

    if (
      !address ||
      typeof address ===
        "string"
    ) {
      throw new Error(
        "failed to bind JWKS test server",
      );
    }

    jwksUrl = new URL(
      `http://127.0.0.1:${address.port}/jwks`,
    );
  });

  afterAll(async () => {
    await new Promise<void>(
      (resolve, reject) => {
        jwksServer.close(
          (error) =>
            error
              ? reject(error)
              : resolve(),
        );
      },
    );
  });

  function config(
    audienceMode:
      | "exact"
      | "client_id" =
        "exact",
  ): JwtAuthConfig {
    return {
      mode: "jwt",
      resourceUrl,
      audienceMode,
      audience,
      issuer,
      jwksUrl,
      authorizationEndpoint:
        new URL(
          "https://issuer.example/oauth2/authorize",
        ),
      tokenEndpoint:
        new URL(
          "https://issuer.example/oauth2/token",
        ),
      requiredScopes: [
        "infra:connect",
      ],
      scopesSupported: [
        "infra:connect",
        "github:read",
      ],
      allowedHosts: [
        "mcp.example.com",
      ],
      allowedOrigins: [],
      allowInsecureLocalhost:
        false,
    };
  }

  async function signedToken(
    overrides: {
      issuer?: string;
      audience?:
        | string
        | string[];
      clientId?: string;
      includeClientId?: boolean;
    } = {},
  ): Promise<string> {
    const claims:
      Record<string, unknown> = {
        scope:
          "infra:connect github:read",
        mcp_resources: [
          "github:repo:example/project",
        ],
      };

    if (
      overrides.includeClientId !==
      false
    ) {
      claims.client_id =
        overrides.clientId ??
        "desktop-client";
    }

    return new SignJWT(claims)
      .setProtectedHeader({
        alg: "RS256",
        kid: "test-key",
      })
      .setSubject("user-123")
      .setIssuer(
        overrides.issuer ??
          issuer.href,
      )
      .setAudience(
        overrides.audience ??
          audience,
      )
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("accepts a correctly signed token for an exact MCP resource audience", async () => {
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
    expect(
      result.resource?.href,
    ).toBe(resourceUrl.href);
    expect(result.extra).toEqual({
      subject: "user-123",
      allowedResources: [
        "github:repo:example/project",
      ],
    });
  });

  it("rejects a token minted for another exact audience", async () => {
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

  it("accepts a shared DCR audience when it includes the authenticated client", async () => {
    const result =
      await new JwtTokenVerifier(
        config("client_id"),
      ).verifyAccessToken(
        await signedToken({
          audience: [
            "dcr-project-id",
            "other-client",
            "desktop-client",
          ],
        }),
      );

    expect(result.clientId).toBe(
      "desktop-client",
    );
  });

  it("rejects a shared DCR audience that does not include the authenticated client", async () => {
    await expect(
      new JwtTokenVerifier(
        config("client_id"),
      ).verifyAccessToken(
        await signedToken({
          audience: [
            "dcr-project-id",
            "other-client",
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("does not use the subject as a DCR client identifier", async () => {
    await expect(
      new JwtTokenVerifier(
        config("client_id"),
      ).verifyAccessToken(
        await signedToken({
          audience: [
            "dcr-project-id",
            "user-123",
          ],
          includeClientId: false,
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
