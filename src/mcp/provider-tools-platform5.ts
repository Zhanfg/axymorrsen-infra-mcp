import {
  McpServer,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  ProviderExecutor,
} from "../core/executor.js";
import type {
  ProviderResult,
} from "../core/types.js";

function toolResult(
  result: ProviderResult,
) {
  const value = {
    ok: result.ok,
    ...(result.data !== undefined
      ? { data: result.data }
      : {}),
    ...(result.error
      ? { error: result.error }
      : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          value,
          null,
          2,
        ),
      },
    ],
    structuredContent: value,
    isError: !result.ok,
  };
}

async function execute(
  executor: ProviderExecutor,
  provider: string,
  action: string,
  input: unknown,
  authInfo:
    | Parameters<
        ProviderExecutor["execute"]
      >[3]
    | undefined,
) {
  return toolResult(
    await executor.execute(
      provider,
      action,
      input,
      authInfo,
    ),
  );
}

const id = z.string().min(1);

export function registerPlatformProviderTools(
  server: McpServer,
  executor: ProviderExecutor,
): void {
  server.registerTool(
    "vercel.project.get",
    {
      description:
        "Read one Vercel project in an authorized team.",
      inputSchema: z.object({
        teamId: id,
        projectId: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vercel",
        "vercel.project.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vercel.deployment.list",
    {
      description:
        "List deployments for an authorized Vercel project.",
      inputSchema: z.object({
        teamId: id,
        projectId: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vercel",
        "vercel.deployment.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vercel.deployment.cancel",
    {
      description:
        "Cancel one Vercel deployment after project ownership verification.",
      inputSchema: z.object({
        teamId: id,
        projectId: id,
        deploymentId: id,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vercel",
        "vercel.deployment.cancel",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "railway.project.get",
    {
      description:
        "Read a Railway project with its service and environment identifiers.",
      inputSchema: z.object({
        projectId: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "railway",
        "railway.project.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "railway.service_instance.get",
    {
      description:
        "Read a Railway service instance after project membership verification.",
      inputSchema: z.object({
        projectId: id,
        serviceId: id,
        environmentId: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "railway",
        "railway.service_instance.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "railway.service.deploy",
    {
      description:
        "Deploy a Railway service instance after verifying its service and environment belong to the authorized project.",
      inputSchema: z.object({
        projectId: id,
        serviceId: id,
        environmentId: id,
        commitSha: z
          .string()
          .regex(
            /^[0-9a-fA-F]{7,64}$/u,
          )
          .optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "railway",
        "railway.service.deploy",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "supabase.project.get",
    {
      description:
        "Read a Supabase project without exposing project secrets or API keys.",
      inputSchema: z.object({
        projectRef: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "supabase",
        "supabase.project.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "supabase.branch.list",
    {
      description:
        "List database branches for one Supabase project.",
      inputSchema: z.object({
        projectRef: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "supabase",
        "supabase.branch.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "supabase.branch.get",
    {
      description:
        "Read one Supabase database branch by name.",
      inputSchema: z.object({
        projectRef: id,
        branchName:
          z.string().min(1).max(128),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "supabase",
        "supabase.branch.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "supabase.branch.create",
    {
      description:
        "Create a Supabase database branch without accepting secret overrides.",
      inputSchema: z.object({
        projectRef: id,
        branchName:
          z.string().min(1).max(128),
        gitBranch:
          z.string().min(1).optional(),
        persistent:
          z.boolean().default(false),
        withData:
          z.boolean().default(false),
        region:
          z.string().min(1).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "supabase",
        "supabase.branch.create",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "sentry.issue.get",
    {
      description:
        "Read one Sentry issue within an authorized organization.",
      inputSchema: z.object({
        organization: id,
        issueId: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "sentry",
        "sentry.issue.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "sentry.issue.event.get",
    {
      description:
        "Read an event belonging to an authorized Sentry issue.",
      inputSchema: z.object({
        organization: id,
        issueId: id,
        eventId: z
          .union([
            z.enum([
              "latest",
              "oldest",
              "recommended",
            ]),
            z.string().regex(
              /^[0-9a-fA-F]{32}$/u,
            ),
          ])
          .default("latest"),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "sentry",
        "sentry.issue.event.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "sentry.issue.update",
    {
      description:
        "Update limited Sentry issue workflow fields. Merge, discard and public-sharing actions are intentionally unavailable.",
      inputSchema: z.object({
        organization: id,
        issueId: id,
        status: z
          .enum([
            "resolved",
            "unresolved",
            "ignored",
            "resolvedInNextRelease",
            "muted",
          ])
          .optional(),
        substatus: z
          .enum([
            "archived_until_escalating",
            "archived_until_condition_met",
            "archived_forever",
            "escalating",
            "ongoing",
            "regressed",
            "new",
          ])
          .optional(),
        priority: z
          .enum([
            "low",
            "medium",
            "high",
          ])
          .optional(),
        assignedTo:
          z.string().min(1).optional(),
        isSubscribed:
          z.boolean().optional(),
        isBookmarked:
          z.boolean().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "sentry",
        "sentry.issue.update",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "terraform.workspace.get",
    {
      description:
        "Read one HCP Terraform workspace by organization and workspace name.",
      inputSchema: z.object({
        organization: id,
        workspace: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "terraform",
        "terraform.workspace.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "terraform.run.list",
    {
      description:
        "List recent HCP Terraform runs in one authorized workspace.",
      inputSchema: z.object({
        organization: id,
        workspace: id,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "terraform",
        "terraform.run.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "terraform.run.plan",
    {
      description:
        "Queue a plan-only HCP Terraform run; this tool cannot auto-apply infrastructure changes.",
      inputSchema: z.object({
        organization: id,
        workspace: id,
        message: z
          .string()
          .max(512)
          .optional(),
        configurationVersionId:
          z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "terraform",
        "terraform.run.plan",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "terraform.run.apply",
    {
      description:
        "Apply a paused HCP Terraform run. This may change or destroy infrastructure and requires server-side step-up authorization.",
      inputSchema: z.object({
        organization: id,
        workspace: id,
        runId: id,
        comment: z
          .string()
          .max(512)
          .optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "terraform",
        "terraform.run.apply",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "terraform.run.cancel",
    {
      description:
        "Request safe cancellation of an HCP Terraform run after workspace verification.",
      inputSchema: z.object({
        organization: id,
        workspace: id,
        runId: id,
        comment: z
          .string()
          .max(512)
          .optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "terraform",
        "terraform.run.cancel",
        input,
        ctx.http?.authInfo,
      ),
  );
}
