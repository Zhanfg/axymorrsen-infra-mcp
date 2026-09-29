# Axymorrsen Infrastructure MCP

Use this skill only as an enhancement. The MCP server must remain usable without it.

## Operating principles

1. Discover capabilities before assuming an action exists.
2. Read current state before mutating infrastructure when practical.
3. Change only the resource named by the user.
4. Preserve unrelated settings unless explicitly requested.
5. Verify state after writes and deployments.
6. Never expose provider credentials or secret values.
7. Treat destructive, security, and billing actions as high risk.
8. Prefer reversible operations and record enough context for audit.

## First-use workflow

1. Call `infra.capabilities`.
2. Call `infra.permissions` when authorization is uncertain.
3. Use `infra.explain_tool` before unfamiliar or high-risk actions.
4. Execute the narrowest tool that satisfies the request.
5. Verify the result.
