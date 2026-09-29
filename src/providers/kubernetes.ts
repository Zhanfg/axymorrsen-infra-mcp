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

const nameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/u,
  );

const namespaceSchema = z.object({
  namespace: nameSchema,
});

const deploymentSchema =
  namespaceSchema.extend({
    deployment: nameSchema,
  });

const scaleSchema =
  deploymentSchema.extend({
    replicas: z
      .number()
      .int()
      .min(0)
      .max(1000),
  });

export class KubernetesProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "kubernetes",
    displayName: "Kubernetes",
    status: "available",
  };

  readonly #clusterId: string;

  readonly #capabilities:
    Capability[] = [
      {
        name:
          "kubernetes.namespace.list",
        description:
          "List Kubernetes namespaces in the configured cluster.",
        risk: "READ",
        requiredScopes: [
          "kubernetes:namespace:read",
        ],
        resourceKinds: [
          "kubernetes:cluster",
        ],
        idempotent: true,
      },
      {
        name:
          "kubernetes.namespace.get",
        description:
          "Read one Kubernetes namespace.",
        risk: "READ",
        requiredScopes: [
          "kubernetes:namespace:read",
        ],
        resourceKinds: [
          "kubernetes:namespace",
        ],
        idempotent: true,
      },
      {
        name:
          "kubernetes.deployment.list",
        description:
          "List deployments in one Kubernetes namespace.",
        risk: "READ",
        requiredScopes: [
          "kubernetes:deployment:read",
        ],
        resourceKinds: [
          "kubernetes:namespace",
        ],
        idempotent: true,
      },
      {
        name:
          "kubernetes.deployment.get",
        description:
          "Read one Kubernetes deployment.",
        risk: "READ",
        requiredScopes: [
          "kubernetes:deployment:read",
        ],
        resourceKinds: [
          "kubernetes:deployment",
        ],
        idempotent: true,
      },
      {
        name:
          "kubernetes.deployment.scale",
        description:
          "Scale one Kubernetes deployment using the scale subresource and resource-version precondition. Requires step-up authorization.",
        risk: "DESTRUCTIVE",
        requiredScopes: [
          "kubernetes:deployment:scale",
        ],
        resourceKinds: [
          "kubernetes:deployment",
        ],
      },
    ];

  constructor(options: {
    secretResolver: SecretResolver;
    clusterId: string;
    credentialRef?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
  }) {
    super({
      id: "kubernetes",
      baseUrl:
        options.baseUrl ??
        "https://kubernetes.default.svc/",
      credentialRef:
        options.credentialRef ??
        "env:KUBERNETES_TOKEN",
      secretResolver:
        options.secretResolver,
      ...(options.fetchImpl
        ? {
            fetchImpl:
              options.fetchImpl,
          }
        : {}),
    });

    if (
      !/^[A-Za-z0-9._-]+$/u.test(
        options.clusterId,
      )
    ) {
      throw new Error(
        "invalid Kubernetes cluster ID",
      );
    }

    this.#clusterId =
      options.clusterId;
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
      "kubernetes.namespace.list"
    ) {
      return [
        `kubernetes:cluster:${this.#clusterId}`,
      ];
    }

    if (
      action ===
        "kubernetes.namespace.get" ||
      action ===
        "kubernetes.deployment.list"
    ) {
      const parsed =
        namespaceSchema.safeParse(
          input,
        );
      return parsed.success
        ? [
            `kubernetes:namespace:${this.#clusterId}/${parsed.data.namespace}`,
          ]
        : [];
    }

    const parsed =
      deploymentSchema.safeParse(
        input,
      );
    return parsed.success
      ? [
          `kubernetes:deployment:${this.#clusterId}/${parsed.data.namespace}/${parsed.data.deployment}`,
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
      accept:
        "application/json",
    };

    if (
      action ===
      "kubernetes.namespace.list"
    ) {
      const result =
        await this.http.request(
          "api/v1/namespaces",
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
          namespaces:
            Array.isArray(
              envelope.items,
            )
              ? envelope.items.map(
                  sanitizeNamespace,
                )
              : [],
          resourceVersion:
            objectValue(
              envelope.metadata,
            ).resourceVersion,
        },
      };
    }

    if (
      action ===
      "kubernetes.namespace.get"
    ) {
      const parsed =
        namespaceSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `api/v1/namespaces/${encodeURIComponent(parsed.data.namespace)}`,
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeNamespace(
            result.data,
          ),
      };
    }

    if (
      action ===
      "kubernetes.deployment.list"
    ) {
      const parsed =
        namespaceSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          `apis/apps/v1/namespaces/${encodeURIComponent(parsed.data.namespace)}/deployments`,
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
          deployments:
            Array.isArray(
              envelope.items,
            )
              ? envelope.items.map(
                  sanitizeDeployment,
                )
              : [],
          resourceVersion:
            objectValue(
              envelope.metadata,
            ).resourceVersion,
        },
      };
    }

    if (
      action ===
      "kubernetes.deployment.get"
    ) {
      const parsed =
        deploymentSchema.safeParse(
          input,
        );
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.http.request(
          deploymentPath(
            parsed.data.namespace,
            parsed.data.deployment,
          ),
          {
            method: "GET",
            headers,
          },
        );

      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeDeployment(
            result.data,
          ),
      };
    }

    if (
      action ===
      "kubernetes.deployment.scale"
    ) {
      const parsed =
        scaleSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const path =
        `${deploymentPath(
          parsed.data.namespace,
          parsed.data.deployment,
        )}/scale`;

      const current =
        await this.http.request(
          path,
          {
            method: "GET",
            headers,
          },
        );
      if (!current.ok) {
        return current;
      }

      const currentValue =
        objectValue(current.data);
      const metadata =
        objectValue(
          currentValue.metadata,
        );
      const resourceVersion =
        metadata.resourceVersion;

      if (
        typeof resourceVersion !==
          "string" ||
        resourceVersion.length === 0
      ) {
        return {
          ok: false,
          error: {
            code:
              "resource_version_unavailable",
            message:
              "Kubernetes scale resource did not provide a resourceVersion",
          },
        };
      }

      const body = JSON.stringify({
        metadata: {
          resourceVersion,
        },
        spec: {
          replicas:
            parsed.data.replicas,
        },
      });

      const result =
        await this.http.request(
          path,
          {
            method: "PATCH",
            headers: {
              ...headers,
              "content-type":
                "application/merge-patch+json",
            },
            body,
          },
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data:
          sanitizeScale(
            result.data,
          ),
      };
    }

    return capabilityUnavailable();
  }
}

