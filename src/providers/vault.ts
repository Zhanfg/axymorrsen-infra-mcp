import * as z from "zod/v4";
import type {
  Capability,
  ExecutionContext,
  ProviderDescriptor,
  ProviderResult,
} from "../core/types.js";
import type { Provider } from "../core/provider.js";
import type { SecretResolver } from "../secrets/resolver.js";
import { ProviderBase } from "./base.js";
import {
  jsonBody,
  objectValue,
  type FetchLike,
} from "./http.js";

const mountSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]+$/u,
  );

const secretPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.includes("*") &&
      !value.includes("//") &&
      !value
        .split("/")
        .some(
          (part) =>
            part === "." ||
            part === ".." ||
            part.length === 0,
        ),
    {
      message:
        "invalid Vault secret path",
    },
  );

const kvSchema = z.object({
  mount: mountSchema,
  path: secretPathSchema,
});

const listSchema = z.object({
  mount: mountSchema,
  path: z
    .string()
    .max(1024)
    .default("")
    .refine(
      (value) =>
        !value.includes("*") &&
        !value.includes("//") &&
        !value
          .split("/")
          .filter(Boolean)
          .some(
            (part) =>
              part === "." ||
              part === "..",
          ),
      {
        message:
          "invalid Vault list path",
      },
    ),
  excludeDeleted:
    z.boolean().default(false),
});

const updateSchema =
  kvSchema.extend({
    maxVersions: z
      .number()
      .int()
      .min(0)
      .optional(),
    casRequired:
      z.boolean().optional(),
    deleteVersionAfter: z
      .string()
      .min(1)
      .max(64)
      .optional(),
  })
  .refine(
    (value) =>
      value.maxVersions !==
        undefined ||
      value.casRequired !==
        undefined ||
      value.deleteVersionAfter !==
        undefined,
    {
      message:
        "at least one metadata setting is required",
    },
  );

