import type { Capability, ExecutionContext } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  requiresStepUp: boolean;
  reason: string;
}

export function evaluateCapability(
  capability: Capability,
  context: ExecutionContext,
): PolicyDecision {
  const missingScope = capability.requiredScopes.find(
    (scope) => !context.scopes.includes(scope),
  );

  if (missingScope) {
    return {
      allowed: false,
      requiresStepUp: false,
      reason: `missing required scope: ${missingScope}`,
    };
  }

  const requiresStepUp =
    capability.risk === "DESTRUCTIVE" ||
    capability.risk === "SECURITY" ||
    capability.risk === "BILLING";

  return {
    allowed: true,
    requiresStepUp,
    reason: requiresStepUp
      ? "high-risk capability requires step-up authorization"
      : "authorized",
  };
}
