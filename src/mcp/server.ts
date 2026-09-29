import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { getSafetyMode } from "../core/safety.js";
import { providerRegistry } from "../providers/registry.js";
import { coreCapabilities } from "./catalog.js";

const riskSchema = z.enum([
  "READ",
  "WRITE",
  "DEPLOY",
  "DESTRUCTIVE",
  "SECURITY",
  "BILLING",
]);

const capabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  risk: riskSchema,
  requiredScopes: z.array(z.string()),
  resourceKinds: z.array(z.string()),
  idempotent: z.boolean().optional(),
});

function textAndStructured<T extends Record<string, unknown>>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

export function createInfraMcpServer(): McpServer {
  const server = new McpServer({
    name: "axymorrsen-infra-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "infra.capabilities",
    {
      title: "Infrastructure capabilities",
      description:
        "List capabilities exposed by this gateway. Call this first when the client has no prior knowledge of the server.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({ capabilities: z.array(capabilitySchema) }),
    },
    async () => {
      const output = {
        capabilities: [...coreCapabilities, ...providerRegistry.listCapabilities()],
      };
      return textAndStructured(output);
    },
  );

  server.registerTool(
    "infra.providers",
    {
      title: "Infrastructure providers",
      description:
        "List provider adapters known to the gateway and whether each adapter is available, planned, disabled, or degraded.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({
        providers: z.array(
          z.object({
            id: z.string(),
            displayName: z.string(),
            status: z.enum(["available", "planned", "disabled", "degraded"]),
          }),
        ),
      }),
    },
    async () => textAndStructured({ providers: providerRegistry.listProviders() }),
  );

  server.registerTool(
    "infra.permissions",
    {
      title: "Permission model",
      description:
        "Explain MCP scopes, resource allowlists, risk classes, and server-side enforcement. Never returns credentials.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({
        riskClasses: z.array(z.string()),
        principles: z.array(z.string()),
      }),
    },
    async () =>
      textAndStructured({
        riskClasses: ["READ", "WRITE", "DEPLOY", "DESTRUCTIVE", "SECURITY", "BILLING"],
        principles: [
          "Clients receive scoped MCP authorization, not provider credentials.",
          "Scopes are combined with resource allowlists.",
          "Destructive, security, and billing actions require step-up authorization.",
          "The server policy engine is authoritative even when a client requests broader access.",
        ],
      }),
  );

  server.registerTool(
    "infra.explain_tool",
    {
      title: "Explain infrastructure capability",
      description:
        "Explain a capability before using it. Recommended for unfamiliar or high-risk operations.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Exact capability name, for example infra.health"),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({ capability: capabilitySchema.nullable() }),
    },
    async ({ name }) => {
      const capability =
        coreCapabilities.find((candidate) => candidate.name === name) ??
        providerRegistry.findCapability(name) ??
        null;
      return textAndStructured({ capability });
    },
  );

  server.registerTool(
    "infra.health",
    {
      title: "Gateway health",
      description:
        "Return health information without returning secret values or raw provider credentials.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({
        gateway: z.literal("ok"),
        providers: z.array(
          z.object({
            ok: z.boolean(),
            provider: z.string(),
            message: z.string().optional(),
          }),
        ),
      }),
    },
    async () =>
      textAndStructured({ gateway: "ok" as const, providers: await providerRegistry.health() }),
  );

  server.registerTool(
    "infra.safety_status",
    {
      title: "Safety status",
      description: "Return the active server-enforced mutation safety mode.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({
        mode: z.enum(["normal", "read-only", "freeze-writes", "lockdown"]),
      }),
    },
    async () => textAndStructured({ mode: getSafetyMode() }),
  );

  server.registerTool(
    "infra.help",
    {
      title: "First-use help",
      description:
        "Give an unfamiliar MCP client a safe starting workflow for this infrastructure gateway.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      outputSchema: z.object({ steps: z.array(z.string()) }),
    },
    async () =>
      textAndStructured({
        steps: [
          "Call infra.capabilities before assuming an infrastructure action exists.",
          "Call infra.providers to see which adapters are available.",
          "Use infra.explain_tool before an unfamiliar or high-risk action.",
          "Read current state before mutating infrastructure when practical.",
          "Change only the resource named by the user and preserve unrelated settings.",
          "Verify state after every write or deployment.",
          "Never request, display, or echo provider credentials.",
        ],
      }),
  );

  server.registerResource(
    "getting-started",
    "docs://getting-started",
    { mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Getting Started",
            "",
            "1. Call `infra.capabilities`.",
            "2. Call `infra.providers`.",
            "3. Read `docs://security` before enabling write-capable provider adapters.",
            "4. Use the narrowest capability that satisfies the user's request.",
            "5. Verify state after mutations.",
          ].join("\n"),
        },
      ],
    }),
  );

  server.registerResource(
    "security",
    "docs://security",
    { mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Security",
            "",
            "Provider credentials remain server-side.",
            "MCP clients receive scoped authorization only.",
            "High-risk operations are subject to server-side policy and step-up authorization.",
            "Secrets must never be returned in tool output or logs.",
          ].join("\n"),
        },
      ],
    }),
  );

  server.registerPrompt(
    "infra-first-use",
    {
      title: "Infrastructure MCP first use",
      description: "Safely orient a model that has never used this MCP gateway before.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "Discover this infrastructure gateway using infra.help, infra.capabilities, infra.providers, and infra.permissions before attempting any mutation.",
          },
        },
      ],
    }),
  );

  return server;
}
