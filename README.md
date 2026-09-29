# Axymorrsen Infra MCP

Portable, secure MCP gateway for managing developer infrastructure across multiple providers.

## Goals

- **Portable:** works with any standards-compatible MCP client.
- **Secure:** provider credentials never leave the server.
- **Self-describing:** tools, resources, prompts, and optional skills explain how to use the gateway.
- **Provider-neutral:** integrations are adapters, not hard-coded platform dependencies.
- **Auditable:** every state-changing action is attributable and reviewable.

## Planned providers

GitHub, GitLab, Cloudflare, CircleCI, Vercel, Railway, Supabase, Docker Hub, Terraform Cloud, Kubernetes, Sentry, Vault, and additional provider packs.

## Security model

Clients receive scoped MCP authorization only. Provider credentials are stored outside the repository and resolved server-side through a secret backend. Destructive, security-sensitive, and billing actions are separated from ordinary reads and writes.

See [docs/security.md](docs/security.md) and [docs/architecture.md](docs/architecture.md).

## Status

Early architecture and bootstrap phase. No production credentials should be committed to this repository.
