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

export function registerCoreProviderTools(
  server: McpServer,
  executor: ProviderExecutor,
): void {
  server.registerTool(
    "github.repository.get",
    {
      description:
        "Read one GitHub repository after MCP scope and resource authorization.",
      inputSchema: z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "github",
          "github.repository.get",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "github.repository.create",
    {
      description:
        "Create a GitHub repository. The caller must be authorized for the exact target repository resource.",
      inputSchema: z.object({
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
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "github",
          "github.repository.create",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "github.release.create",
    {
      description:
        "Create a GitHub release in an authorized repository.",
      inputSchema: z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        tagName: z.string().min(1),
        name: z.string().optional(),
        body: z.string().optional(),
        draft:
          z.boolean().default(false),
        prerelease:
          z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "github",
          "github.release.create",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "gitlab.project.get",
    {
      description:
        "Read one GitLab project by namespace path.",
      inputSchema: z.object({
        pathWithNamespace:
          z.string().min(3),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "gitlab",
          "gitlab.project.get",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "gitlab.project.create",
    {
      description:
        "Create a GitLab project after verifying the namespace ID matches the authorized namespace path.",
      inputSchema: z.object({
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
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "gitlab",
          "gitlab.project.create",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "cloudflare.dns.list",
    {
      description:
        "List DNS records in an authorized Cloudflare zone.",
      inputSchema: z.object({
        zoneId: z.string().min(1),
        type: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "cloudflare",
          "cloudflare.dns.list",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "cloudflare.dns.create",
    {
      description:
        "Create one DNS record in an authorized Cloudflare zone.",
      inputSchema: z.object({
        zoneId: z.string().min(1),
        type: z.string().min(1),
        name: z.string().min(1),
        content: z.string().min(1),
        ttl: z
          .number()
          .int()
          .positive()
          .optional(),
        proxied:
          z.boolean().optional(),
        comment:
          z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "cloudflare",
          "cloudflare.dns.create",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "cloudflare.dns.update",
    {
      description:
        "Patch one DNS record in an authorized Cloudflare zone.",
      inputSchema: z.object({
        zoneId: z.string().min(1),
        recordId: z.string().min(1),
        type: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        ttl: z
          .number()
          .int()
          .positive()
          .optional(),
        proxied:
          z.boolean().optional(),
        comment:
          z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "cloudflare",
          "cloudflare.dns.update",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "cloudflare.dns.delete",
    {
      description:
        "Permanently delete one DNS record. This is a destructive action and requires step-up authorization.",
      inputSchema: z.object({
        zoneId: z.string().min(1),
        recordId: z.string().min(1),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "cloudflare",
          "cloudflare.dns.delete",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "circleci.pipeline.list",
    {
      description:
        "List recent CircleCI pipelines for one authorized project.",
      inputSchema: z.object({
        projectSlug:
          z.string().min(3),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "circleci",
          "circleci.pipeline.list",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "circleci.pipeline.trigger",
    {
      description:
        "Trigger a CircleCI pipeline definition for an authorized project.",
      inputSchema: z.object({
        projectSlug:
          z.string().min(3),
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
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "circleci",
          "circleci.pipeline.trigger",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "circleci.workflow.cancel",
    {
      description:
        "Cancel a CircleCI workflow after the provider verifies that the workflow belongs to the declared authorized project.",
      inputSchema: z.object({
        projectSlug:
          z.string().min(3),
        workflowId:
          z.string().uuid(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "circleci",
          "circleci.workflow.cancel",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );

  server.registerTool(
    "circleci.workflow.rerun",
    {
      description:
        "Rerun a CircleCI workflow after verifying project ownership.",
      inputSchema: z.object({
        projectSlug:
          z.string().min(3),
        workflowId:
          z.string().uuid(),
        fromFailed:
          z.boolean().default(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      toolResult(
        await executor.execute(
          "circleci",
          "circleci.workflow.rerun",
          input,
          ctx.http?.authInfo,
        ),
      ),
  );
}
