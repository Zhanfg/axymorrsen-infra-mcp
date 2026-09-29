import type {
  Capability,
  ExecutionContext,
} from "./types.js";
import type { SafetyMode } from "./safety.js";
import {
  resourceHasKind,
  resourcesAllowed,
} from "./resources.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresStepUp: boolean;
  reason: string;
}

function denied(
  reason: string,
  requiresStepUp = false,
): PolicyDecision {
  return {
    allowed: false,
    requiresStepUp,
    reason,
  };
}

export function evaluateCapability(
  capability: Capability,
  context: ExecutionContext,
  requestedResources: readonly string[] = [],
  safetyMode: SafetyMode = "normal",
): PolicyDecision {
  if (safetyMode === "lockdown") {
    return denied(
      "gateway safety mode is lockdown",
    );
  }

  if (
    (safetyMode === "read-only" ||
      safetyMode === "freeze-writes") &&
    capability.risk !== "READ"
  ) {
    return denied(
      `gateway safety mode ${safetyMode} blocks mutations`,
    );
  }

  const missingScope =
    capability.requiredScopes.find(
      (scope) =>
        !context.scopes.includes(scope),
    );

  if (missingScope) {
    return denied(
      `missing required scope: ${missingScope}`,
    );
  }

  if (
    capability.resourceKinds.length > 0 &&
    requestedResources.length === 0
  ) {
    return denied(
      "provider did not resolve a target resource",
    );
  }

  const invalidResource =
    requestedResources.find(
      (resource) =>
        !resourceHasKind(
          resource,
          capability.resourceKinds,
        ),
    );

  if (invalidResource) {
    return denied(
      `resource is outside capability kind: ${invalidResource}`,
    );
  }

  if (
    !resourcesAllowed(
      context.allowedResources,
      requestedResources,
    )
  ) {
    return denied(
      "target resource is outside the caller allowlist",
    );
  }

  const requiresStepUp =
    capability.risk === "DESTRUCTIVE" ||
    capability.risk === "SECURITY" ||
    capability.risk === "BILLING";

  if (
    requiresStepUp &&
    !context.stepUpAuthorized
  ) {
    return denied(
      "high-risk capability requires step-up authorization",
      true,
    );
  }

  return {
    allowed: true,
    requiresStepUp: false,
    reason: "authorized",
  };
}