export class VaultProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "vault",
    displayName: "HashiCorp Vault",
    status: "available",
  };

  readonly #instanceId: string;
  readonly #vaultNamespace:
    string | undefined;

  readonly #capabilities:
    Capability[] = [
      {
        name: "vault.health.get",
        description:
          "Read Vault health status without returning secret values.",
        risk: "READ",
        requiredScopes: [
          "vault:health:read",
        ],
        resourceKinds: [
          "vault:instance",
        ],
        idempotent: true,
      },
      {
        name:
          "vault.kv.metadata.list",
        description:
          "List KV v2 metadata keys only; secret values are never read.",
        risk: "READ",
        requiredScopes: [
          "vault:kv:metadata:read",
        ],
        resourceKinds: [
          "vault:kv",
        ],
        idempotent: true,
      },
      {
        name:
          "vault.kv.metadata.get",
        description:
          "Read KV v2 secret metadata and version metadata without reading secret values.",
        risk: "READ",
        requiredScopes: [
          "vault:kv:metadata:read",
        ],
        resourceKinds: [
          "vault:kv",
        ],
        idempotent: true,
      },
      {
        name:
          "vault.kv.metadata.update",
        description:
          "Update KV v2 retention/CAS metadata only. Secret values cannot be supplied. Requires step-up authorization.",
        risk: "SECURITY",
        requiredScopes: [
          "vault:kv:metadata:write",
        ],
        resourceKinds: [
          "vault:kv",
        ],
      },
      {
        name:
          "vault.kv.metadata.delete",
        description:
          "Permanently delete KV v2 metadata and all versions for one exact key. Requires step-up authorization.",
        risk: "DESTRUCTIVE",
        requiredScopes: [
          "vault:kv:metadata:delete",
        ],
        resourceKinds: [
          "vault:kv",
        ],
      },
    ];

  constructor(options: {
    secretResolver: SecretResolver;
    instanceId: string;
    vaultNamespace?: string;
    credentialRef?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
  }) {
    super({
      id: "vault",
      baseUrl:
        options.baseUrl ??
        "https://127.0.0.1:8200/v1/",
      credentialRef:
        options.credentialRef ??
        "env:VAULT_TOKEN",
      secretResolver:
        options.secretResolver,
      ...(options.fetchImpl
        ? {
            fetchImpl:
              options.fetchImpl,
          }
        : {}),
    });

    if (
      !/^[A-Za-z0-9._-]+$/u.test(
        options.instanceId,
      )
    ) {
      throw new Error(
        "invalid Vault instance ID",
      );
    }

    this.#instanceId =
      options.instanceId;
    this.#vaultNamespace =
      options.vaultNamespace;
  }

  healthCheck() {
    return this.credentialHealth();
  }

  listCapabilities() {
    return this.#capabilities;
  }

  resolveResources(
    action: string,
    input: unknown,
  ): readonly string[] {
    if (
      action ===
      "vault.health.get"
    ) {
      return [
        `vault:instance:${this.#instanceId}`,
      ];
    }

    if (
      action ===
      "vault.kv.metadata.list"
    ) {
      const parsed =
        listSchema.safeParse(input);
      if (!parsed.success) {
        return [];
      }

      const suffix =
        parsed.data.path
          ? `/${parsed.data.path}`
          : "";

      return [
        `vault:kv:${this.#instanceId}/${parsed.data.mount}${suffix}`,
      ];
    }

    const parsed =
      kvSchema.safeParse(input);
    return parsed.success
      ? [
          `vault:kv:${this.#instanceId}/${parsed.data.mount}/${parsed.data.path}`,
        ]
      : [];
  }

  async execute(
    action: string,
    input: unknown,
    _context: ExecutionContext,
  ): Promise<ProviderResult> {
    const token =
      await this.token();
    if (!token.ok || !token.data) {
      return token;
    }

    const headers = {
      "x-vault-token":
        token.data,
      accept:
        "application/json",
      ...(this.#vaultNamespace
        ? {
            "x-vault-namespace":
              this.#vaultNamespace,
          }
        : {}),
    };

    if (
      action === "vault.health.get"
    ) {
      const result =
        await this.http.request(
          "sys/health?standbyok=true&perfstandbyok=true",
          {
            method: "GET",
            headers,
          },
        );
      if (!result.ok) return result;

      const value =
        objectValue(result.data);

      return {
        ok: true,
        data: {
          initialized:
            value.initialized,
          sealed: value.sealed,
          standby: value.standby,
          performance_standby:
            value.performance_standby,
          replication_performance_mode:
            value.replication_performance_mode,
          replication_dr_mode:
            value.replication_dr_mode,
          server_time_utc:
            value.server_time_utc,
          version: value.version,
          cluster_name:
            value.cluster_name,
          cluster_id:
            value.cluster_id,
        },
      };
    }

    if (
      action ===
      "vault.kv.metadata.list"
    ) {
      const parsed =
        listSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const path =
        parsed.data.path
          ? `/${parsed.data.path}`
          : "";

      const query =
        parsed.data.excludeDeleted
          ? "?exclude_deleted=true"
          : "";

      const result =
        await this.http.request(
          `${encodeURIComponent(parsed.data.mount)}/metadata${path}${query}`,
          {
            method: "LIST",
            headers,
          },
        );
      if (!result.ok) return result;

      const data =
        objectValue(
          objectValue(result.data)
            .data,
        );

      return {
        ok: true,
        data: {
          keys:
            Array.isArray(data.keys)
              ? data.keys.filter(
                  (value):
                    value is string =>
                    typeof value ===
                    "string",
                )
              : [],
        },
      };
    }

    if (
      action ===
      "vault.kv.metadata.get"
    ) {
      const parsed =
        kvSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          metadataPath(
            parsed.data.mount,
            parsed.data.path,
          ),
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeMetadata(
        result,
      );
    }

    if (
      action ===
      "vault.kv.metadata.update"
    ) {
      const parsed =
        updateSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const body = {
        ...(parsed.data.maxVersions !==
        undefined
          ? {
              max_versions:
                parsed.data
                  .maxVersions,
            }
          : {}),
        ...(parsed.data.casRequired !==
        undefined
          ? {
              cas_required:
                parsed.data
                  .casRequired,
            }
          : {}),
        ...(parsed.data
          .deleteVersionAfter
          ? {
              delete_version_after:
                parsed.data
                  .deleteVersionAfter,
            }
          : {}),
      };

      const json = jsonBody(body);
      const result =
        await this.http.request(
          metadataPath(
            parsed.data.mount,
            parsed.data.path,
          ),
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        );

      if (!result.ok) return result;

      const verify =
        await this.http.request(
          metadataPath(
            parsed.data.mount,
            parsed.data.path,
          ),
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeMetadata(
        verify,
      );
    }

    if (
      action ===
      "vault.kv.metadata.delete"
    ) {
      const parsed =
        kvSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          metadataPath(
            parsed.data.mount,
            parsed.data.path,
          ),
          {
            method: "DELETE",
            headers,
          },
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data: {
          deleted: true,
          mount:
            parsed.data.mount,
          path: parsed.data.path,
        },
      };
    }

    return capabilityUnavailable();
  }
}

function metadataPath(
  mount: string,
  path: string,
): string {
  return `${encodeURIComponent(mount)}/metadata/${path
    .split("/")
    .map((part) =>
      encodeURIComponent(part),
    )
    .join("/")}`;
}

function sanitizeMetadata(
  result: ProviderResult,
): ProviderResult {
  if (!result.ok) return result;

  const data =
    objectValue(
      objectValue(result.data).data,
    );
  const rawVersions =
    objectValue(data.versions);
  const versions:
    Record<string, unknown> = {};

  for (
    const [
      version,
      raw,
    ] of Object.entries(
      rawVersions,
    )
  ) {
    const value =
      objectValue(raw);
    versions[version] = {
      created_time:
        value.created_time,
      deletion_time:
        value.deletion_time,
      destroyed:
        value.destroyed,
    };
  }

  return {
    ok: true,
    data: {
      cas_required:
        data.cas_required,
      created_time:
        data.created_time,
      current_version:
        data.current_version,
      delete_version_after:
        data.delete_version_after,
      max_versions:
        data.max_versions,
      oldest_version:
        data.oldest_version,
      updated_time:
        data.updated_time,
      versions,
    },
  };
}

function invalidInput(): ProviderResult {
  return {
    ok: false,
    error: {
      code: "invalid_input",
      message:
        "provider input is invalid",
    },
  };
}

function capabilityUnavailable(): ProviderResult {
  return {
    ok: false,
    error: {
      code:
        "capability_not_available",
      message:
        "capability is not available",
    },
  };
}
