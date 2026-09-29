import {
  describe,
  expect,
  it,
} from "vitest";
import {
  evaluateCapability,
} from "../src/core/policy.js";
import type {
  Capability,
  ExecutionContext,
} from "../src/core/types.js";

const context: ExecutionContext = {
  requestId: "test",
  clientId: "client",
  subject: "user",
  scopes: ["github:repo:write"],
  allowedResources: [
    "github:repo:example/*",
  ],
  stepUpAuthorized: false,
};

function capability(
  overrides: Partial<Capability> = {},
): Capability {
  return {
    name: "github.repo.update",
    description: "test capability",
    risk: "WRITE",
    requiredScopes: [
      "github:repo:write",
    ],
    resourceKinds: [
      "github:repo",
    ],
    ...overrides,
  };
}

describe("evaluateCapability", () => {
  it("allows a scoped write to an authorized resource", () => {
    expect(
      evaluateCapability(
        capability(),
        context,
        [
          "github:repo:example/project",
        ],
      ),
    ).toEqual({
      allowed: true,
      requiresStepUp: false,
      reason: "authorized",
    });
  });

  it("denies a missing scope", () => {
    expect(
      evaluateCapability(
        capability({
          requiredScopes: [
            "cloudflare:dns:write",
          ],
        }),
        context,
        [
          "github:repo:example/project",
        ],
      ),
    ).toMatchObject({
      allowed: false,
      requiresStepUp: false,
    });
  });

  it("denies a resource outside the caller allowlist", () => {
    expect(
      evaluateCapability(
        capability(),
        context,
        [
          "github:repo:other/project",
        ],
      ),
    ).toMatchObject({
      allowed: false,
      reason:
        "target resource is outside the caller allowlist",
    });
  });

  it("blocks mutations in read-only safety mode", () => {
    expect(
      evaluateCapability(
        capability(),
        context,
        [
          "github:repo:example/project",
        ],
        "read-only",
      ),
    ).toMatchObject({
      allowed: false,
    });
  });

  it("requires step-up authorization for destructive actions", () => {
    expect(
      evaluateCapability(
        capability({
          risk: "DESTRUCTIVE",
        }),
        context,
        [
          "github:repo:example/project",
        ],
      ),
    ).toMatchObject({
      allowed: false,
      requiresStepUp: true,
    });

    expect(
      evaluateCapability(
        capability({
          risk: "DESTRUCTIVE",
        }),
        {
          ...context,
          stepUpAuthorized: true,
        },
        [
          "github:repo:example/project",
        ],
      ),
    ).toMatchObject({
      allowed: true,
    });
  });
});
