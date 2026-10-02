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
5. Verifies issuer, expiry, audience policy, and required OAuth scopes.
6. Converts verified claims into MCP `AuthInfo`.
7. Keeps provider credentials in the server-side secret backend.

The authorization server remains an independent component and can be replaced without changing provider adapters.

## Audience validation

Two audience modes are supported.

### `exact`

Default mode.

```text
MCP_AUTH_AUDIENCE_MODE=exact
MCP_AUTH_AUDIENCE=https://mcp.example.com/mcp
```

The JWT `aud` claim must contain the configured exact audience.

### `client_id`

For authorization servers whose dynamically registered clients share a project audience.

```text
MCP_AUTH_AUDIENCE_MODE=client_id
```

The JWT signature, issuer and expiry are verified first. The gateway then requires:

- a `client_id` or `azp` claim
- the JWT `aud` claim to contain that exact client identifier

The subject claim is never accepted as a client identifier in this mode.

This mode is suitable for ZITADEL Dynamic Client Registration, where JWT access tokens for DCR applications share the `ZITADEL DCR` project audience and may contain multiple registered client IDs. It avoids treating a shared project audience as sufficient proof of the calling client.

## ZITADEL DCR profile

A compatible Railway configuration uses ZITADEL's standard endpoints:

```text
MCP_AUTH_AUDIENCE_MODE=client_id
MCP_AUTH_REQUIRED_SCOPES=openid
MCP_AUTH_SCOPES_SUPPORTED=openid profile email offline_access
MCP_REGISTRATION_ENDPOINT=https://<instance>/oauth/v2/register
```

ZITADEL Dynamic Client Registration must be enabled separately on the instance. MCP-compatible open registration also requires ZITADEL's unauthenticated DCR mode.

Dynamically registered clients are stored in ZITADEL's dedicated `ZITADEL DCR` project; a separately created project ID is therefore not used as the fixed MCP audience in `client_id` mode.

## Resource metadata

For a public resource URL such as:

```text
https://mcp.example.com/mcp
```

the gateway serves path-aware Protected Resource Metadata at:

```text
https://mcp.example.com/.well-known/oauth-protected-resource/mcp
```

Unauthenticated MCP calls receive an OAuth Bearer challenge containing the resource metadata URL.

## JWT claims

Scopes may be supplied by either:

- `scope`: space-separated string
- `scp`: string or string array

The client identifier is normally resolved from:

1. `client_id`
2. `azp`
3. `sub` only in exact-audience mode

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

The initial JWT profile recognizes:

```json
{
  "mcp_step_up": true
}
```

This claim must only be issued by the trusted authorization server after the authorization policy has performed the required step-up authentication. Clients cannot self-assert it. Tokens without this claim remain unable to execute high-risk capabilities.
