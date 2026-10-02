# Authentication

Axymorrsen Infra MCP is an OAuth resource server. It does not issue end-user access tokens.

## Modes

### `disabled`

Local development only. Non-loopback binding is rejected.

### `jwt`

Locally verifies JWT access tokens using the authorization server's JWKS. Use this only when the authorization server guarantees JWT access tokens.

### `introspection`

Validates Bearer tokens through the OAuth 2.0 token introspection endpoint. This supports both opaque and JWT access tokens and is the recommended mode for ZITADEL Dynamic Client Registration.

ZITADEL's DCR implementation creates OIDC applications with Bearer access tokens. The resource server therefore must not assume that every access token is a locally verifiable JWT.

## ZITADEL DCR + introspection profile

Create an API application in the MCP project and choose Basic authentication. Its client ID and client secret authenticate the MCP resource server to ZITADEL's introspection endpoint.

The DCR clients must request the MCP project's audience scope:

```text
urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
```

This places the resource-server project in the issued token's audience. ZITADEL introspection returns `active=true` only when the introspecting API is authorized for that token.

Example:

```text
MCP_AUTH_MODE=introspection

MCP_PUBLIC_URL=https://mcp.example.com/mcp
MCP_AUTH_ISSUER_URL=https://instance.zitadel.cloud
MCP_AUTHORIZATION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/authorize
MCP_TOKEN_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/token
MCP_REGISTRATION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/register

MCP_AUTH_INTROSPECTION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/introspect
MCP_AUTH_INTROSPECTION_CLIENT_ID=<API_CLIENT_ID>
MCP_AUTH_INTROSPECTION_CLIENT_SECRET=<API_CLIENT_SECRET>
MCP_AUTH_INTROSPECTION_AUDIENCE=<PROJECT_ID>

MCP_AUTH_REQUIRED_SCOPES=openid,urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
MCP_AUTH_SCOPES_SUPPORTED=openid,profile,email,offline_access,urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
```

The introspection verifier checks:

1. HTTPS endpoint configuration.
2. HTTP success from the introspection endpoint.
3. `active=true`.
4. issuer match.
5. token expiry.
6. `client_id` presence.
7. optional configured audience presence.
8. required OAuth scopes through the MCP server auth middleware.

The introspection client secret is never returned through MCP tools, resources, health responses, or audit records.

## JWT audience validation

JWT mode supports:

- `exact`: the JWT audience must contain `MCP_AUTH_AUDIENCE`.
- `client_id`: the JWT audience must contain the verified `client_id` / `azp`.

The `client_id` mode remains available for authorization servers that issue JWTs to dynamically registered clients, but ZITADEL DCR's default Bearer-token behavior is better served by introspection mode.

## Resource metadata

For:

```text
https://mcp.example.com/mcp
```

the gateway serves RFC 9728 Protected Resource Metadata at:

```text
https://mcp.example.com/.well-known/oauth-protected-resource/mcp
```

Unauthenticated MCP calls receive an OAuth Bearer challenge referencing that metadata document.

## Resource authorization

OAuth authentication and infrastructure authorization are separate layers.

Provider actions require both:

- the provider capability scope
- an allowed concrete MCP resource

The optional `mcp_resources` and `mcp_step_up` fields are consumed when supplied by a trusted authorization source. A later server-side grant backend can supply the same policy data without placing provider authorization in identity tokens.

## Production requirements

- Use HTTPS.
- Use short-lived OAuth access tokens.
- Store introspection client credentials only in the deployment secret store.
- Restrict the introspection API application to the MCP project.
- Never expose provider credentials to MCP clients.
- Keep destructive/security/billing enforcement server-side.
- Leave `MCP_AUTH_ALLOW_INSECURE_LOCALHOST=false` in production.
