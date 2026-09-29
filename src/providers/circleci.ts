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
  projectSlug:
    z.string().min(3),
});

const triggerSchema =
  projectSchema.extend({
    definitionId:
      z.string().min(1),
    ref: z.object({
      type: z.enum([
        "branch",
        "tag",
      ]),
      value: z.string().min(1),
    }),
    parameters: z
      .record(
        z.string(),
        z.unknown(),
      )
      .optional(),
  });

const workflowSchema =
  projectSchema.extend({
    workflowId:
      z.string().uuid(),
  });

const rerunSchema =
  workflowSchema.extend({
    fromFailed:
      z.boolean().default(true),
  });

export class CircleCIProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "circleci",
    displayName: "CircleCI",
    status: "available",
  };

  readonly #capabilities:
    Capability[] = [
      {
        name:
          "circleci.pipeline.list",
        description:
          "List recent pipelines for one CircleCI project.",
        risk: "READ",
        requiredScopes: [
          "circleci:pipeline:read",
        ],
        resourceKinds: [
          "circleci:project",
        ],
        idempotent: true,
      },
      {
        name:
          "circleci.pipeline.trigger",
        description:
          "Trigger a CircleCI pipeline definition for one project.",
        risk: "DEPLOY",
        requiredScopes: [
          "circleci:pipeline:run",
        ],
        resourceKinds: [
          "circleci:project",
        ],
      },
      {
        name:
          "circleci.workflow.cancel",
        description:
          "Cancel one CircleCI workflow after verifying it belongs to the declared project.",
        risk: "WRITE",
        requiredScopes: [
          "circleci:workflow:write",
        ],
        resourceKinds: [
          "circleci:project",
        ],
      },
      {
        name:
          "circleci.workflow.rerun",
        description:
          "Rerun one CircleCI workflow after verifying it belongs to the declared project.",
        risk: "DEPLOY",
        requiredScopes: [
          "circleci:pipeline:run",
        ],
        resourceKinds: [
          "circleci:project",
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
      id: "circleci",
      baseUrl:
        options.baseUrl ??
        "https://circleci.com/api/v2/",
      credentialRef:
        options.credentialRef ??
        "env:CIRCLECI_TOKEN",
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
      projectSchema.safeParse(
        input,
      );
    return parsed.success
      ? [
          `circleci:project:${parsed.data.projectSlug}`,
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
      "circle-token":
        token.data,
    };

    if (
      action ===
      "circleci.pipeline.list"
    ) {
      const parsed =
        projectSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      return this.http.request(
        `project/${encodeProjectSlug(parsed.data.projectSlug)}/pipeline`,
        {
          method: "GET",
          headers,
        },
      );
    }

    if (
      action ===
      "circleci.pipeline.trigger"
    ) {
      const parsed =
        triggerSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const ref = {
        [parsed.data.ref.type]:
          parsed.data.ref.value,
      };

      const body = {
        definition_id:
          parsed.data.definitionId,
        config: ref,
        checkout: ref,
        ...(parsed.data.parameters
          ? {
              parameters:
                parsed.data
                  .parameters,
            }
          : {}),
      };
      const json = jsonBody(body);

      return this.http.request(
        `project/${encodeProjectSlug(parsed.data.projectSlug)}/pipeline/run`,
        {
          method: "POST",
          headers: {
            ...headers,
            ...json.headers,
          },
          body: json.body,
        },
      );
    }

    if (
      action ===
        "circleci.workflow.cancel" ||
      action ===
        "circleci.workflow.rerun"
    ) {
      const schema =
        action.endsWith(".rerun")
          ? rerunSchema
          : workflowSchema;
      const parsed =
        schema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const verified =
        await this.verifyWorkflowProject(
          parsed.data.workflowId,
          parsed.data.projectSlug,
          headers,
        );
      if (!verified.ok) {
        return verified;
      }

      const endpoint =
        `workflow/${encodeURIComponent(parsed.data.workflowId)}/${action.endsWith(".rerun") ? "rerun" : "cancel"}`;

      if (
        action ===
        "circleci.workflow.rerun"
      ) {
        const body = {
          from_failed:
            "fromFailed" in
              parsed.data
              ? parsed.data
                  .fromFailed
              : true,
        };
        const json =
          jsonBody(body);
        return this.http.request(
          endpoint,
          {
            method: "POST",
            headers: {
              ...headers,
              ...json.headers,
            },
            body: json.body,
          },
        );
      }

      return this.http.request(
        endpoint,
        {
          method: "POST",
          headers,
        },
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

  async verifyWorkflowProject(
    workflowId: string,
    projectSlug: string,
    headers: Record<
      string,
      string
    >,
  ): Promise<ProviderResult> {
    const workflow =
      await this.http.request(
        `workflow/${encodeURIComponent(workflowId)}`,
        {
          method: "GET",
          headers,
        },
      );

    if (!workflow.ok) {
      return workflow;
    }

    const actual =
      objectValue(workflow.data)
        .project_slug;

    if (
      typeof actual !== "string" ||
      actual !== projectSlug
    ) {
      return {
        ok: false,
        error: {
          code:
            "project_mismatch",
          message:
            "workflow does not belong to the declared CircleCI project",
        },
      };
    }

    return {
      ok: true,
      data: {
        project_slug: actual,
      },
    };
  }
}

function encodeProjectSlug(
  slug: string,
): string {
  return slug
    .split("/")
    .map((part) =>
      encodeURIComponent(part),
    )
    .join("/");
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
