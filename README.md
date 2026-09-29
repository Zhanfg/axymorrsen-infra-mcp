# Axymorrsen Infra MCP

Portable, security-first MCP gateway for operating developer infrastructure across multiple providers from any standards-compatible MCP client.

## Current capabilities

The gateway currently ships executable adapters for:

- GitHub
- GitLab
- Cloudflare
- CircleCI
- Vercel
- Railway
- Supabase
- Sentry
- HCP Terraform
- Docker Hub
- Kubernetes
- HashiCorp Vault

The public MCP surface is self-describing through tools, resources, prompts, JSON schemas, and an optional agent skill.

## Security model

Provider credentials never need to leave the server. MCP clients receive scoped MCP authorization only.

The execution kernel enforces:

- OAuth/JWT issuer, audience, expiry, client identity, scopes, and resource grants
- concrete target-resource validation
- server-side safety modes: `normal`, `read-only`, `freeze-writes`, and `lockdown`
- step-up authorization for destructive, security-sensitive, and billing actions
- metadata-only audit events
- redacted server-side secret resolution through `env:` and Vault KV v2 references

Remote exposure fails closed unless OAuth/JWT resource-server authentication is configured.

## Portability

Two transports are supported:

- **Remote clients:** standard MCP over Streamable HTTP
- **Stdio-only desktop clients:** the included stdio-to-remote bridge

The bridge mirrors remote tools, resources, resource templates, and prompts while keeping provider credentials on the server.

See [docs/client-configs.md](docs/client-configs.md) and [docs/bridge.md](docs/bridge.md).

## Deployment

Build locally:

```sh
docker build -t axymorrsen-infra-mcp .
```

Production deployments can use environment-backed credentials or Vault KV v2 references.

See [docs/deployment.md](docs/deployment.md), [docs/secrets.md](docs/secrets.md), and [docs/authentication.md](docs/authentication.md).

## Releases

Stable versions are published from `main` using the version in `package.json`.

Each release is designed to include:

- a GitHub Release
- a prebuilt Node runtime bundle
- CycloneDX SBOM
- SHA-256 checksums
- multi-architecture OCI images for amd64 and arm64
- GitHub provenance attestation for the OCI image

See [docs/release.md](docs/release.md).

## Repository boundary

This public repository contains reusable code, schemas, documentation, tests, skills, client templates, and deployment workflows.

Personal infrastructure configuration, production resource allowlists, OAuth client assignments, and secret values belong outside the repository.

## Development verification

The CI gate runs:

```text
npm ci --ignore-scripts
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
release bundle + checksum verification
OCI image build
unauthenticated remote fail-closed check
```
