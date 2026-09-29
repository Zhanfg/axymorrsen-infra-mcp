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

const refSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/u);

const projectSchema = z.object({
  projectRef: refSchema,
});

const branchSchema =
  projectSchema.extend({
    branchName: z
      .string()
      .min(1)
      .max(128),
  });

const createBranchSchema =
  projectSchema.extend({
    branchName: z
      .string()
      .min(1)
      .max(128),
    gitBranch:
      z.string().min(1).optional(),
    persistent:
      z.boolean().default(false),
    withData:
      z.boolean().default(false),
    region:
      z.string().min(1).optional(),
  });

export class SupabaseProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "supabase",
    displayName: "Supabase",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name: "supabase.project.get",
      description:
        "Read one Supabase project without reading project secrets.",
      risk: "READ",
      requiredScopes: [
        "supabase:project:read",
      ],
      resourceKinds: [
        "supabase:project",
      ],
      idempotent: true,
    },
    {
      name: "supabase.branch.list",
      description:
        "List database branches for one Supabase project.",
      risk: "READ",
      requiredScopes: [
        "supabase:branch:read",
      ],
      resourceKinds: [
        "supabase:project",
      ],
      idempotent: true,
    },
    {
      name: "supabase.branch.get",
      description:
        "Read one database branch by project and branch name.",
      risk: "READ",
      requiredScopes: [
        "supabase:branch:read",
      ],
      resourceKinds: [
        "supabase:project",
      ],
      idempotent: true,
    },
    {
      name: "supabase.branch.create",
      description:
        "Create a database branch without accepting secret overrides.",
      risk: "WRITE",
      requiredScopes: [
        "supabase:branch:write",
      ],
      resourceKinds: [
        "supabase:project",
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
      id: "supabase",
      baseUrl:
        options.baseUrl ??
        "https://api.supabase.com/",
      credentialRef:
        options.credentialRef ??
        "env:SUPABASE_ACCESS_TOKEN",
      secretResolver:
        options.secretResolver,
      ...(options.fetchImpl
        ? { fetchImpl: options.fetchImpl }
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
      projectSchema.safeParse(input);
    return parsed.success
      ? [
          `supabase:project:${parsed.data.projectRef}`,
        ]
      : [];
  }

  async execute(
    action: string,
    input: unknown,
    _context: ExecutionContext,
  ): Promise<ProviderResult> {
    const token = await this.token();
    if (!token.ok || !token.data) {
      return token;
    }

    const headers = {
      authorization:
        `Bearer ${token.data}`,
      accept: "application/json",
    };

    if (
      action ===
      "supabase.project.get"
    ) {
      const parsed =
        projectSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          "v1/projects",
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      const projects =
        Array.isArray(result.data)
          ? result.data
          : [];

      const project =
        projects
          .map(objectValue)
          .find(
            (value) =>
              value.ref ===
              parsed.data.projectRef,
          );

      if (!project) {
        return {
          ok: false,
          error: {
            code:
              "project_not_found",
            message:
              "Supabase project was not found in the token-visible project list",
          },
        };
      }

      return {
        ok: true,
        data:
          sanitizeProject(project),
      };
    }

    if (
      action ===
      "supabase.branch.list"
    ) {
      const parsed =
        projectSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `v1/projects/${encodeURIComponent(parsed.data.projectRef)}/branches`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      return {
        ok: true,
        data: {
          branches:
            Array.isArray(
              result.data,
            )
              ? result.data.map(
                  sanitizeBranch,
                )
              : [],
        },
      };
    }

    if (
      action ===
      "supabase.branch.get"
    ) {
      const parsed =
        branchSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `v1/projects/${encodeURIComponent(parsed.data.projectRef)}/branches/${encodeURIComponent(parsed.data.branchName)}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      const branch =
        objectValue(result.data);
      if (
        branch.parent_project_ref !==
          parsed.data.projectRef &&
        branch.project_ref !==
          parsed.data.projectRef
      ) {
        return {
          ok: false,
          error: {
            code:
              "project_mismatch",
            message:
              "Supabase branch does not belong to the declared project",
          },
        };
      }

      return {
        ok: true,
        data:
          sanitizeBranch(branch),
      };
    }

    if (
      action ===
      "supabase.branch.create"
    ) {
      const parsed =
        createBranchSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const body = {
        branch_name:
          parsed.data.branchName,
        persistent:
          parsed.data.persistent,
        with_data:
          parsed.data.withData,
        ...(parsed.data.gitBranch
          ? {
              git_branch:
                parsed.data.gitBranch,
            }
          : {}),
        ...(parsed.data.region
          ? {
              region:
                parsed.data.region,
            }
          : {}),
      };

      const json = jsonBody(body);
      const result =
        await this.http.request(
          `v1/projects/${encodeURIComponent(parsed.data.projectRef)}/branches`,
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

      const branch =
        objectValue(result.data);
      if (
        branch.parent_project_ref &&
        branch.parent_project_ref !==
          parsed.data.projectRef
      ) {
        return {
          ok: false,
          error: {
            code:
              "project_mismatch",
            message:
              "Supabase created branch reported an unexpected parent project",
          },
        };
      }

      return {
        ok: true,
        data:
          sanitizeBranch(branch),
      };
    }

    return capabilityUnavailable();
  }
}

function sanitizeProject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const database =
    objectValue(value.database);

  return {
    id: value.id,
    ref: value.ref,
    organization_id:
      value.organization_id,
    organization_slug:
      value.organization_slug,
    name: value.name,
    region: value.region,
    status: value.status,
    created_at:
      value.created_at,
    database: {
      host: database.host,
      version: database.version,
      postgres_engine:
        database.postgres_engine,
      release_channel:
        database.release_channel,
    },
  };
}

function sanitizeBranch(
  value: unknown,
): Record<string, unknown> {
  const branch =
    objectValue(value);

  return {
    id: branch.id,
    name: branch.name,
    project_ref:
      branch.project_ref,
    parent_project_ref:
      branch.parent_project_ref,
    is_default:
      branch.is_default,
    git_branch:
      branch.git_branch,
    persistent:
      branch.persistent,
    status: branch.status,
    created_at:
      branch.created_at,
    updated_at:
      branch.updated_at,
    with_data:
      branch.with_data,
    deletion_scheduled_at:
      branch.deletion_scheduled_at,
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
