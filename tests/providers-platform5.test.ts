import type {
  ExecutionContext,
} from "../src/core/types.js";
import {
  EnvironmentSecretResolver,
} from "../src/secrets/resolver.js";
import {
  RailwayProvider,
} from "../src/providers/railway.js";
import {
  SentryProvider,
} from "../src/providers/sentry.js";
import {
  SupabaseProvider,
} from "../src/providers/supabase.js";
import {
  TerraformProvider,
} from "../src/providers/terraform.js";
import {
  VercelProvider,
} from "../src/providers/vercel.js";
import {
  describe,
  expect,
  it,
} from "vitest";

const context: ExecutionContext = {
  requestId: "test-request",
  clientId: "test-client",
  subject: "test-user",
  scopes: [],
  allowedResources: [],
  stepUpAuthorized: true,
};

interface RecordedCall {
  url: string;
  init: RequestInit;
  body?: unknown;
}

function urlOf(
  input: Parameters<typeof fetch>[0],
): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type":
          "application/json",
      },
    },
  );
}

function bodyOf(
  init: RequestInit,
): unknown {
  if (
    typeof init.body !== "string"
  ) {
    return undefined;
  }

  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

describe("platform provider pack", () => {
  it("verifies Vercel deployment project before cancellation", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        url.includes(
          "/v13/deployments/dpl_test",
        )
      ) {
        return jsonResponse({
          id: "dpl_test",
          projectId:
            "other-project",
        });
      }

      return jsonResponse({}, 500);
    }) as typeof fetch;

    const provider =
      new VercelProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            VERCEL_TOKEN:
              "vercel-secret",
          }),
        baseUrl:
          "https://api.vercel.test/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "vercel.deployment.cancel",
        {
          teamId: "team-1",
          projectId: "project-1",
          deploymentId:
            "dpl_test",
        },
        context,
      );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code:
          "project_mismatch",
      },
    });
    expect(calls).toHaveLength(1);
  });

  it("verifies Railway service and environment ownership before deploy", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const body =
        bodyOf(init) as
          | Record<
              string,
              unknown
            >
          | undefined;

      calls.push({
        url: urlOf(input),
        init,
        body,
      });

      const query =
        typeof body?.query ===
        "string"
          ? body.query
          : "";

      if (
        query.includes(
          "query project",
        )
      ) {
        return jsonResponse({
          data: {
            project: {
              id: "project-1",
              name: "demo",
              services: {
                edges: [
                  {
                    node: {
                      id: "service-1",
                      name: "api",
                    },
                  },
                ],
              },
              environments: {
                edges: [
                  {
                    node: {
                      id:
                        "environment-1",
                      name:
                        "production",
                    },
                  },
                ],
              },
            },
          },
        });
      }

      if (
        query.includes(
          "serviceInstanceDeployV2",
        )
      ) {
        return jsonResponse({
          data: {
            serviceInstanceDeployV2:
              "deployment-1",
          },
        });
      }

      return jsonResponse({
        errors: [
          {
            message:
              "unexpected query",
          },
        ],
      });
    }) as typeof fetch;

    const provider =
      new RailwayProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            RAILWAY_TOKEN:
              "railway-secret",
          }),
        baseUrl:
          "https://railway.test/graphql/v2",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "railway.service.deploy",
        {
          projectId: "project-1",
          serviceId: "service-1",
          environmentId:
            "environment-1",
          commitSha: "abcdef1",
        },
        context,
      );

    expect(result).toEqual({
      ok: true,
      data: {
        deploymentId:
          "deployment-1",
      },
    });
    expect(calls).toHaveLength(2);

    const mutation =
      calls[1]?.body as
        | Record<string, unknown>
        | undefined;
    expect(
      JSON.stringify(mutation),
    ).toContain("abcdef1");
  });

  it("creates Supabase branches without accepting secret overrides", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      calls.push({
        url: urlOf(input),
        init,
        body: bodyOf(init),
      });

      return jsonResponse(
        {
          id:
            "00000000-0000-0000-0000-000000000000",
          name: "preview",
          project_ref:
            "child-ref",
          parent_project_ref:
            "parent-ref",
          persistent: false,
          with_data: false,
          status:
            "CREATING_PROJECT",
        },
        201,
      );
    }) as typeof fetch;

    const provider =
      new SupabaseProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            SUPABASE_ACCESS_TOKEN:
              "supabase-secret",
          }),
        baseUrl:
          "https://supabase.test/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "supabase.branch.create",
        {
          projectRef:
            "parent-ref",
          branchName: "preview",
          withData: false,
          persistent: false,
          secrets: {
            database_password:
              "must-not-pass",
          },
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(
      JSON.stringify(
        calls[0]?.body,
      ),
    ).not.toContain("secrets");
    expect(
      JSON.stringify(
        calls[0]?.body,
      ),
    ).not.toContain(
      "must-not-pass",
    );
  });

  it("limits Sentry issue updates to the exposed workflow fields", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        init.method === "GET"
      ) {
        return jsonResponse({
          id: "123",
          shortId: "DEMO-1",
          title: "boom",
          status:
            "unresolved",
          project: {
            id: "9",
            slug: "demo",
            name: "Demo",
          },
        });
      }

      return jsonResponse({
        id: "123",
        shortId: "DEMO-1",
        title: "boom",
        status: "resolved",
        priority: "high",
        project: {
          id: "9",
          slug: "demo",
          name: "Demo",
        },
      });
    }) as typeof fetch;

    const provider =
      new SentryProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            SENTRY_AUTH_TOKEN:
              "sentry-secret",
          }),
        baseUrl:
          "https://sentry.test/api/0/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "sentry.issue.update",
        {
          organization: "acme",
          issueId: "123",
          status: "resolved",
          priority: "high",
          discard: true,
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toEqual({
      status: "resolved",
      priority: "high",
    });
  });

  it("always queues HCP Terraform creation as plan-only", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        url.includes(
          "/organizations/acme/workspaces/prod",
        )
      ) {
        return jsonResponse({
          data: {
            id: "ws-123",
            type: "workspaces",
            attributes: {
              name: "prod",
            },
          },
        });
      }

      if (url.endsWith("/runs")) {
        return jsonResponse(
          {
            data: {
              id: "run-abc",
              type: "runs",
              attributes: {
                status: "pending",
                "plan-only": true,
              },
            },
          },
          201,
        );
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new TerraformProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            TFC_TOKEN:
              "terraform-secret",
          }),
        baseUrl:
          "https://terraform.test/api/v2/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "terraform.run.plan",
        {
          organization: "acme",
          workspace: "prod",
          message:
            "preview changes",
        },
        context,
      );

    expect(result.ok).toBe(true);
    const body =
      calls[1]?.body as
        | {
            data?: {
              attributes?: Record<
                string,
                unknown
              >;
            };
          }
        | undefined;

    expect(
      body?.data?.attributes?.[
        "plan-only"
      ],
    ).toBe(true);
  });

  it("blocks HCP Terraform run actions when run and workspace do not match", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({
        url,
        init,
        body: bodyOf(init),
      });

      if (
        url.includes(
          "/organizations/acme/workspaces/prod",
        )
      ) {
        return jsonResponse({
          data: {
            id: "ws-prod",
            type: "workspaces",
            attributes: {
              name: "prod",
            },
          },
        });
      }

      if (
        url.endsWith(
          "/runs/run-abc",
        )
      ) {
        return jsonResponse({
          data: {
            id: "run-abc",
            type: "runs",
            relationships: {
              workspace: {
                data: {
                  id: "ws-other",
                  type:
                    "workspaces",
                },
              },
            },
          },
        });
      }

      return jsonResponse({}, 500);
    }) as typeof fetch;

    const provider =
      new TerraformProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            TFC_TOKEN:
              "terraform-secret",
          }),
        baseUrl:
          "https://terraform.test/api/v2/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "terraform.run.apply",
        {
          organization: "acme",
          workspace: "prod",
          runId: "run-abc",
        },
        context,
      );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code:
          "workspace_mismatch",
      },
    });
    expect(calls).toHaveLength(2);
  });
});
