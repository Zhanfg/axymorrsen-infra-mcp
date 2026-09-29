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

const repoTargetSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const createRepoSchema = z.object({
  owner: z.string().min(1),
  ownerType:
    z.enum(["user", "org"]),
  name: z.string().min(1),
  description:
    z.string().optional(),
  private:
    z.boolean().default(false),
  autoInit:
    z.boolean().default(false),
});

const releaseSchema =
  repoTargetSchema.extend({
    tagName: z.string().min(1),
    name: z.string().optional(),
    body: z.string().optional(),
    draft:
      z.boolean().default(false),
    prerelease:
      z.boolean().default(false),
  });

export class GitHubProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "github",
    displayName: "GitHub",
    status: "available",
  };

  readonly #capabilities:
    Capability[] = [
      {
        name:
          "github.repository.get",
        description:
          "Read one GitHub repository.",
        risk: "READ",
        requiredScopes: [
          "github:repo:read",
        ],
        resourceKinds: [
          "github:repo",
        ],
        idempotent: true,
      },
      {
        name:
          "github.repository.create",
        description:
          "Create a GitHub repository for an explicitly named user or organization.",
        risk: "WRITE",
        requiredScopes: [
          "github:repo:create",
        ],
        resourceKinds: [
          "github:repo",
        ],
      },
      {
        name:
          "github.release.create",
        description:
          "Create a GitHub release for an existing repository.",
        risk: "WRITE",
        requiredScopes: [
          "github:release:write",
        ],
        resourceKinds: [
          "github:repo",
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
      id: "github",
      baseUrl:
        options.baseUrl ??
        "https://api.github.com/",
      credentialRef:
        options.credentialRef ??
        "env:GITHUB_TOKEN",
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
    action: string,
    input: unknown,
  ): readonly string[] {
    if (
      action ===
      "github.repository.create"
    ) {
      const parsed =
        createRepoSchema.safeParse(
          input,
        );
      return parsed.success
        ? [
            `github:repo:${parsed.data.owner}/${parsed.data.name}`,
          ]
        : [];
    }

    const parsed =
      repoTargetSchema.safeParse(
        input,
      );
    return parsed.success
      ? [
          `github:repo:${parsed.data.owner}/${parsed.data.repo}`,
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
      accept:
        "application/vnd.github+json",
      authorization:
        `Bearer ${token.data}`,
      "x-github-api-version":
        "2022-11-28",
    };

    if (
      action ===
      "github.repository.get"
    ) {
      const parsed =
        repoTargetSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `repos/${encodeURIComponent(parsed.data.owner)}/${encodeURIComponent(parsed.data.repo)}`,
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
      action ===
      "github.repository.create"
    ) {
      const parsed =
        createRepoSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      if (
        parsed.data.ownerType ===
        "user"
      ) {
        const me =
          await this.http.request(
            "user",
            {
              method: "GET",
              headers,
            },
          );

        if (!me.ok) return me;

        const login =
          objectValue(me.data).login;
        if (
          typeof login !== "string" ||
          login.toLowerCase() !==
            parsed.data.owner.toLowerCase()
        ) {
          return {
            ok: false,
            error: {
              code:
                "owner_mismatch",
              message:
                "authenticated GitHub user does not match requested owner",
            },
          };
        }
      }

      const endpoint =
        parsed.data.ownerType ===
        "org"
          ? `orgs/${encodeURIComponent(parsed.data.owner)}/repos`
          : "user/repos";

      const body = {
        name: parsed.data.name,
        ...(parsed.data.description
          ? {
              description:
                parsed.data
                  .description,
            }
          : {}),
        private:
          parsed.data.private,
        auto_init:
          parsed.data.autoInit,
      };

      const result =
        await this.http.request(
          endpoint,
          {
            method: "POST",
            headers: {
              ...headers,
              ...jsonBody(body)
                .headers,
            },
            body:
              jsonBody(body).body,
          },
        );

      return sanitizeRepository(
        result,
      );
    }

    if (
      action ===
      "github.release.create"
    ) {
      const parsed =
        releaseSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const body = {
        tag_name:
          parsed.data.tagName,
        ...(parsed.data.name
          ? {
              name:
                parsed.data.name,
            }
          : {}),
        ...(parsed.data.body
          ? {
              body:
                parsed.data.body,
            }
          : {}),
        draft:
          parsed.data.draft,
        prerelease:
          parsed.data.prerelease,
      };

      const result =
        await this.http.request(
          `repos/${encodeURIComponent(parsed.data.owner)}/${encodeURIComponent(parsed.data.repo)}/releases`,
          {
            method: "POST",
            headers: {
              ...headers,
              ...jsonBody(body)
                .headers,
            },
            body:
              jsonBody(body).body,
          },
        );

      if (!result.ok) return result;
      const value =
        objectValue(result.data);
      return {
        ok: true,
        data: {
          id: value.id,
          tag_name:
            value.tag_name,
          html_url:
            value.html_url,
          draft: value.draft,
          prerelease:
            value.prerelease,
        },
      };
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

function sanitizeRepository(
  result: ProviderResult,
): ProviderResult {
  if (!result.ok) return result;

  const value =
    objectValue(result.data);
  return {
    ok: true,
    data: {
      id: value.id,
      name: value.name,
      full_name:
        value.full_name,
      html_url:
        value.html_url,
      private: value.private,
      default_branch:
        value.default_branch,
    },
  };
}
