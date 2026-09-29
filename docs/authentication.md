# Authentication

Axymorrsen Infra MCP is an OAuth resource server. It does not issue end-user access tokens.

## Modes

### `disabled`

Local development only.

- The server binds to loopback by default.
- Non-loopback binding is rejected.
- Provider credentials are still never accepted from MCP clients.

### `jwt`

Remote OAuth resource-server mode.

The gateway:

1. Publishes RFC 9728 Protected Resource Metadata.
2. Advertises the external authorization server.
3. Requires a Bearer access token for `/mcp`.
4. Verifies JWT signature through the configured remote JWKS.
5. Verifies issuer, audience, expiry, and required MCP scopes.
6. Converts verified claims into MCP `AuthInfo`.
7. Keeps provider credentials in the server-side secret backend.

The authorization server remains an independent component and can be replaced without changing provider adapters.

## Resource metadata

For a public resource URL such as:

```text
https://mcp.example.com/mcp
```

the gateway serves path-aware Protected Resource Metadata at:

```text
https://mcp.example.com/.well-known/oauth-protected-resource/mcp
```

and exposes the compatibility authorization-server metadata route supported by the MCP SDK.

Unauthenticated MCP calls receive an OAuth Bearer challenge containing the resource metadata URL.

## JWT claims

Required standard validation:

- signature from the configured JWKS
- `iss`
- `aud`
- `exp`

Scopes may be supplied by either:

- `scope`: space-separated string
- `scp`: string or string array

The client identifier is resolved from the first available claim:

1. `client_id`
2. `azp`
3. `sub`

The optional private `mcp_resources` string array becomes the resource allowlist used by the gateway policy layer.

## Production requirements

- Use HTTPS for the public MCP URL and authorization server.
- Use short-lived access tokens.
- Rotate authorization-server signing keys.
- Restrict allowed `Host` values.
- For browser-originated traffic, explicitly allow only trusted origins.
- Never store provider secrets in access-token claims.
- Never expose provider credentials to MCP clients.
- Keep destructive/security/billing policy enforcement server-side.

`MCP_AUTH_ALLOW_INSECURE_LOCALHOST=true` exists only for local integration testing and must not be enabled in production.


## Step-up authorization

High-risk provider capabilities such as destructive, security, or billing actions require an additional server-side authorization signal.

The initial JWT profile recognizes the boolean claim:

```json
{
  "mcp_step_up": true
}
```

This claim must only be issued by the trusted authorization server after the authorization policy has performed the required step-up authentication. Clients cannot self-assert it. Tokens without this claim remain unable to execute high-risk capabilities.
