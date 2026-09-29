# OCI / Docker Deployment

The repository ships a multi-stage OCI-compatible Dockerfile.

## Fail-closed default

The image sets:

```text
MCP_BIND_HOST=0.0.0.0
```

Remote binding is rejected unless `MCP_AUTH_MODE=jwt` is configured. Starting the image without remote authentication therefore fails instead of exposing an unauthenticated infrastructure control plane.

## Build

```sh
docker build -t axymorrsen-infra-mcp .
```

## Run

Inject configuration and secrets using the deployment platform's secret store:

```sh
docker run --rm -p 3000:3000 \
  -e MCP_AUTH_MODE=jwt \
  -e MCP_PUBLIC_URL=https://mcp.example.com/mcp \
  -e MCP_AUTH_ISSUER_URL=https://auth.example.com \
  -e MCP_AUTH_JWKS_URL=https://auth.example.com/.well-known/jwks.json \
  -e MCP_AUTHORIZATION_ENDPOINT=https://auth.example.com/oauth2/authorize \
  -e MCP_TOKEN_ENDPOINT=https://auth.example.com/oauth2/token \
  -e MCP_AUTH_REQUIRED_SCOPES=infra:connect \
  -e GITHUB_CREDENTIAL_REF=env:GITHUB_TOKEN \
  -e GITHUB_TOKEN=<REDACTED> \
  axymorrsen-infra-mcp
```

Do not use literal secrets in a production shell command. The example shows environment names only; use Docker secrets, Kubernetes Secrets with an external secret operator, Vault injection, or the hosting platform's secret manager.

## Runtime

The final image:

- runs as the unprivileged `node` user
- contains production dependencies only
- exposes port 3000
- includes the public docs and optional skills that the MCP resource endpoints expose
- has an HTTP health check at `/healthz`

The image does not bake any provider credential into a layer.


## Vault-backed provider credentials

For deployments that should not carry every provider token directly in the process environment, enable the Vault KV v2 resolver:

```text
SECRET_BACKEND=env,vault-kv2
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=<BOOTSTRAP_TOKEN>
GITHUB_CREDENTIAL_REF=vault-kv2:secret/providers/github#token
CLOUDFLARE_CREDENTIAL_REF=vault-kv2:secret/providers/cloudflare#token
```

The Vault bootstrap token is the only bootstrap credential required by this backend and should be narrowly scoped to the exact KV paths used for provider credentials. The MCP surface never exposes resolved secret values.


## Published distributions

Stable releases are produced from `main` and include a prebuilt Node bundle plus a multi-architecture OCI image.

See [release.md](release.md) for version/tag semantics, checksums, SBOMs, provenance attestation, and GHCR naming.
