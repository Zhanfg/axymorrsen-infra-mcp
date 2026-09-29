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

const nameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/u);

const workspaceSchema = z.object({
  organization: nameSchema,
  workspace: nameSchema,
});

const runSchema =
  workspaceSchema.extend({
    runId: z
      .string()
      .regex(/^run-[A-Za-z0-9]+$/u),
  });

const planSchema =
  workspaceSchema.extend({
    message: z
      .string()
      .max(512)
      .optional(),
    configurationVersionId: z
      .string()
      .regex(/^cv-[A-Za-z0-9]+$/u)
      .optional(),
  });

const actionSchema =
  runSchema.extend({
    comment: z
      .string()
      .max(512)
      .optional(),
  });

export class TerraformProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "terraform",
    displayName:
      "HCP Terraform",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name:
        "terraform.workspace.get",
      description:
        "Read one HCP Terraform workspace by organization and workspace name.",
      risk: "READ",
      requiredScopes: [
        "terraform:workspace:read",
      ],
      resourceKinds: [
        "terraform:workspace",
      ],
      idempotent: true,
    },
    {
      name:
        "terraform.run.list",
      description:
        "List recent HCP Terraform runs in one authorized workspace.",
      risk: "READ",
      requiredScopes: [
        "terraform:run:read",
      ],
      resourceKinds: [
        "terraform:workspace",
      ],
      idempotent: true,
    },
    {
      name:
        "terraform.run.plan",
      description:
        "Queue a plan-only HCP Terraform run. This capability cannot auto-apply infrastructure changes.",
      risk: "DEPLOY",
      requiredScopes: [
        "terraform:run:plan",
      ],
      resourceKinds: [
        "terraform:workspace",
      ],
    },
    {
      name:
        "terraform.run.apply",
      description:
        "Apply a paused HCP Terraform run after verifying workspace ownership. This may change or destroy infrastructure and requires step-up authorization.",
      risk: "DESTRUCTIVE",
      requiredScopes: [
        "terraform:run:apply",
      ],
      resourceKinds: [
        "terraform:workspace",
      ],
    },
    {
      name:
        "terraform.run.cancel",
      description:
        "Request safe cancellation of an HCP Terraform run after verifying workspace ownership.",
      risk: "WRITE",
      requiredScopes: [
        "terraform:run:cancel",
      ],
      resourceKinds: [
        "terraform:workspace",
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
      id: "terraform",
      baseUrl:
        options.baseUrl ??
        "https://app.terraform.io/api/v2/",
      credentialRef:
        options.credentialRef ??
        "env:TFC_TOKEN",
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
      workspaceSchema.safeParse(input);
    return parsed.success
      ? [
          `terraform:workspace:${parsed.data.organization}/${parsed.data.workspace}`,
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
      accept:
        "application/vnd.api+json",
    };

    if (
      action ===
      "terraform.workspace.get"
    ) {
      const parsed =
        workspaceSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.getWorkspace(
          headers,
          parsed.data.organization,
          parsed.data.workspace,
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeWorkspace(
            result.data,
          ),
      };
    }

    if (
      action ===
      "terraform.run.list"
    ) {
      const parsed =
        workspaceSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const workspace =
        await this.getWorkspace(
          headers,
          parsed.data.organization,
          parsed.data.workspace,
        );
      if (!workspace.ok) {
        return workspace;
      }

      const workspaceId =
        objectValue(workspace.data).id;
      if (
        typeof workspaceId !== "string"
      ) {
        return verificationFailed();
      }

      const result =
        await this.http.request(
          `workspaces/${encodeURIComponent(workspaceId)}/runs`,
          {
            method: "GET",
            headers,
          },
        );
      if (!result.ok) return result;

      const envelope =
        objectValue(result.data);

      return {
        ok: true,
        data: {
          runs: Array.isArray(
            envelope.data,
          )
            ? envelope.data.map(
                sanitizeRun,
              )
            : [],
          meta: envelope.meta,
          links: envelope.links,
        },
      };
    }

    if (
      action ===
      "terraform.run.plan"
    ) {
      const parsed =
        planSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const workspace =
        await this.getWorkspace(
          headers,
          parsed.data.organization,
          parsed.data.workspace,
        );
      if (!workspace.ok) {
        return workspace;
      }

      const workspaceId =
        objectValue(workspace.data).id;
      if (
        typeof workspaceId !== "string"
      ) {
        return verificationFailed();
      }

      const relationships:
        Record<string, unknown> = {
          workspace: {
            data: {
              type: "workspaces",
              id: workspaceId,
            },
          },
      };

      if (
        parsed.data
          .configurationVersionId
      ) {
        relationships.configuration_version = {
          data: {
            type:
              "configuration-versions",
            id:
              parsed.data
                .configurationVersionId,
          },
        };
      }

      const body = {
        data: {
          type: "runs",
          attributes: {
            "plan-only": true,
            ...(parsed.data.message
              ? {
                  message:
                    parsed.data.message,
                }
              : {}),
          },
          relationships,
        },
      };

      const json = jsonBody(body);
      const result =
        await this.http.request(
          "runs",
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
              "content-type":
                "application/vnd.api+json",
            },
            body: json.body,
          },
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeRun(
            objectValue(
              result.data,
            ).data,
          ),
      };
    }

    if (
      action ===
        "terraform.run.apply" ||
      action ===
        "terraform.run.cancel"
    ) {
      const parsed =
        actionSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const verification =
        await this.verifyRunWorkspace(
          headers,
          parsed.data.organization,
          parsed.data.workspace,
          parsed.data.runId,
        );
      if (!verification.ok) {
        return verification;
      }

      const endpoint =
        action.endsWith(".apply")
          ? "apply"
          : "cancel";

      const body =
        parsed.data.comment
          ? {
              comment:
                parsed.data.comment,
            }
          : undefined;

      const json =
        body
          ? jsonBody(body)
          : undefined;

      const result =
        await this.http.request(
          `runs/${encodeURIComponent(parsed.data.runId)}/actions/${endpoint}`,
          {
            method: "POST",
            headers: {
              ...headers,
              ...(json
                ? {
                    ...json.headers,
                    "content-type":
                      "application/vnd.api+json",
                  }
                : {}),
            },
            ...(json
              ? { body: json.body }
              : {}),
          },
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data: {
          runId:
            parsed.data.runId,
          action: endpoint,
          queued: true,
        },
      };
    }

    return capabilityUnavailable();
  }

  private getWorkspace(
    headers: Record<string, string>,
    organization: string,
    workspace: string,
  ): Promise<ProviderResult> {
    return this.http.request(
      `organizations/${encodeURIComponent(organization)}/workspaces/${encodeURIComponent(workspace)}`,
      {
        method: "GET",
        headers,
      },
    ).then((result) => {
      if (!result.ok) return result;
      const envelope =
        objectValue(result.data);
      return {
        ok: true,
        data:
          objectValue(
            envelope.data,
          ),
      };
    });
  }

  private async verifyRunWorkspace(
    headers: Record<string, string>,
    organization: string,
    workspace: string,
    runId: string,
  ): Promise<ProviderResult> {
    const workspaceResult =
      await this.getWorkspace(
        headers,
        organization,
        workspace,
      );
    if (!workspaceResult.ok) {
      return workspaceResult;
    }

    const workspaceId =
      objectValue(
        workspaceResult.data,
      ).id;
    if (
      typeof workspaceId !== "string"
    ) {
      return verificationFailed();
    }

    const runResult =
      await this.http.request(
        `runs/${encodeURIComponent(runId)}`,
        {
          method: "GET",
          headers,
        },
      );
    if (!runResult.ok) {
      return runResult;
    }

    const run =
      objectValue(
        objectValue(runResult.data)
          .data,
      );
    const relationships =
      objectValue(run.relationships);
    const workspaceRel =
      objectValue(
        objectValue(
          relationships.workspace,
        ).data,
      );

    if (
      workspaceRel.id !==
      workspaceId
    ) {
      return {
        ok: false,
        error: {
          code:
            "workspace_mismatch",
          message:
            "HCP Terraform run does not belong to the declared workspace",
        },
      };
    }

    return {
      ok: true,
      data: {
        workspaceId,
        runId,
      },
    };
  }
}

