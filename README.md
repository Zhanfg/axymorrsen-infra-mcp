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

Remote deployments operate as an OAuth resource server. They publish protected-resource metadata and validate signed access tokens against a configured IdP; the MCP gateway does not issue tokens itself.

See [docs/security.md](docs/security.md), [docs/authentication.md](docs/authentication.md), [docs/architecture.md](docs/architecture.md), and [docs/compatibility.md](docs/compatibility.md).

## Repository boundary

This public repository contains reusable code, schemas, documentation, and deployment templates. Personal infrastructure configuration, allowlists, production mappings, and secrets belong outside this repository.

## Status

Early architecture and bootstrap phase. No production credentials should be committed to this repository.
