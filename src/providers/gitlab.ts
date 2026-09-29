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

const projectSchema = z.object({
  pathWithNamespace:
    z.string().min(3),
});

const createProjectSchema =
  z.object({
    namespaceId:
      z.number().int().positive(),
    namespacePath:
      z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
    description:
      z.string().optional(),
    visibility: z
      .enum([
        "private",
        "internal",
        "public",
      ])
      .default("private"),
    initializeWithReadme:
      z.boolean().default(false),
  });

export class GitLabProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "gitlab",
    displayName: "GitLab",
    status: "available",
  };

  readonly #capabilities:
    Capability[] = [
      {
        name:
          "gitlab.project.get",
        description:
          "Read one GitLab project.",
        risk: "READ",
        requiredScopes: [
          "gitlab:project:read",
        ],
        resourceKinds: [
          "gitlab:project",
        ],
        idempotent: true,
      },
      {
        name:
          "gitlab.project.create",
        description:
          "Create a GitLab project in a verified namespace.",
        risk: "WRITE",
        requiredScopes: [
          "gitlab:project:create",
        ],
        resourceKinds: [
          "gitlab:project",
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
      id: "gitlab",
      baseUrl:
        options.baseUrl ??
        "https://gitlab.com/api/v4/",
      credentialRef:
        options.credentialRef ??
        "env:GITLAB_TOKEN",
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
      "gitlab.project.create"
    ) {
      const parsed =
        createProjectSchema.safeParse(
          input,
        );
      return parsed.success
        ? [
            `gitlab:project:${parsed.data.namespacePath}/${parsed.data.path}`,
          ]
        : [];
    }

    const parsed =
      projectSchema.safeParse(
        input,
      );
    return parsed.success
      ? [
          `gitlab:project:${parsed.data.pathWithNamespace}`,
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
      "gitlab.project.get"
    ) {
      const parsed =
        projectSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `projects/${encodeURIComponent(parsed.data.pathWithNamespace)}`,
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeProject(
        result,
      );
    }

    if (
      action ===
      "gitlab.project.create"
    ) {
      const parsed =
        createProjectSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const namespace =
        await this.http.request(
          `namespaces/${parsed.data.namespaceId}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!namespace.ok) {
        return namespace;
      }

      const fullPath =
        objectValue(namespace.data)
          .full_path;
      if (
        typeof fullPath !==
          "string" ||
        fullPath !==
          parsed.data.namespacePath
      ) {
        return {
          ok: false,
          error: {
            code:
              "namespace_mismatch",
            message:
              "GitLab namespace ID does not match requested namespace path",
          },
        };
      }

      const body = {
        namespace_id:
          parsed.data.namespaceId,
        name: parsed.data.name,
        path: parsed.data.path,
        visibility:
          parsed.data.visibility,
        initialize_with_readme:
          parsed.data
            .initializeWithReadme,
        ...(parsed.data.description
          ? {
              description:
                parsed.data
                  .description,
            }
          : {}),
      };

      const json = jsonBody(body);
      const result =
        await this.http.request(
          "projects",
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        );

      return sanitizeProject(
        result,
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

function sanitizeProject(
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
      path_with_namespace:
        value.path_with_namespace,
      web_url: value.web_url,
      visibility:
        value.visibility,
      default_branch:
        value.default_branch,
    },
  };
}
