import * as z from "zod/v4";
import type {
  Capability,
  ExecutionContext,
  HealthStatus,
  ProviderDescriptor,
  ProviderResult,
} from "../core/types.js";
import type { Provider } from "../core/provider.js";
import type { SecretResolver } from "../secrets/resolver.js";
import {
  jsonBody,
  objectValue,
  ProviderHttpClient,
  type FetchLike,
} from "./http.js";

const segmentSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);

const repositorySchema = z.object({
  namespace: segmentSchema,
  repository: segmentSchema,
});

const tagSchema =
  repositorySchema.extend({
    tag: z
      .string()
      .regex(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/u),
  });

const createSchema = z.object({
  namespace: segmentSchema,
  name: segmentSchema,
  description:
    z.string().max(1000).optional(),
  fullDescription:
    z.string().max(10000).optional(),
  isPrivate:
    z.boolean().default(false),
});

interface CachedToken {
  value: string;
  expiresAtMs: number;
}

export class DockerHubProvider
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "docker",
    displayName: "Docker Hub",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name: "docker.repository.get",
      description:
        "Read one Docker Hub repository from a namespace.",
      risk: "READ",
      requiredScopes: [
        "docker:repo:read",
      ],
      resourceKinds: [
        "docker:repo",
      ],
      idempotent: true,
    },
    {
      name: "docker.tag.list",
      description:
        "List tags for one Docker Hub repository.",
      risk: "READ",
      requiredScopes: [
        "docker:repo:read",
      ],
      resourceKinds: [
        "docker:repo",
      ],
      idempotent: true,
    },
    {
      name: "docker.tag.get",
      description:
        "Read one tag in a Docker Hub repository.",
      risk: "READ",
      requiredScopes: [
        "docker:repo:read",
      ],
      resourceKinds: [
        "docker:repo",
      ],
      idempotent: true,
    },
    {
      name: "docker.repository.create",
      description:
        "Create one Docker Hub repository in an explicitly authorized namespace.",
      risk: "WRITE",
      requiredScopes: [
        "docker:repo:create",
      ],
      resourceKinds: [
        "docker:repo",
      ],
    },
  ];

  readonly #http:
    ProviderHttpClient;
  readonly #secretResolver:
    SecretResolver;
  readonly #identifierRef: string;
  readonly #secretRef: string;
  #cachedToken:
    CachedToken | undefined;

  constructor(options: {
    secretResolver: SecretResolver;
    identifierRef?: string;
    secretRef?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
  }) {
    this.#secretResolver =
      options.secretResolver;
    this.#identifierRef =
      options.identifierRef ??
      "env:DOCKERHUB_IDENTIFIER";
    this.#secretRef =
      options.secretRef ??
      "env:DOCKERHUB_SECRET";
    this.#http =
      new ProviderHttpClient({
        baseUrl: new URL(
          options.baseUrl ??
          "https://hub.docker.com/",
        ),
        ...(options.fetchImpl
          ? {
              fetchImpl:
                options.fetchImpl,
            }
          : {}),
      });
  }

  async healthCheck():
    Promise<HealthStatus> {
    try {
      await Promise.all([
        this.#secretResolver.resolve(
          this.#identifierRef,
        ),
        this.#secretResolver.resolve(
          this.#secretRef,
        ),
      ]);

      return {
        ok: true,
        provider: "docker",
      };
    } catch {
      return {
        ok: false,
        provider: "docker",
        message:
          "credential unavailable",
      };
    }
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
      "docker.repository.create"
    ) {
      const parsed =
        createSchema.safeParse(input);
      return parsed.success
        ? [
            `docker:repo:${parsed.data.namespace}/${parsed.data.name}`,
          ]
        : [];
    }

    const parsed =
      repositorySchema.safeParse(
        input,
      );
    return parsed.success
      ? [
          `docker:repo:${parsed.data.namespace}/${parsed.data.repository}`,
        ]
      : [];
  }

  async execute(
    action: string,
    input: unknown,
    _context: ExecutionContext,
  ): Promise<ProviderResult> {
    const access =
      await this.accessToken();
    if (!access.ok || !access.data) {
      return access;
    }

    const headers = {
      authorization:
        `Bearer ${access.data}`,
      accept: "application/json",
    };

    if (
      action ===
      "docker.repository.get"
    ) {
      const parsed =
        repositorySchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.#http.request(
          repositoryPath(
            parsed.data.namespace,
            parsed.data.repository,
          ),
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeRepository(
        result,
      );
    }

    if (
      action === "docker.tag.list"
    ) {
      const parsed =
        repositorySchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.#http.request(
          `${repositoryPath(
            parsed.data.namespace,
            parsed.data.repository,
          )}/tags`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      const envelope =
        objectValue(result.data);
      const tags = Array.isArray(
        envelope.results,
      )
        ? envelope.results.map(
            sanitizeTag,
          )
        : Array.isArray(
              envelope.tags,
            )
          ? envelope.tags.map(
              sanitizeTag,
            )
          : [];

      return {
        ok: true,
        data: {
          tags,
          next: envelope.next,
          previous:
            envelope.previous,
          count: envelope.count,
        },
      };
    }

    if (
      action === "docker.tag.get"
    ) {
      const parsed =
        tagSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.#http.request(
          `${repositoryPath(
            parsed.data.namespace,
            parsed.data.repository,
          )}/tags/${encodeURIComponent(parsed.data.tag)}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeTag(result.data),
      };
    }

    if (
      action ===
      "docker.repository.create"
    ) {
      const parsed =
        createSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const body = {
        name: parsed.data.name,
        namespace:
          parsed.data.namespace,
        registry: "docker.io",
        is_private:
          parsed.data.isPrivate,
        ...(parsed.data.description
          ? {
              description:
                parsed.data.description,
            }
          : {}),
        ...(parsed.data
          .fullDescription
          ? {
              full_description:
                parsed.data
                  .fullDescription,
            }
          : {}),
      };

      const json = jsonBody(body);
      const result =
        await this.#http.request(
          `v2/namespaces/${encodeURIComponent(parsed.data.namespace)}/repositories`,
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        );

      return sanitizeRepository(
        result,
      );
    }

    return capabilityUnavailable();
  }

  private async accessToken():
    Promise<ProviderResult<string>> {
    const cached =
      this.#cachedToken;

    if (
      cached &&
      cached.expiresAtMs -
        Date.now() >
        30_000
    ) {
      return {
        ok: true,
        data: cached.value,
      };
    }

    try {
      const [
        identifier,
        secret,
      ] = await Promise.all([
        this.#secretResolver.resolve(
          this.#identifierRef,
        ),
        this.#secretResolver.resolve(
          this.#secretRef,
        ),
      ]);

      const json = jsonBody({
        identifier:
          identifier.reveal(),
        secret: secret.reveal(),
      });

      const result =
        await this.#http.request(
          "v2/auth/token",
          {
            method: "POST",
            headers: {
              accept:
                "application/json",
              ...json.headers,
            },
            body: json.body,
          },
        );

      if (!result.ok) {
        return result;
      }

      const accessToken =
        objectValue(result.data)
          .access_token;

      if (
        typeof accessToken !==
          "string" ||
        accessToken.length === 0
      ) {
        return {
          ok: false,
          error: {
            code:
              "docker_auth_invalid_response",
            message:
              "Docker Hub authentication did not return an access token",
          },
        };
      }

      this.#cachedToken = {
        value: accessToken,
        expiresAtMs:
          jwtExpiryMs(
            accessToken,
          ) ??
          Date.now() + 60_000,
      };

      return {
        ok: true,
        data: accessToken,
      };
    } catch {
      return {
        ok: false,
        error: {
          code:
            "credential_unavailable",
          message:
            "Docker Hub credential is unavailable",
        },
      };
    }
  }
}

function repositoryPath(
  namespace: string,
  repository: string,
): string {
  return `v2/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(repository)}`;
}

function sanitizeRepository(
  result: ProviderResult,
): ProviderResult {
  if (!result.ok) return result;

  const value =
    objectValue(result.data);
  const permissions =
    objectValue(value.permissions);

  return {
    ok: true,
    data: {
      name: value.name,
      namespace:
        value.namespace,
      description:
        value.description,
      full_description:
        value.full_description,
      is_private:
        value.is_private,
      status: value.status,
      status_description:
        value.status_description,
      pull_count:
        value.pull_count,
      star_count:
        value.star_count,
      storage_size:
        value.storage_size,
      last_updated:
        value.last_updated,
      permissions: {
        read: permissions.read,
        write:
          permissions.write,
        admin:
          permissions.admin,
      },
    },
  };
}

function sanitizeTag(
  value: unknown,
): Record<string, unknown> {
  const tag = objectValue(value);

  return {
    id: tag.id,
    name: tag.name,
    full_size:
      tag.full_size,
    last_updated:
      tag.last_updated,
    last_updater_username:
      tag.last_updater_username,
    tag_status:
      tag.tag_status,
    images: tag.images,
  };
}

function jwtExpiryMs(
  token: string,
): number | undefined {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart) return undefined;

  try {
    const payload = JSON.parse(
      Buffer.from(
        payloadPart,
        "base64url",
      ).toString("utf8"),
    ) as Record<
      string,
      unknown
    >;

    return typeof payload.exp ===
      "number"
      ? payload.exp * 1000
      : undefined;
  } catch {
    return undefined;
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
