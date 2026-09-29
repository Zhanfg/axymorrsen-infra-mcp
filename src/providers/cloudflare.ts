import * as z from "zod/v4";
import type {
  Capability,
  ExecutionContext,
  ProviderDescriptor,
  ProviderResult,
} from "../core/types.js";
import type {
  Provider,
} from "../core/provider.js";
import type {
  SecretResolver,
} from "../secrets/resolver.js";
import {
  ProviderBase,
} from "./base.js";
import {
  jsonBody,
  objectValue,
  type FetchLike,
} from "./http.js";

const zoneSchema = z.object({
  zoneId: z.string().min(1),
});

const listSchema = zoneSchema.extend({
  type: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

const createSchema = zoneSchema.extend({
  type: z.string().min(1),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  proxied: z.boolean().optional(),
  comment: z.string().optional(),
});

const updateSchema = zoneSchema.extend({
  recordId: z.string().min(1),
  type: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  ttl: z.number().int().positive().optional(),
  proxied: z.boolean().optional(),
  comment: z.string().optional(),
});

const deleteSchema = zoneSchema.extend({
  recordId: z.string().min(1),
});

export class CloudflareProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "cloudflare",
    displayName: "Cloudflare",
    status: "available",
  };

  readonly #capabilities:
    Capability[] = [
      {
        name:
          "cloudflare.dns.list",
        description:
          "List DNS records in one Cloudflare zone.",
        risk: "READ",
        requiredScopes: [
          "cloudflare:dns:read",
        ],
        resourceKinds: [
          "cloudflare:zone",
        ],
        idempotent: true,
      },
      {
        name:
          "cloudflare.dns.create",
        description:
          "Create one DNS record in a Cloudflare zone.",
        risk: "WRITE",
        requiredScopes: [
          "cloudflare:dns:write",
        ],
        resourceKinds: [
          "cloudflare:zone",
        ],
      },
      {
        name:
          "cloudflare.dns.update",
        description:
          "Update one existing DNS record in a Cloudflare zone.",
        risk: "WRITE",
        requiredScopes: [
          "cloudflare:dns:write",
        ],
        resourceKinds: [
          "cloudflare:zone",
        ],
      },
      {
        name:
          "cloudflare.dns.delete",
        description:
          "Permanently delete one DNS record from a Cloudflare zone.",
        risk: "DESTRUCTIVE",
        requiredScopes: [
          "cloudflare:dns:write",
        ],
        resourceKinds: [
          "cloudflare:zone",
        ],
      },
    ];

  constructor(options: {
    secretResolver: SecretResolver;
    credentialRef?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
  }) {
    super({
      id: "cloudflare",
      baseUrl:
        options.baseUrl ??
        "https://api.cloudflare.com/client/v4/",
      credentialRef:
        options.credentialRef ??
        "env:CLOUDFLARE_API_TOKEN",
      secretResolver:
        options.secretResolver,
      ...(options.fetchImpl
        ? {
            fetchImpl:
              options.fetchImpl,
          }
        : {}),
    });
  }

  healthCheck() {
    return this.credentialHealth();
  }

  listCapabilities() {
    return this.#capabilities;
  }

  resolveResources(
    _action: string,
    input: unknown,
  ): readonly string[] {
    const parsed =
      zoneSchema.safeParse(input);
    return parsed.success
      ? [
          `cloudflare:zone:${parsed.data.zoneId}`,
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
      authorization:
        `Bearer ${token.data}`,
    };

    if (
      action ===
      "cloudflare.dns.list"
    ) {
      const parsed =
        listSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const query =
        new URLSearchParams();
      if (parsed.data.type) {
        query.set(
          "type",
          parsed.data.type,
        );
      }
      if (parsed.data.name) {
        query.set(
          "name",
          parsed.data.name,
        );
      }

      const suffix =
        query.size > 0
          ? `?${query.toString()}`
          : "";

      const result =
        await this.http.request(
          `zones/${encodeURIComponent(parsed.data.zoneId)}/dns_records${suffix}`,
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeCloudflare(
        result,
      );
    }

    if (
      action ===
      "cloudflare.dns.create"
    ) {
      const parsed =
        createSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const {
        zoneId,
        ...body
      } = parsed.data;
      const json = jsonBody(body);

      return sanitizeCloudflare(
        await this.http.request(
          `zones/${encodeURIComponent(zoneId)}/dns_records`,
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        ),
      );
    }

    if (
      action ===
      "cloudflare.dns.update"
    ) {
      const parsed =
        updateSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const {
        zoneId,
        recordId,
        ...body
      } = parsed.data;
      const json = jsonBody(body);

      return sanitizeCloudflare(
        await this.http.request(
          `zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
          {
            method: "PATCH",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        ),
      );
    }

    if (
      action ===
      "cloudflare.dns.delete"
    ) {
      const parsed =
        deleteSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      return sanitizeCloudflare(
        await this.http.request(
          `zones/${encodeURIComponent(parsed.data.zoneId)}/dns_records/${encodeURIComponent(parsed.data.recordId)}`,
          {
            method: "DELETE",
            headers,
          },
        ),
      );
    }

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

function sanitizeCloudflare(
  result: ProviderResult,
): ProviderResult {
  if (!result.ok) return result;

  const envelope =
    objectValue(result.data);
  if (
    envelope.success === false
  ) {
    return {
      ok: false,
      error: {
        code:
          "cloudflare_api_error",
        message:
          "Cloudflare API reported an error",
      },
    };
  }

  return {
    ok: true,
    data: {
      result: envelope.result,
      result_info:
        envelope.result_info,
    },
  };
}
