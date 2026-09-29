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

const idSchema = z.string().min(1).max(256);

const projectSchema = z.object({
  projectId: idSchema,
});

const serviceInstanceSchema =
  projectSchema.extend({
    serviceId: idSchema,
    environmentId: idSchema,
  });

const deploySchema =
  serviceInstanceSchema.extend({
    commitSha: z
      .string()
      .regex(/^[0-9a-fA-F]{7,64}$/u)
      .optional(),
  });

const PROJECT_QUERY = `
  query project($id: String!) {
    project(id: $id) {
      id
      name
      description
      createdAt
      updatedAt
      services {
        edges {
          node {
            id
            name
            icon
          }
        }
      }
      environments {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
`;

const SERVICE_INSTANCE_QUERY = `
  query serviceInstance($serviceId: String!, $environmentId: String!) {
    serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
      id
      serviceName
      startCommand
      buildCommand
      rootDirectory
      healthcheckPath
      region
      numReplicas
      restartPolicyType
      restartPolicyMaxRetries
      latestDeployment {
        id
        status
        createdAt
      }
    }
  }
`;

const DEPLOY_MUTATION = `
  mutation serviceInstanceDeployV2(
    $serviceId: String!,
    $environmentId: String!,
    $commitSha: String
  ) {
    serviceInstanceDeployV2(
      serviceId: $serviceId,
      environmentId: $environmentId,
      commitSha: $commitSha
    )
  }
`;

export class RailwayProvider
  extends ProviderBase
  implements Provider
{
  readonly descriptor: ProviderDescriptor = {
    id: "railway",
    displayName: "Railway",
    status: "available",
  };

  readonly #capabilities: Capability[] = [
    {
      name: "railway.project.get",
      description:
        "Read one Railway project with service and environment identifiers.",
      risk: "READ",
      requiredScopes: [
        "railway:project:read",
      ],
      resourceKinds: [
        "railway:project",
      ],
      idempotent: true,
    },
    {
      name:
        "railway.service_instance.get",
      description:
        "Read one Railway service instance after verifying service and environment ownership.",
      risk: "READ",
      requiredScopes: [
        "railway:deployment:read",
      ],
      resourceKinds: [
        "railway:project",
      ],
      idempotent: true,
    },
    {
      name: "railway.service.deploy",
      description:
        "Deploy one Railway service instance after verifying the service and environment belong to the authorized project.",
      risk: "DEPLOY",
      requiredScopes: [
        "railway:deployment:run",
      ],
      resourceKinds: [
        "railway:project",
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
      id: "railway",
      baseUrl:
        options.baseUrl ??
        "https://backboard.railway.com/graphql/v2",
      credentialRef:
        options.credentialRef ??
        "env:RAILWAY_TOKEN",
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
          `railway:project:${parsed.data.projectId}`,
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
      "content-type":
        "application/json",
    };

    if (
      action ===
      "railway.project.get"
    ) {
      const parsed =
        projectSchema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const result =
        await this.graphql(
          headers,
          PROJECT_QUERY,
          {
            id: parsed.data.projectId,
          },
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data: sanitizeProject(
          objectValue(result.data)
            .project,
        ),
      };
    }

    if (
      action ===
        "railway.service_instance.get" ||
      action ===
        "railway.service.deploy"
    ) {
      const schema =
        action.endsWith(".deploy")
          ? deploySchema
          : serviceInstanceSchema;
      const parsed =
        schema.safeParse(input);
      if (!parsed.success) {
        return invalidInput();
      }

      const verified =
        await this.verifyMembership(
          headers,
          parsed.data.projectId,
          parsed.data.serviceId,
          parsed.data.environmentId,
        );
      if (!verified.ok) {
        return verified;
      }

      if (
        action ===
        "railway.service_instance.get"
      ) {
        const result =
          await this.graphql(
            headers,
            SERVICE_INSTANCE_QUERY,
            {
              serviceId:
                parsed.data.serviceId,
              environmentId:
                parsed.data
                  .environmentId,
            },
          );
        if (!result.ok) return result;

        return {
          ok: true,
          data:
            objectValue(result.data)
              .serviceInstance,
        };
      }

      const variables: Record<
        string,
        unknown
      > = {
        serviceId:
          parsed.data.serviceId,
        environmentId:
          parsed.data.environmentId,
        ...("commitSha" in
          parsed.data &&
        parsed.data.commitSha
          ? {
              commitSha:
                parsed.data.commitSha,
            }
          : {
              commitSha: null,
            }),
      };

      const result =
        await this.graphql(
          headers,
          DEPLOY_MUTATION,
          variables,
        );
      if (!result.ok) return result;

      return {
        ok: true,
        data: {
          deploymentId:
            objectValue(result.data)
              .serviceInstanceDeployV2,
        },
      };
    }

    return capabilityUnavailable();
  }

  private async graphql(
    headers: Record<string, string>,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<ProviderResult<
    Record<string, unknown>
  >> {
    const json = jsonBody({
      query,
      variables,
    });

    const result =
      await this.http.request(
        "",
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

    const envelope =
      objectValue(result.data);
    if (
      Array.isArray(envelope.errors) &&
      envelope.errors.length > 0
    ) {
      return {
        ok: false,
        error: {
          code:
            "railway_graphql_error",
          message:
            "Railway GraphQL reported an error",
        },
      };
    }

    return {
      ok: true,
      data:
        objectValue(envelope.data),
    };
  }

  private async verifyMembership(
    headers: Record<string, string>,
    projectId: string,
    serviceId: string,
    environmentId: string,
  ): Promise<ProviderResult> {
    const result =
      await this.graphql(
        headers,
        PROJECT_QUERY,
        { id: projectId },
      );
    if (!result.ok) return result;

    const project =
      objectValue(
        objectValue(result.data)
          .project,
      );

    const services =
      edges(project.services);
    const environments =
      edges(project.environments);

    const hasService =
      services.some(
        (value) =>
          value.id === serviceId,
      );
    const hasEnvironment =
      environments.some(
        (value) =>
          value.id ===
          environmentId,
      );

    if (
      !hasService ||
      !hasEnvironment
    ) {
      return {
        ok: false,
        error: {
          code:
            "project_mismatch",
          message:
            "Railway service or environment does not belong to the declared project",
        },
      };
    }

    return {
      ok: true,
      data: {
        projectId,
      },
    };
  }
}

function edges(
  value: unknown,
): Record<string, unknown>[] {
  const collection =
    objectValue(value);
  if (!Array.isArray(collection.edges)) {
    return [];
  }

  return collection.edges.map(
    (edge) =>
      objectValue(
        objectValue(edge).node,
      ),
  );
}

function sanitizeProject(
  value: unknown,
): Record<string, unknown> {
  const project =
    objectValue(value);
  return {
    id: project.id,
    name: project.name,
    description:
      project.description,
    createdAt:
      project.createdAt,
    updatedAt:
      project.updatedAt,
    services:
      edges(project.services).map(
        (service) => ({
          id: service.id,
          name: service.name,
          icon: service.icon,
        }),
      ),
    environments:
      edges(
        project.environments,
      ).map(
        (environment) => ({
          id: environment.id,
          name: environment.name,
        }),
      ),
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
