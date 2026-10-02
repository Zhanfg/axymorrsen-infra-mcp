import {
  describe,
  expect,
  it,
} from "vitest";
import type {
  IntrospectionAuthConfig,
} from "../src/auth/config.js";
import {
  IntrospectionTokenVerifier,
} from "../src/auth/introspection-verifier.js";

function config():
  IntrospectionAuthConfig {
  return {
    mode: "introspection",
    resourceUrl:
      new URL(
        "https://mcp.example.com/mcp",
      ),
    issuer:
      new URL(
        "https://issuer.example.com",
      ),
    authorizationEndpoint:
      new URL(
        "https://issuer.example.com/oauth/v2/authorize",
      ),
    tokenEndpoint:
      new URL(
        "https://issuer.example.com/oauth/v2/token",
      ),
    introspectionEndpoint:
      new URL(
        "https://issuer.example.com/oauth/v2/introspect",
      ),
    introspectionClientId:
      "api-client",
    introspectionClientSecret:
      "super secret",
    introspectionAudience:
      "393033796045257671",
    requiredScopes: [
      "openid",
    ],
    scopesSupported: [
      "openid",
    ],
    allowedHosts: [
      "mcp.example.com",
    ],
    allowedOrigins: [],
    allowInsecureLocalhost:
      false,
  };
}

function response(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

describe("IntrospectionTokenVerifier", () => {
  it("accepts an active opaque token for the configured audience", async () => {
    let authHeader = "";
    let requestBody = "";

    const verifier =
      new IntrospectionTokenVerifier(
        config(),
        {
          fetchImpl:
            (async (
              _input,
              init = {},
            ) => {
              authHeader =
                new Headers(
                  init.headers,
                ).get(
                  "authorization",
                ) ?? "";

              requestBody =
                init.body instanceof
                URLSearchParams
                  ? init.body
                      .toString()
                  : String(
                      init.body ??
                        "",
                    );

              return response({
                active: true,
                iss:
                  "https://issuer.example.com",
                exp:
                  Math.floor(
                    Date.now() /
                      1000,
                  ) + 300,
                client_id:
                  "dynamic-client",
                username:
                  "user@example.com",
                scope:
                  "openid profile",
                aud: [
                  "dynamic-client",
                  "393033796045257671",
                ],
              });
            }) as typeof fetch,
        },
      );

    const result =
      await verifier
        .verifyAccessToken(
          "opaque-token",
        );

    expect(
      result.clientId,
    ).toBe("dynamic-client");
    expect(
      result.scopes,
    ).toEqual([
      "openid",
      "profile",
    ]);
    expect(
      result.extra,
    ).toMatchObject({
      subject:
        "user@example.com",
    });
    expect(
      authHeader.startsWith(
        "Basic ",
      ),
    ).toBe(true);
    expect(
      requestBody,
    ).toContain(
      "token=opaque-token",
    );
  });

  it("rejects inactive tokens", async () => {
    const verifier =
      new IntrospectionTokenVerifier(
        config(),
        {
          fetchImpl:
            (async () =>
              response({
                active: false,
              })) as typeof fetch,
        },
      );

    await expect(
      verifier.verifyAccessToken(
        "opaque-token",
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects issuer mismatches", async () => {
    const verifier =
      new IntrospectionTokenVerifier(
        config(),
        {
          fetchImpl:
            (async () =>
              response({
                active: true,
                iss:
                  "https://attacker.example.com",
                exp:
                  Math.floor(
                    Date.now() /
                      1000,
                  ) + 300,
                client_id:
                  "dynamic-client",
                scope: "openid",
                aud: [
                  "393033796045257671",
                ],
              })) as typeof fetch,
        },
      );

    await expect(
      verifier.verifyAccessToken(
        "opaque-token",
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects tokens outside the configured project audience", async () => {
    const verifier =
      new IntrospectionTokenVerifier(
        config(),
        {
          fetchImpl:
            (async () =>
              response({
                active: true,
                iss:
                  "https://issuer.example.com",
                exp:
                  Math.floor(
                    Date.now() /
                      1000,
                  ) + 300,
                client_id:
                  "dynamic-client",
                scope: "openid",
                aud: [
                  "other-project",
                ],
              })) as typeof fetch,
        },
      );

    await expect(
      verifier.verifyAccessToken(
        "opaque-token",
      ),
    ).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("does not surface upstream error bodies", async () => {
    const verifier =
      new IntrospectionTokenVerifier(
        config(),
        {
          fetchImpl:
            (async () =>
              response(
                {
                  error:
                    "sensitive upstream detail",
                },
                401,
              )) as typeof fetch,
        },
      );

    await expect(
      verifier.verifyAccessToken(
        "opaque-token",
      ),
    ).rejects.not.toThrow(
      /sensitive upstream detail/u,
    );
  });
});