function deploymentPath(
  namespace: string,
  deployment: string,
): string {
  return `apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(deployment)}`;
}

function sanitizeNamespace(
  value: unknown,
): Record<string, unknown> {
  const item =
    objectValue(value);
  const metadata =
    objectValue(item.metadata);
  const status =
    objectValue(item.status);

  return {
    name: metadata.name,
    uid: metadata.uid,
    resourceVersion:
      metadata.resourceVersion,
    creationTimestamp:
      metadata.creationTimestamp,
    phase: status.phase,
  };
}

function sanitizeDeployment(
  value: unknown,
): Record<string, unknown> {
  const item =
    objectValue(value);
  const metadata =
    objectValue(item.metadata);
  const spec =
    objectValue(item.spec);
  const status =
    objectValue(item.status);

  return {
    name: metadata.name,
    namespace:
      metadata.namespace,
    uid: metadata.uid,
    resourceVersion:
      metadata.resourceVersion,
    generation:
      metadata.generation,
    replicas: spec.replicas,
    strategy: spec.strategy,
    availableReplicas:
      status.availableReplicas,
    readyReplicas:
      status.readyReplicas,
    updatedReplicas:
      status.updatedReplicas,
    unavailableReplicas:
      status.unavailableReplicas,
    observedGeneration:
      status.observedGeneration,
  };
}

function sanitizeScale(
  value: unknown,
): Record<string, unknown> {
  const item =
    objectValue(value);
  const metadata =
    objectValue(item.metadata);
  const spec =
    objectValue(item.spec);
  const status =
    objectValue(item.status);

  return {
    name: metadata.name,
    namespace:
      metadata.namespace,
    resourceVersion:
      metadata.resourceVersion,
    replicas: spec.replicas,
    currentReplicas:
      status.replicas,
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
