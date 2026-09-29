import type { Capability } from "../core/types.js";

export const coreCapabilities: Capability[] = [
  {
    name: "infra.capabilities",
    description:
      "List executable infrastructure capabilities currently exposed by this gateway.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.providers",
    description:
      "List known infrastructure providers and their current implementation status.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.permissions",
    description:
      "Explain the gateway permission model without revealing credentials or secret values.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.auth_status",
    description:
      "Report whether this MCP request is authenticated and which MCP scopes were granted, without exposing bearer tokens.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.explain_tool",
    description:
      "Explain one capability, its risk class, required scopes, and recommended use pattern.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.health",
    description:
      "Return non-secret gateway and provider health information.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.safety_status",
    description:
      "Return the server-enforced safety mode controlling infrastructure mutations.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
  {
    name: "infra.help",
    description:
      "Return a concise first-use guide for an unfamiliar MCP client or model.",
    risk: "READ",
    requiredScopes: [],
    resourceKinds: [],
    idempotent: true,
  },
];
