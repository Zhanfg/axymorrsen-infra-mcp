import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createProviderSecretResolver,
} from "../src/secrets/factory.js";
import {
  VaultKv2SecretResolver,
} from "../src/secrets/vault-kv2.js";

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

describe("Vault KV v2 secret backend", () => {
  it("reads only the requested field using the KV v2 data endpoint", async () => {
    let seenUrl = "";
    let seenHeaders:
      Headers | undefined;

    const fetchImpl =
      (async (
        input,
        init = {},
      ) => {
        seenUrl =
          input instanceof URL
            ? input.href
            : typeof input ===
                "string"
              ? input
              : input.url;
        seenHeaders =
          new Headers(
            init.headers,
          );

        return jsonResponse({
          data: {
            data: {
              token:
                "provider-token",
              ignored:
                "other-secret",
            },
            metadata: {
              version: 4,
            },
          },
        });
      }) as typeof fetch;

    const resolver =
      new VaultKv2SecretResolver({
        baseUrl:
          "https://vault.example.com/v1/",
        token:
          "bootstrap-token",
        namespace:
          "admin/team",
        fetchImpl,
      });

    const secret =
      await resolver.resolve(
        "vault-kv2:secret/providers/github#token",
      );

    expect(
      secret.reveal(),
    ).toBe("provider-token");
    expect(String(secret)).toBe(
      "<REDACTED>",
    );
    expect(seenUrl).toBe(
      "https://vault.example.com/v1/secret/data/providers/github",
    );
    expect(
      seenHeaders?.get(
        "x-vault-token",
      ),
    ).toBe("bootstrap-token");
    expect(
      seenHeaders?.get(
        "x-vault-namespace",
      ),
    ).toBe("admin/team");
  });

  it("does not expose Vault response bodies when a read fails", async () => {
    const resolver =
      new VaultKv2SecretResolver({
        baseUrl:
          "https://vault.example.com/v1/",
        token:
          "bootstrap-token",
        fetchImpl:
          (async () =>
            jsonResponse(
              {
                errors: [
                  "sensitive internal detail",
                ],
              },
              403,
            )) as typeof fetch,
      });

    await expect(
      resolver.resolve(
        "vault-kv2:secret/providers/github#token",
      ),
    ).rejects.not.toThrow(
      /sensitive internal detail/u,
    );
  });

  it("rejects insecure non-loopback Vault endpoints", () => {
    expect(
      () =>
        new VaultKv2SecretResolver({
          baseUrl:
            "http://vault.example.com/v1/",
          token: "token",
        }),
    ).toThrow(/HTTPS/u);
  });

  it("routes env and Vault references independently", async () => {
    const resolver =
      createProviderSecretResolver(
        {
          SECRET_BACKEND:
            "env,vault-kv2",
          ENV_TOKEN:
            "env-secret",
          VAULT_ADDR:
            "https://vault.example.com",
          VAULT_TOKEN:
            "bootstrap-token",
        },
        {
          fetchImpl:
            (async () =>
              jsonResponse({
                data: {
                  data: {
                    token:
                      "vault-secret",
                  },
                },
              })) as typeof fetch,
        },
      );

    await expect(
      resolver.resolve(
        "env:ENV_TOKEN",
      ),
    ).resolves.toMatchObject({});

    const vault =
      await resolver.resolve(
        "vault-kv2:secret/providers/demo#token",
      );

    expect(
      vault.reveal(),
    ).toBe("vault-secret");
  });

  it("fails closed on unsupported secret backends", () => {
    expect(() =>
      createProviderSecretResolver({
        SECRET_BACKEND:
          "env,file",
      }),
    ).toThrow(
      "unsupported secret backend",
    );
  });
});
