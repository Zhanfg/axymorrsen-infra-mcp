# Architecture

## Design goal

Axymorrsen Infra MCP is a client-neutral infrastructure control plane. ChatGPT, Codex, Claude, IDE agents, local bridges, and future MCP clients are replaceable consumers. Provider credentials and authorization policy remain under the operator's control.

## High-level flow

```text
MCP client
   |
   | Streamable HTTP + OAuth/OIDC
   v
MCP Gateway
   |
   +-- Authorization
   +-- Policy Engine
   +-- Audit Log
   +-- Provider Registry
            |
            +-- GitHub
            +-- GitLab
            +-- Cloudflare
            +-- CircleCI
            +-- ...
```

## Portability requirements

1. The public API follows MCP rather than a vendor-specific chat extension.
2. Provider adapters implement a shared contract.
3. Deployment targets an OCI container and standard HTTPS.
4. Secrets are abstracted behind a secret backend.
5. A local stdio bridge may proxy older/local-only clients to the remote gateway.
6. Client-specific skills are optional enhancements, never runtime requirements.

## Repository separation

- Public core: this repository.
- Private configuration: separate private repository or configuration service.
- Secrets: Vault/KMS/deployment secret store only.
