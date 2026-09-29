import type {
  AuthInfo,
} from "@modelcontextprotocol/server";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  MemoryAuditSink,
} from "../src/core/audit.js";
import {
  ProviderExecutor,
} from "../src/core/executor.js";
import type {
  Provider,
} from "../src/core/provider.js";
import {
  ProviderRegistry,
} from "../src/providers/registry.js";

class MockProvider
  implements Provider
{
  readonly descriptor = {
    id: "github",
    displayName: "GitHub",
    status: "available" as const,
  };

  calls = 0;

  async healthCheck() {
    return {
      ok: true,
      provider: "github",
    };
  }

  listCapabilities() {
    return [
      {
        name: "github.repo.update",
        description: "update repo",
        risk: "WRITE" as const,
        requiredScopes: [
          "github:repo:write",
        ],
        resourceKinds: [
          "github:repo",
        ],
      },
    ];
  }

  resolveResources() {
    return [
      "github:repo:example/project",
    ];
  }

  async execute() {
    this.calls += 1;
    return {
      ok: true,
      data: {
        secret: "not-a-real-secret",
      },
    };
  }
}

function auth(
  resources: string[],
): AuthInfo {
  return {
    token: "<REDACTED>",
    clientId: "test-client",
    scopes: [
      "github:repo:write",
    ],
    expiresAt: 4_000_000_000,
    extra: {
      subject: "user",
      allowedResources: resources,
    },
  };
}

describe("ProviderExecutor", () => {
  it("executes an authorized provider capability and writes metadata-only audit", async () => {
    const registry =
      new ProviderRegistry();
    const provider =
      new MockProvider();
    registry.register(provider);

    const audit =
      new MemoryAuditSink();
    const executor =
      new ProviderExecutor(
        registry,
        audit,
      );

    const result =
      await executor.execute(
        "github",
        "github.repo.update",
        {
          token:
            "must-not-enter-audit",
        },
        auth([
          "github:repo:example/*",
        ]),
      );

    expect(result.ok).toBe(true);
    expect(provider.calls).toBe(1);
    expect(audit.events).toHaveLength(
      1,
    );
    expect(
      JSON.stringify(audit.events),
    ).not.toContain(
      "must-not-enter-audit",
    );
    expect(
      audit.events[0],
    ).toMatchObject({
      providerId: "github",
      action:
        "github.repo.update",
      outcome: "success",
      resources: [
        "github:repo:example/project",
      ],
    });
  });

  it("denies unauthorized resources before provider execution", async () => {
    const registry =
      new ProviderRegistry();
    const provider =
      new MockProvider();
    registry.register(provider);

    const audit =
      new MemoryAuditSink();
    const executor =
      new ProviderExecutor(
        registry,
        audit,
      );

    const result =
      await executor.execute(
        "github",
        "github.repo.update",
        {},
        auth([
          "github:repo:other/*",
        ]),
      );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "policy_denied",
      },
    });
    expect(provider.calls).toBe(0);
    expect(
      audit.events[0]?.outcome,
    ).toBe("denied");
  });
});
