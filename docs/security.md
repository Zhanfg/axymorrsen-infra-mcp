# Security Model

## Core invariant

An MCP client must never receive the underlying GitHub, GitLab, Cloudflare, CircleCI, cloud-provider, database, or secret-store credentials.

Clients receive only scoped MCP authorization. Provider credentials are resolved server-side after authorization and policy checks.

## Risk classes

| Level | Class | Examples |
| --- | --- | --- |
| L0 | READ | list repositories, inspect DNS, read CI status |
| L1 | WRITE | update a file, create a branch, change one DNS record |
| L2 | DEPLOY | production deployment, infrastructure apply |
| L3 | DESTRUCTIVE | delete repository, destroy environment |
| L4 | SECURITY / BILLING | IAM changes, token management, billing changes |

The server, not the client model, enforces these classes.

## Required controls

- Least-privilege scopes and resource allowlists.
- Short-lived access tokens with audience validation.
- No token passthrough from clients to providers.
- Step-up authorization for high-risk operations.
- Emergency global write freeze.
- Append-only audit records for state-changing operations.
- Redaction of secrets from logs and tool output.
- Explicit before/after capture where a provider permits it.

## Secret handling

Real credentials must never be committed to this repository, examples, tests, logs, prompts, skills, or generated documentation. Use placeholders such as `<REDACTED>` or credential references.
