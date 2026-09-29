import { randomUUID } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";
import {
  gatewayAuthContext,
} from "../auth/context.js";
import type {
  AuditEvent,
  AuditSink,
} from "./audit.js";
import {
  JsonLineAuditSink,
} from "./audit.js";
import {
  evaluateCapability,
} from "./policy.js";
import {
  getSafetyMode,
} from "./safety.js";
import type {
  ProviderResult,
} from "./types.js";
import type {
  ProviderRegistry,
} from "../providers/registry.js";

function failure(
  code: string,
  message: string,
): ProviderResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export class ProviderExecutor {
  readonly #registry: ProviderRegistry;
  readonly #audit: AuditSink;

  constructor(
    registry: ProviderRegistry,
    audit: AuditSink =
      new JsonLineAuditSink(),
  ) {
    this.#registry = registry;
    this.#audit = audit;
  }

  async execute(
    providerId: string,
    action: string,
    input: unknown,
    authInfo: AuthInfo | undefined,
  ): Promise<ProviderResult> {
    const provider =
      this.#registry.getProvider(
        providerId,
      );

    if (!provider) {
      return failure(
        "provider_not_available",
        "provider is not available",
      );
    }

    const capability =
      provider
        .listCapabilities()
        .find(
          (candidate) =>
            candidate.name === action,
        );

    if (!capability) {
      return failure(
        "capability_not_available",
        "capability is not available",
      );
    }

    if (!authInfo) {
      return failure(
        "authentication_required",
        "provider actions require an authenticated MCP caller",
      );
    }

    const requestId = randomUUID();
    const auth =
      gatewayAuthContext(authInfo);
    const resources = [
      ...provider.resolveResources(
        action,
        input,
      ),
    ];
    const context = {
      requestId,
      ...auth,
    };

    const decision =
      evaluateCapability(
        capability,
        context,
        resources,
        getSafetyMode(),
      );

    const baseAudit: Omit<
      AuditEvent,
      "timestamp" | "outcome"
    > = {
      requestId,
      clientId: context.clientId,
      subject: context.subject,
      providerId,
      action,
      risk: capability.risk,
      resources,
    };

    if (!decision.allowed) {
      await this.#audit.append({
        ...baseAudit,
        timestamp:
          new Date().toISOString(),
        outcome: "denied",
        reason: decision.reason,
      });

      return failure(
        decision.requiresStepUp
          ? "step_up_required"
          : "policy_denied",
        decision.reason,
      );
    }

    try {
      const result =
        await provider.execute(
          action,
          input,
          context,
        );

      await this.#audit.append({
        ...baseAudit,
        timestamp:
          new Date().toISOString(),
        outcome: result.ok
          ? "success"
          : "error",
        ...(result.error?.code
          ? {
              errorCode:
                result.error.code,
            }
          : {}),
      });

      return result;
    } catch {
      await this.#audit.append({
        ...baseAudit,
        timestamp:
          new Date().toISOString(),
        outcome: "error",
        errorCode:
          "provider_exception",
      });

      return failure(
        "provider_exception",
        "provider execution failed",
      );
    }
  }
}
