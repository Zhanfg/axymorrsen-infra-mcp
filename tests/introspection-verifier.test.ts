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

describe("introspection response and transport contracts", () => {
  const valid = () => ({ active: true, iss: "https://issuer.example.com", exp: Math.floor(Date.now() / 1000) + 300, client_id: "fixture-client", scope: "openid", aud: ["393033796045257671"] });
  it.each([
    { active: "true" }, { active: true }, { ...valid(), exp: "4000000000" },
    { ...valid(), scope: ["openid"] }, { ...valid(), aud: [12] }, { ...valid(), mcp_resources: [12] },
    { ...valid(), mcp_step_up: "true" }, { ...valid(), client_id: "" },
  ])("rejects malformed provider responses %j", async payload => {
    const verifier = new IntrospectionTokenVerifier(config(), { fetchImpl: (async () => response(payload)) as typeof fetch });
    await expect(verifier.verifyAccessToken("fixture-token")).rejects.toMatchObject({ name: "AuthenticationServiceError", reason: "introspection_invalid_response" });
  });
  it("encodes Basic client authentication and token form fields without altering them", async () => {
    const c = { ...config(), introspectionClientId: "client:id +", introspectionClientSecret: "fixture:secret&+" };
    const verifier = new IntrospectionTokenVerifier(c, { fetchImpl: (async (_url, init) => {
      const basic = new Headers(init?.headers).get("authorization")?.slice(6) ?? "";
      const fields = Buffer.from(basic, "base64").toString().split(":");
      const decode = (value: string) => new URLSearchParams(`value=${value}`).get("value");
      expect(decode(fields[0] ?? "")).toBe(c.introspectionClientId);
      expect(decode(fields[1] ?? "")).toBe(c.introspectionClientSecret);
      expect((init?.body as URLSearchParams).get("token")).toBe("opaque+token/with=padding");
      expect(init?.redirect).toBe("error");
      return response(valid());
    }) as typeof fetch });
    await expect(verifier.verifyAccessToken("opaque+token/with=padding")).resolves.toMatchObject({ clientId: "fixture-client" });
  });
  it("accepts JWT-shaped tokens through introspection without local JWT parsing", async () => {
    const verifier = new IntrospectionTokenVerifier(config(), { fetchImpl: (async () => response(valid())) as typeof fetch });
    await expect(verifier.verifyAccessToken("fixture.jwt.shaped")).resolves.toMatchObject({ clientId: "fixture-client" });
  });
  it("does not expose exception strings from network failures", async () => {
    const verifier = new IntrospectionTokenVerifier(config(), { fetchImpl: (async () => { throw new Error("fixture-token fixture-secret private upstream details"); }) as typeof fetch });
    await expect(verifier.verifyAccessToken("fixture-token")).rejects.toThrow("Authentication service unavailable");
  });
});
