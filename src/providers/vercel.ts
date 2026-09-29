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
  objectValue,
  type FetchLike,
} from "./http.js";

const idSegment = z
  .string()
  .regex(/^[A-Za-z0-9._-]+$/u);

const projectSchema = z.object({
  teamId: idSegment,
  projectId: idSegment,
});

const deploymentSchema =
  projectSchema.extend({
    deploymentId: idSegment,
  });

export class VercelProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "vercel",
    displayName: "Vercel",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name: "vercel.project.get",
      description:
        "Read one Vercel project in an explicitly named team.",
      risk: "READ",
      requiredScopes: [
        "vercel:project:read",
      ],
      resourceKinds: [
        "vercel:project",
      ],
      idempotent: true,
    },
    {
      name:
        "vercel.deployment.list",
      description:
        "List deployments for one Vercel project.",
      risk: "READ",
      requiredScopes: [
        "vercel:deployment:read",
      ],
      resourceKinds: [
        "vercel:project",
      ],
      idempotent: true,
    },
    {
      name:
        "vercel.deployment.cancel",
      description:
        "Cancel one Vercel deployment after verifying it belongs to the authorized project.",
      risk: "WRITE",
      requiredScopes: [
        "vercel:deployment:write",
      ],
      resourceKinds: [
        "vercel:project",
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
      id: "vercel",
      baseUrl:
        options.baseUrl ??
        "https://api.vercel.com/",
      credentialRef:
        options.credentialRef ??
        "env:VERCEL_TOKEN",
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
          `vercel:project:${parsed.data.teamId}/${parsed.data.projectId}`,
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

    if (action === "vercel.project.get") {
      const parsed =
        projectSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `v9/projects/${encodeURIComponent(parsed.data.projectId)}?teamId=${encodeURIComponent(parsed.data.teamId)}`,
          {
            method: "GET",
            headers,
          },
        );

      return sanitizeProject(result);
    }

    if (
      action ===
      "vercel.deployment.list"
    ) {
      const parsed =
        projectSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const query =
        new URLSearchParams({
          teamId: parsed.data.teamId,
          projectId:
            parsed.data.projectId,
        });

      const result =
        await this.http.request(
          `v6/deployments?${query.toString()}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      const value =
        objectValue(result.data);
      const deployments =
        Array.isArray(
          value.deployments,
        )
          ? value.deployments.map(
              sanitizeDeploymentValue,
            )
          : [];

      return {
        ok: true,
        data: {
          deployments,
          pagination:
            value.pagination,
        },
      };
    }

    if (
      action ===
      "vercel.deployment.cancel"
    ) {
      const parsed =
        deploymentSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const lookup =
        await this.http.request(
          `v13/deployments/${encodeURIComponent(parsed.data.deploymentId)}?teamId=${encodeURIComponent(parsed.data.teamId)}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!lookup.ok) return lookup;

      const deployment =
        objectValue(lookup.data);
      if (
        deployment.projectId !==
        parsed.data.projectId
      ) {
        return {
          ok: false,
          error: {
            code:
              "project_mismatch",
            message:
              "Vercel deployment does not belong to the declared project",
          },
        };
      }

      const result =
        await this.http.request(
          `v12/deployments/${encodeURIComponent(parsed.data.deploymentId)}/cancel?teamId=${encodeURIComponent(parsed.data.teamId)}`,
          {
            method: "PATCH",
            headers,
          },
        );

      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeDeploymentValue(
            result.data,
          ),
      };
    }

    return capabilityUnavailable();
  }
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
      framework: value.framework,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      latestDeployments:
        value.latestDeployments,
    },
  };
}

function sanitizeDeploymentValue(
  value: unknown,
): Record<string, unknown> {
  const deployment =
    objectValue(value);

  return {
    id: deployment.id,
    name: deployment.name,
    url: deployment.url,
    projectId:
      deployment.projectId,
    state: deployment.state,
    readyState:
      deployment.readyState,
    target: deployment.target,
    createdAt:
      deployment.createdAt,
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
