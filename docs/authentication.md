# Authentication

Axymorrsen Infra MCP is an OAuth resource server. It does not issue access tokens and it does not embed a vendor-specific login system.

## Design

- Bring your own standards-compatible OAuth/OIDC authorization server.
- The MCP gateway validates JWT access tokens against the authorization server's JWKS.
- The token issuer and audience are validated exactly.
- Provider credentials are separate from MCP client credentials and remain server-side.
- Remote binding is refused unless authentication is configured.
- The protected-resource metadata endpoint is public so MCP clients can discover the authorization server.

This keeps ChatGPT, Codex, Claude, IDEs, and future MCP clients replaceable.

## Required production configuration

```text
MCP_BIND_HOST=0.0.0.0
MCP_PUBLIC_MCP_URL=https://mcp.example.com/mcp
MCP_AUTH_ISSUER=https://auth.example.com/
MCP_AUTH_JWKS_URL=https://auth.example.com/.well-known/jwks.json
MCP_AUTH_AUDIENCE=https://mcp.example.com/mcp
MCP_AUTH_REQUIRED_SCOPES=mcp
```

Use the exact issuer string published by your authorization server. The audience should identify this MCP resource, normally the exact public MCP URL.

## Supported token profile

The first implementation accepts signed JWT access tokens using asymmetric algorithms. The default allowlist is:

```text
RS256, PS256, ES256, EdDSA
```

Opaque token introspection can be added as a separate verifier without changing the MCP core.

## Client identity

For auditability the gateway requires a client identity claim. By default it checks:

```text
client_id, azp
```

Override with `MCP_AUTH_CLIENT_ID_CLAIMS` when your IdP uses another claim.

## Scope model

The connection gate defaults to the `mcp` scope. Provider-specific permissions such as `github:repo:write` and `cloudflare:dns:write` are enforced separately by the policy layer.

## Security boundaries

Never configure the MCP client with GitHub, GitLab, Cloudflare, CircleCI, cloud-provider, or Vault credentials. The client receives only MCP access tokens scoped to this gateway.
