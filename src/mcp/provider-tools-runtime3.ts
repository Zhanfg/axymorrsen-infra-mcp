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

const dockerSegment = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);

const kubernetesName = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/u,
  );

const vaultMount = z
  .string()
  .regex(/^[A-Za-z0-9._-]+$/u);

const vaultPath = z
  .string()
  .min(1)
  .max(1024);

export function registerRuntimeProviderTools(
  server: McpServer,
  executor: ProviderExecutor,
): void {
  server.registerTool(
    "docker.repository.get",
    {
      description:
        "Read one Docker Hub repository in an authorized namespace.",
      inputSchema: z.object({
        namespace: dockerSegment,
        repository: dockerSegment,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "docker",
        "docker.repository.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "docker.tag.list",
    {
      description:
        "List tags for one authorized Docker Hub repository.",
      inputSchema: z.object({
        namespace: dockerSegment,
        repository: dockerSegment,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "docker",
        "docker.tag.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "docker.tag.get",
    {
      description:
        "Read one Docker Hub repository tag.",
      inputSchema: z.object({
        namespace: dockerSegment,
        repository: dockerSegment,
        tag: z
          .string()
          .regex(
            /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/u,
          ),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "docker",
        "docker.tag.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "docker.repository.create",
    {
      description:
        "Create one Docker Hub repository in an explicitly authorized namespace.",
      inputSchema: z.object({
        namespace: dockerSegment,
        name: dockerSegment,
        description: z
          .string()
          .max(1000)
          .optional(),
        fullDescription: z
          .string()
          .max(10000)
          .optional(),
        isPrivate:
          z.boolean().default(false),
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
        "docker",
        "docker.repository.create",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "kubernetes.namespace.list",
    {
      description:
        "List namespaces in the configured Kubernetes cluster.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "kubernetes",
        "kubernetes.namespace.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "kubernetes.namespace.get",
    {
      description:
        "Read one Kubernetes namespace.",
      inputSchema: z.object({
        namespace:
          kubernetesName,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "kubernetes",
        "kubernetes.namespace.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "kubernetes.deployment.list",
    {
      description:
        "List deployments in one authorized Kubernetes namespace.",
      inputSchema: z.object({
        namespace:
          kubernetesName,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "kubernetes",
        "kubernetes.deployment.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "kubernetes.deployment.get",
    {
      description:
        "Read one Kubernetes deployment.",
      inputSchema: z.object({
        namespace:
          kubernetesName,
        deployment:
          kubernetesName,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "kubernetes",
        "kubernetes.deployment.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "kubernetes.deployment.scale",
    {
      description:
        "Scale one Kubernetes deployment using the scale subresource and a resourceVersion precondition. This requires server-side step-up authorization.",
      inputSchema: z.object({
        namespace:
          kubernetesName,
        deployment:
          kubernetesName,
        replicas: z
          .number()
          .int()
          .min(0)
          .max(1000),
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
        "kubernetes",
        "kubernetes.deployment.scale",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vault.health.get",
    {
      description:
        "Read HashiCorp Vault health status without reading secret values.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vault",
        "vault.health.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vault.kv.metadata.list",
    {
      description:
        "List Vault KV v2 metadata keys only. Secret values are never read.",
      inputSchema: z.object({
        mount: vaultMount,
        path: z
          .string()
          .max(1024)
          .default(""),
        excludeDeleted:
          z.boolean().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vault",
        "vault.kv.metadata.list",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vault.kv.metadata.get",
    {
      description:
        "Read Vault KV v2 key metadata and version metadata without reading the secret value.",
      inputSchema: z.object({
        mount: vaultMount,
        path: vaultPath,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      execute(
        executor,
        "vault",
        "vault.kv.metadata.get",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vault.kv.metadata.update",
    {
      description:
        "Update Vault KV v2 retention/CAS metadata only. Secret values cannot be supplied. Requires step-up authorization.",
      inputSchema: z.object({
        mount: vaultMount,
        path: vaultPath,
        maxVersions: z
          .number()
          .int()
          .min(0)
          .optional(),
        casRequired:
          z.boolean().optional(),
        deleteVersionAfter: z
          .string()
          .min(1)
          .max(64)
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
        "vault",
        "vault.kv.metadata.update",
        input,
        ctx.http?.authInfo,
      ),
  );

  server.registerTool(
    "vault.kv.metadata.delete",
    {
      description:
        "Permanently delete Vault KV v2 metadata and all versions for one exact key. Requires step-up authorization.",
      inputSchema: z.object({
        mount: vaultMount,
        path: vaultPath,
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
        "vault",
        "vault.kv.metadata.delete",
        input,
        ctx.http?.authInfo,
      ),
  );
}
