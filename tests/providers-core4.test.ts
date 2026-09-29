import type {
  ExecutionContext,
} from "../src/core/types.js";
import {
  EnvironmentSecretResolver,
} from "../src/secrets/resolver.js";
import {
  GitHubProvider,
} from "../src/providers/github.js";
import {
  GitLabProvider,
} from "../src/providers/gitlab.js";
import {
  CloudflareProvider,
} from "../src/providers/cloudflare.js";
import {
  CircleCIProvider,
} from "../src/providers/circleci.js";
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
  stepUpAuthorized: false,
};

interface RecordedCall {
  url: string;
  init: RequestInit;
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

describe("core provider adapters", () => {
  it("verifies GitHub user ownership before repository creation", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({ url, init });

      if (url.endsWith("/user")) {
        return jsonResponse({
          login: "alice",
        });
      }

      if (
        url.endsWith("/user/repos")
      ) {
        return jsonResponse(
          {
            id: 1,
            name: "demo",
            full_name: "alice/demo",
            html_url:
              "https://github.com/alice/demo",
            private: false,
            default_branch: "main",
          },
          201,
        );
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new GitHubProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            GITHUB_TOKEN:
              "github-secret",
          }),
        baseUrl:
          "https://api.example.test/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "github.repository.create",
        {
          owner: "alice",
          ownerType: "user",
          name: "demo",
        },
        context,
      );

    expect(result).toMatchObject({
      ok: true,
      data: {
        full_name: "alice/demo",
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(
      "https://api.example.test/user",
    );
    expect(calls[1]?.url).toBe(
      "https://api.example.test/user/repos",
    );

    const headers =
      calls[1]?.init
        .headers as Record<
        string,
        string
      >;
    expect(
      headers[
        "x-github-api-version"
      ],
    ).toBe("2026-03-10");
    expect(
      JSON.stringify(result),
    ).not.toContain(
      "github-secret",
    );
  });

  it("refuses GitLab creation when namespace ID and path disagree", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({ url, init });

      if (
        url.endsWith(
          "/namespaces/42",
        )
      ) {
        return jsonResponse({
          id: 42,
          full_path:
            "different/team",
        });
      }

      return jsonResponse({}, 500);
    }) as typeof fetch;

    const provider =
      new GitLabProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            GITLAB_TOKEN:
              "gitlab-secret",
          }),
        baseUrl:
          "https://gitlab.example.test/api/v4/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "gitlab.project.create",
        {
          namespaceId: 42,
          namespacePath:
            "expected/team",
          name: "demo",
          path: "demo",
        },
        context,
      );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code:
          "namespace_mismatch",
      },
    });
    expect(calls).toHaveLength(1);
  });

  it("uses Cloudflare PATCH for partial DNS updates", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      calls.push({
        url: urlOf(input),
        init,
      });

      return jsonResponse({
        success: true,
        result: {
          id: "record-id",
          type: "A",
          name:
            "www.example.com",
          content:
            "192.0.2.10",
        },
      });
    }) as typeof fetch;

    const provider =
      new CloudflareProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            CLOUDFLARE_API_TOKEN:
              "cf-secret",
          }),
        baseUrl:
          "https://api.cloudflare.test/client/v4/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "cloudflare.dns.update",
        {
          zoneId: "zone-id",
          recordId: "record-id",
          content: "192.0.2.10",
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(
      calls[0]?.init.method,
    ).toBe("PATCH");
    expect(calls[0]?.url).toBe(
      "https://api.cloudflare.test/client/v4/zones/zone-id/dns_records/record-id",
    );
  });

  it("verifies CircleCI workflow project ownership before cancel", async () => {
    const calls: RecordedCall[] = [];
    const workflowId =
      "5034460f-c7c4-4c43-9457-de07e2029e7b";

    const fetchImpl = (async (
      input,
      init = {},
    ) => {
      const url = urlOf(input);
      calls.push({ url, init });

      if (
        url.endsWith(
          `/workflow/${workflowId}`,
        )
      ) {
        return jsonResponse({
          id: workflowId,
          project_slug:
            "gh/example/project",
        });
      }

      if (
        url.endsWith(
          `/workflow/${workflowId}/cancel`,
        )
      ) {
        return jsonResponse(
          {
            message:
              "Workflow canceled.",
          },
          202,
        );
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    const provider =
      new CircleCIProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            CIRCLECI_TOKEN:
              "circle-secret",
          }),
        baseUrl:
          "https://circleci.example.test/api/v2/",
        fetchImpl,
      });

    const result =
      await provider.execute(
        "circleci.workflow.cancel",
        {
          projectSlug:
            "gh/example/project",
          workflowId,
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.init.method).toBe(
      "GET",
    );
    expect(calls[1]?.init.method).toBe(
      "POST",
    );
  });

  it("rejects malformed CircleCI project slugs before any API call", () => {
    const provider =
      new CircleCIProvider({
        secretResolver:
          new EnvironmentSecretResolver({
            CIRCLECI_TOKEN:
              "circle-secret",
          }),
      });

    expect(
      provider.resolveResources(
        "circleci.pipeline.list",
        {
          projectSlug:
            "gh/example/project/extra",
        },
      ),
    ).toEqual([]);
  });
});
