# Client Compatibility

The gateway is designed for zero prior knowledge.

A new MCP client should be able to connect and safely discover the system using standard MCP primitives:

- Tools: executable operations with precise schemas and descriptions.
- Resources: durable help, provider documentation, and security guidance.
- Prompts: reusable operational workflows.
- Skills: optional enhanced agent guidance where the client supports them.

## Required self-description tools

The gateway should expose:

- `infra.capabilities`
- `infra.providers`
- `infra.permissions`
- `infra.explain_tool`
- `infra.health`
- `infra.safety_status`

Skills must not be required for basic operation.

## Local-only clients

Clients that support stdio but not remote Streamable HTTP can use a thin local bridge. The bridge must not store provider credentials; it authenticates to the remote gateway.
