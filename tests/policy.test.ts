import { describe, expect, it } from "vitest";
import { evaluateCapability } from "../src/core/policy.js";
import type { Capability, ExecutionContext } from "../src/core/types.js";

const context: ExecutionContext = {
  requestId: "test",
  clientId: "client",
  subject: "user",
  scopes: ["github:repo:write"],
  allowedResources: ["github:repo:example/project"],
};

function capability(overrides: Partial<Capability> = {}): Capability {
  return {
    name: "github.repo.update",
    description: "test capability",
    risk: "WRITE",
    requiredScopes: ["github:repo:write"],
    resourceKinds: ["github:repo"],
    ...overrides,
  };
}

describe("evaluateCapability", () => {
  it("allows an ordinary write when its scope exists", () => {
    expect(evaluateCapability(capability(), context)).toEqual({
      allowed: true,
      requiresStepUp: false,
      reason: "authorized",
    });
  });

  it("denies a capability when a required scope is missing", () => {
    expect(
      evaluateCapability(
        capability({ requiredScopes: ["cloudflare:dns:write"] }),
        context,
      ),
    ).toEqual({
      allowed: false,
      requiresStepUp: false,
      reason: "missing required scope: cloudflare:dns:write",
    });
  });

  it("requires step-up authorization for destructive actions", () => {
    expect(
      evaluateCapability(capability({ risk: "DESTRUCTIVE" }), context),
    ).toMatchObject({ allowed: true, requiresStepUp: true });
  });
});
