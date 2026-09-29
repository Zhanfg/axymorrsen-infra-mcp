import { createServer, type Server } from "node:http";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type KeyLike,
} from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJwtTokenVerifier,
  parseScopes,
} from "../src/auth/jwt-verifier.js";

describe("parseScopes", () => {
  it("normalizes OAuth scope and scp claims without duplicates", () => {
    expect(
      parseScopes({
        scope: "mcp github:read",
        scp: ["github:read", "cloudflare:dns:read"],
      }),
    ).toEqual(["mcp", "github:read", "cloudflare:dns:read"]);
  });

  it("ignores malformed scope values", () => {
    expect(parseScopes({ scope: 42, scp: [null, "mcp", 7] })).toEqual(["mcp"]);
  });
});

describe("JWT access-token verification", () => {
  let privateKey: KeyLike;
  let server: Server;
  let jwksUrl: URL;

  const issuer = "https://issuer.example/";
  const audience = "https://mcp.example.com/mcp";
  const resourceUrl = new URL(audience);

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

    server = createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(jwks));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind JWKS test server");
    }

    jwksUrl = new URL(`http://127.0.0.1:${address.port}/jwks`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function token(overrides: {
    issuer?: string;
    audience?: string;
  } = {}): Promise<string> {
    return new SignJWT({
      client_id: "desktop-client",
      scope: "mcp github:read",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  function verifier() {
    return createJwtTokenVerifier({
      issuer,
      audience,
      jwksUrl,
      requiredScopes: ["mcp"],
      algorithms: ["RS256"],
      clientIdClaims: ["client_id", "azp"],
      resourceUrl,
    });
  }

  it("accepts a correctly signed token for this MCP resource", async () => {
    const result = await verifier().verifyAccessToken(await token());

    expect(result.clientId).toBe("desktop-client");
    expect(result.scopes).toEqual(["mcp", "github:read"]);
    expect(result.resource?.href).toBe(resourceUrl.href);
    expect(result.expiresAt).toBeTypeOf("number");
  });

  it("rejects a token minted for another audience", async () => {
    await expect(
      verifier().verifyAccessToken(
        await token({ audience: "https://other.example/mcp" }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects a token minted by another issuer", async () => {
    await expect(
      verifier().verifyAccessToken(
        await token({ issuer: "https://attacker.example/" }),
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});
