import type {
  ExecutionContext,
} from "../src/core/types.js";
import {
  DockerHubProvider,
} from "../src/providers/docker.js";
import {
  KubernetesProvider,
} from "../src/providers/kubernetes.js";
import {
  VaultProvider,
} from "../src/providers/vault.js";
import {
  EnvironmentSecretResolver,
} from "../src/secrets/resolver.js";
import {
  describe,
  expect,
  it,
} from "vitest";

const context: ExecutionContext = {
  requestId: "runtime3-test",
  clientId: "test-client",
  subject: "test-user",
  scopes: [],
  allowedResources: [],
  stepUpAuthorized: true,
};

interface RecordedCall {
  url: string;
  init: RequestInit;
  body?: unknown;
}

function urlOf(
  input: Parameters<typeof fetch>[0],
): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function bodyOf(
  init: RequestInit,
): unknown {
  if (
    typeof init.body !== "string"
  ) {
    return undefined;
  }

  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

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

function fakeJwt(
  expiresAtSeconds:
    number,
): string {
  const header =
    Buffer.from(
      JSON.stringify({
        alg: "none",
        typ: "JWT",
      }),
    ).toString("base64url");
  const payload =
    Buffer.from(
      JSON.stringify({
        exp: expiresAtSeconds,
      }),
    ).toString("base64url");

  return `${header}.${payload}.signature`;
}

describe("runtime provider pack", () => {
  it("exchanges Docker Hub credentials once and caches only the short-lived bearer token", async () => {
    const calls: RecordedCall[] = [];
    const accessToken =
      fakeJwt(
        Math.floor(
          Date.now() / 1000,
        ) + 3600,
      );

    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        url.endsWith(
          "/v2/auth/token",
        )
      ) {
        return jsonResponse({
          access_token:
            accessToken,
        });
      }

      if (
        url.endsWith(
          "/v2/namespaces/acme/repositories/demo",
        )
      ) {
        return jsonResponse({
          name: "demo",
          namespace: "acme",
          description: "demo repo",
          is_private: false,
          permissions: {
            read: true,
            write: true,
            admin: false,
          },
        });
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new DockerHubProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            DOCKERHUB_IDENTIFIER:
              "acme",
            DOCKERHUB_SECRET:
              "super-secret-pat",
          }),
        baseUrl:
          "https://hub.test/",
        fetchImpl,
      });

    const first =
      await provider.execute(
        "docker.repository.get",
        {
          namespace: "acme",
          repository: "demo",
        },
        context,
      );
    const second =
      await provider.execute(
        "docker.repository.get",
        {
          namespace: "acme",
          repository: "demo",
        },
        context,
      );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    expect(
      calls.filter(
        (call) =>
          call.url.endsWith(
            "/v2/auth/token",
          ),
      ),
    ).toHaveLength(1);

    expect(
      calls[0]?.body,
    ).toEqual({
      identifier: "acme",
      secret:
        "super-secret-pat",
    });

    expect(
      JSON.stringify(first),
    ).not.toContain(
      "super-secret-pat",
    );
    expect(
      JSON.stringify(second),
    ).not.toContain(
      "super-secret-pat",
    );

    const repositoryCalls =
      calls.filter(
        (call) =>
          call.url.includes(
            "/repositories/demo",
          ),
      );

    for (
      const call of
      repositoryCalls
    ) {
      const headers =
        call.init.headers as
          Record<
            string,
            string
          >;
      expect(
        headers.authorization,
      ).toBe(
        `Bearer ${accessToken}`,
      );
    }
  });

  it("scales Kubernetes through the scale subresource with a resourceVersion precondition", async () => {
    const calls: RecordedCall[] = [];

    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        init.method === "GET" &&
        url.endsWith(
          "/apis/apps/v1/namespaces/prod/deployments/api/scale",
        )
      ) {
        return jsonResponse({
          metadata: {
            name: "api",
            namespace: "prod",
            resourceVersion:
              "12345",
          },
          spec: {
            replicas: 2,
          },
          status: {
            replicas: 2,
          },
        });
      }

      if (
        init.method ===
          "PATCH" &&
        url.endsWith(
          "/apis/apps/v1/namespaces/prod/deployments/api/scale",
        )
      ) {
        return jsonResponse({
          metadata: {
            name: "api",
            namespace: "prod",
            resourceVersion:
              "12346",
          },
          spec: {
            replicas: 4,
          },
          status: {
            replicas: 2,
          },
        });
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new KubernetesProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            KUBERNETES_TOKEN:
              "kube-token",
          }),
        clusterId:
          "prod-cluster",
        baseUrl:
          "https://kube.test/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "kubernetes.deployment.scale",
        {
          namespace: "prod",
          deployment: "api",
          replicas: 4,
        },
        context,
      );

    expect(result).toMatchObject({
      ok: true,
      data: {
        replicas: 4,
        resourceVersion:
          "12346",
      },
    });
    expect(calls).toHaveLength(2);
    expect(
      calls[1]?.body,
    ).toEqual({
      metadata: {
        resourceVersion:
          "12345",
      },
      spec: {
        replicas: 4,
      },
    });

    const headers =
      calls[1]?.init
        .headers as
        Record<string, string>;
    expect(
      headers[
        "content-type"
      ],
    ).toBe(
      "application/merge-patch+json",
    );
  });

  it("never returns Vault custom metadata or secret-like values", async () => {
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);

      if (
        init.method === "GET" &&
        url.endsWith(
          "/secret/metadata/app/config",
        )
      ) {
        return jsonResponse({
          data: {
            cas_required: true,
            created_time:
              "2026-01-01T00:00:00Z",
            current_version: 2,
            delete_version_after:
              "0s",
            max_versions: 10,
            oldest_version: 1,
            updated_time:
              "2026-01-02T00:00:00Z",
            custom_metadata: {
              password:
                "must-not-return",
            },
            versions: {
              "1": {
                created_time:
                  "2026-01-01T00:00:00Z",
                deletion_time: "",
                destroyed: false,
                suspicious:
                  "must-not-return",
              },
              "2": {
                created_time:
                  "2026-01-02T00:00:00Z",
                deletion_time: "",
                destroyed: false,
              },
            },
          },
        });
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new VaultProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            VAULT_TOKEN:
              "vault-token",
          }),
        instanceId:
          "primary",
        baseUrl:
          "https://vault.test/v1/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "vault.kv.metadata.get",
        {
          mount: "secret",
          path: "app/config",
        },
        context,
      );

    expect(result.ok).toBe(true);
    const serialized =
      JSON.stringify(result);

    expect(serialized).not.toContain(
      "must-not-return",
    );
    expect(serialized).not.toContain(
      "custom_metadata",
    );
    expect(result).toMatchObject({
      data: {
        current_version: 2,
        versions: {
          "1": {
            destroyed: false,
          },
        },
      },
    });
  });

  it("strips unknown secret payloads from Vault metadata updates and verifies the result", async () => {
    const calls: RecordedCall[] = [];

    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      calls.push({
        url: urlOf(input),
        init,
        body: bodyOf(init),
      });

      if (init.method === "POST") {
        return new Response(null, {
          status: 204,
        });
      }

      return jsonResponse({
        data: {
          cas_required: true,
          current_version: 1,
          max_versions: 5,
          versions: {
            "1": {
              created_time:
                "2026-01-01T00:00:00Z",
              deletion_time: "",
              destroyed: false,
            },
          },
        },
      });
    }) as typeof fetch;

    const provider =
      new VaultProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            VAULT_TOKEN:
              "vault-token",
          }),
        instanceId:
          "primary",
        baseUrl:
          "https://vault.test/v1/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "vault.kv.metadata.update",
        {
          mount: "secret",
          path: "app/config",
          maxVersions: 5,
          casRequired: true,
          data: {
            password:
              "must-not-send",
          },
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({
      max_versions: 5,
      cas_required: true,
    });
    expect(
      JSON.stringify(
        calls[0]?.body,
      ),
    ).not.toContain(
      "must-not-send",
    );
  });

  it("classifies Kubernetes scale and Vault metadata mutation as step-up risks", () => {
    const secrets =
      new EnvironmentSecretResolver({
        KUBERNETES_TOKEN:
          "kube-token",
        VAULT_TOKEN:
          "vault-token",
      });

    const kubernetes =
      new KubernetesProvider({
        secretResolver: secrets,
        clusterId: "cluster",
      });
    const vault =
      new VaultProvider({
        secretResolver: secrets,
        instanceId: "vault",
      });

    expect(
      kubernetes
        .listCapabilities()
        .find(
          (capability) =>
            capability.name ===
            "kubernetes.deployment.scale",
        )?.risk,
    ).toBe("DESTRUCTIVE");

    expect(
      vault
        .listCapabilities()
        .find(
          (capability) =>
            capability.name ===
            "vault.kv.metadata.update",
        )?.risk,
    ).toBe("SECURITY");

    expect(
      vault
        .listCapabilities()
        .find(
          (capability) =>
            capability.name ===
            "vault.kv.metadata.delete",
        )?.risk,
    ).toBe("DESTRUCTIVE");
  });
});
