import type {
  ExecutionContext,
} from "../src/core/types.js";
import {
  SecretValue,
  type SecretResolver,
} from "../src/secrets/resolver.js";
import {
  CircleCIProvider,
} from "../src/providers/circleci.js";
import {
  CloudflareProvider,
} from "../src/providers/cloudflare.js";
import {
  GitHubProvider,
} from "../src/providers/github.js";
import {
  GitLabProvider,
} from "../src/providers/gitlab.js";
import {
  describe,
  expect,
  it,
} from "vitest";

class StaticSecrets
  implements SecretResolver
{
  async resolve() {
    return new SecretValue(
      "test-token",
    );
  }
}

const context: ExecutionContext = {
  requestId: "request",
  clientId: "client",
  subject: "user",
  scopes: [],
  allowedResources: [],
  stepUpAuthorized: false,
};

function response(
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
  it("verifies GitHub user ownership before creating a user repository", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch =
      async (input) => {
        const url = String(input);
        calls.push(url);
        if (
          url.endsWith("/user")
        ) {
          return response({
            login: "Zhanfg",
          });
        }
        return response(
          {
            id: 1,
            name: "project",
            full_name:
              "Zhanfg/project",
            html_url:
              "https://github.com/Zhanfg/project",
            private: false,
            default_branch: "main",
          },
          201,
        );
      };

    const provider =
      new GitHubProvider({
        secretResolver:
          new StaticSecrets(),
        fetchImpl: fakeFetch,
      });

    const result =
      await provider.execute(
        "github.repository.create",
        {
          owner: "Zhanfg",
          ownerType: "user",
          name: "project",
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "https://api.github.com/user",
      "https://api.github.com/user/repos",
    ]);
  });

  it("verifies a GitLab namespace before project creation", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch =
      async (input) => {
        const url = String(input);
        calls.push(url);
        if (
          url.includes(
            "/namespaces/42",
          )
        ) {
          return response({
            full_path: "team",
          });
        }
        return response(
          {
            id: 7,
            name: "project",
            path_with_namespace:
              "team/project",
            web_url:
              "https://gitlab.com/team/project",
            visibility: "private",
            default_branch: "main",
          },
          201,
        );
      };

    const provider =
      new GitLabProvider({
        secretResolver:
          new StaticSecrets(),
        fetchImpl: fakeFetch,
      });

    const result =
      await provider.execute(
        "gitlab.project.create",
        {
          namespaceId: 42,
          namespacePath: "team",
          name: "project",
          path: "project",
        },
        context,
      );

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "https://gitlab.com/api/v4/namespaces/42",
      "https://gitlab.com/api/v4/projects",
    ]);
  });

  it("maps Cloudflare DNS actions to zone resources", () => {
    const provider =
      new CloudflareProvider({
        secretResolver:
          new StaticSecrets(),
      });

    expect(
      provider.resolveResources(
        "cloudflare.dns.delete",
        {
          zoneId: "zone-1",
          recordId: "record-1",
        },
      ),
    ).toEqual([
      "cloudflare:zone:zone-1",
    ]);

    expect(
      provider
        .listCapabilities()
        .find(
          (item) =>
            item.name ===
            "cloudflare.dns.delete",
        )?.risk,
    ).toBe("DESTRUCTIVE");
  });

  it("refuses to mutate a CircleCI workflow when the declared project does not match", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch =
      async () => {
        calls += 1;
        return response({
          id: "11111111-1111-4111-8111-111111111111",
          project_slug:
            "gh/other/project",
        });
      };

    const provider =
      new CircleCIProvider({
        secretResolver:
          new StaticSecrets(),
        fetchImpl: fakeFetch,
      });

    const result =
      await provider.execute(
        "circleci.workflow.cancel",
        {
          projectSlug:
            "gh/example/project",
          workflowId:
            "11111111-1111-4111-8111-111111111111",
        },
        context,
      );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "project_mismatch",
      },
    });
    expect(calls).toBe(1);
  });
});