function sanitizeWorkspace(
  value: unknown,
): Record<string, unknown> {
  const workspace =
    objectValue(value);
  const attributes =
    objectValue(
      workspace.attributes,
    );

  return {
    id: workspace.id,
    type: workspace.type,
    name: attributes.name,
    description:
      attributes.description,
    execution_mode:
      attributes["execution-mode"],
    auto_apply:
      attributes["auto-apply"],
    terraform_version:
      attributes["terraform-version"],
    resource_count:
      attributes["resource-count"],
    updated_at:
      attributes["updated-at"],
    locked: attributes.locked,
  };
}

function sanitizeRun(
  value: unknown,
): Record<string, unknown> {
  const run =
    objectValue(value);
  const attributes =
    objectValue(run.attributes);

  return {
    id: run.id,
    type: run.type,
    status: attributes.status,
    message: attributes.message,
    plan_only:
      attributes["plan-only"],
    is_destroy:
      attributes["is-destroy"],
    created_at:
      attributes["created-at"],
    has_changes:
      attributes["has-changes"],
    actions:
      attributes.actions,
  };
}

function verificationFailed(): ProviderResult {
  return {
    ok: false,
    error: {
      code:
        "workspace_verification_failed",
      message:
        "HCP Terraform workspace could not be verified",
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
