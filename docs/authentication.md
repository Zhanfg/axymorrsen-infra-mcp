# Authentication and Railway deployment

The gateway is an OAuth resource server: it validates caller access tokens, but does not issue them or run a login page. Provider credentials remain on the server. OAuth login success proves token acquisition only; gateway validation and provider authorization are separate checks.

## Modes and token handling

- `disabled`: loopback discovery/development only. Provider actions still require an authenticated caller. Container/remote binding fails closed.
- `jwt`: verify signature through JWKS, exact configured issuer, expiry/not-before and audience. Use only when the authorization server issues JWT access tokens. Preserve the issuer string from discovery, including whether it ends in `/`.
- `introspection`: POST either opaque or JWT access tokens to the trusted introspection endpoint. This is the recommended mode for ZITADEL DCR Bearer tokens and also checks revocation.

Token shape is logged only as `jwt` or `opaque`; it never selects a weaker verifier or enables fallback after JWT verification fails. Both modes normalize to the same SDK `AuthInfo` and gateway identity (client ID, subject, scopes, resource grants and step-up status). `infra.identity` reports only the current verified caller's identity and grants, never tokens.

## Required and optional configuration

| Variable | Requirement |
| --- | --- |
| `MCP_AUTH_MODE` | Set explicitly to `jwt` or `introspection` for remote deployment |
| `MCP_PUBLIC_URL` | Required: complete public HTTPS `/mcp` URL |
| `MCP_AUTH_ISSUER_URL` | Required: exact issuer from the provider's discovery document |
| `MCP_AUTHORIZATION_ENDPOINT` | Required in either authenticated mode |
| `MCP_TOKEN_ENDPOINT` | Required in either authenticated mode |
| `MCP_AUTH_JWKS_URL` | Required in JWT mode |
| `MCP_AUTH_INTROSPECTION_ENDPOINT` | Required in introspection mode |
| `MCP_AUTH_INTROSPECTION_CLIENT_ID` | Required in introspection mode: dedicated API application's ID |
| `MCP_AUTH_INTROSPECTION_CLIENT_SECRET` | Required in introspection mode: API application's secret, injected from the deployment secret store |
| `MCP_AUTH_INTROSPECTION_AUDIENCE` | Optional additional audience check; recommended ZITADEL MCP project ID |
| `MCP_AUTH_REQUIRED_SCOPES` | Optional; defaults to `infra:connect`; explicitly set to scopes your provider actually grants |
| `MCP_AUTH_SCOPES_SUPPORTED` | Optional; defaults to required scopes; must include all required scopes |
| `MCP_REGISTRATION_ENDPOINT` | Optional; advertise only when DCR is enabled and permitted |
| `MCP_ALLOWED_ORIGINS` | Optional comma/space-separated exact origins; needed for direct browser requests such as Inspector UI |
| `MCP_ALLOWED_HOSTS` | Optional additional hostnames; the public URL's hostname is always allowed |
| `MCP_BIND_HOST` | For Railway/container use `0.0.0.0` |
| `PORT` | Injected by Railway; takes precedence over `MCP_PORT` (default 3000) |
| `MCP_AUTH_AUDIENCE` | Optional JWT audience; defaults to `MCP_PUBLIC_URL` |
| `MCP_AUTH_AUDIENCE_MODE` | Optional JWT mode: `exact` (default) or `client_id` |
| `MCP_AUTH_ALLOW_INSECURE_LOCALHOST` | Test fixtures only; keep false in production |

Legacy aliases are supported: `ZITADEL_ISSUER`, `ZITADEL_INTROSPECTION_URL`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET` map to the corresponding canonical issuer/introspection variables. Explicit canonical values take precedence. Other URLs and the mode still need configuration; aliases do not infer or weaken authentication.

## ZITADEL setup

1. Use the issuer's `/.well-known/openid-configuration` to obtain the exact issuer and endpoints.
2. In the MCP project create a dedicated **API application** using **Basic** authentication. Its client ID/secret authenticate the resource server's introspection request. They are different from Inspector's dynamically registered OIDC client's credentials.
3. DCR clients must request `urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud` so the introspecting API's project is in the token audience. Enable DCR according to the instance's security policy if clients need it.
4. Configure the resource server as below, using Railway's secret store for the secret.

```text
MCP_BIND_HOST=0.0.0.0
MCP_AUTH_MODE=introspection
MCP_PUBLIC_URL=https://mcp.example.com/mcp
MCP_AUTH_ISSUER_URL=https://instance.zitadel.cloud
MCP_AUTHORIZATION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/authorize
MCP_TOKEN_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/token
MCP_REGISTRATION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/register
MCP_AUTH_INTROSPECTION_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/introspect
MCP_AUTH_INTROSPECTION_CLIENT_ID=<API_CLIENT_ID>
MCP_AUTH_INTROSPECTION_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
MCP_AUTH_INTROSPECTION_AUDIENCE=<PROJECT_ID>
MCP_AUTH_REQUIRED_SCOPES=openid,urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
MCP_AUTH_SCOPES_SUPPORTED=openid,profile,email,offline_access,urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
MCP_ALLOWED_ORIGINS=http://localhost:6274,http://127.0.0.1:6274
```

ZITADEL introspection supports `client_secret_basic` and `private_key_jwt`; this gateway implements **client_secret_basic**. Its token endpoint additionally supports `client_secret_post` and public PKCE clients; do not assume those token endpoint methods work for introspection. Requests use form-encoded client credentials in the Basic header and an `application/x-www-form-urlencoded` body containing `token` and `token_type_hint=access_token`. Redirects are rejected to prevent credential forwarding.

A response is schema-validated. HTTP 200 alone does not authenticate a token. Active responses must contain a matching issuer, numeric expiry, client ID, correctly typed optional scopes/audience/identity/grants, and valid time bounds. Configured audience checks must pass. According to ZITADEL, `active=false` can mean the introspecting API is outside the token audience as well as a revoked/expired token. `sub` is preferred; `username` and then client ID provide documented fallback identities for responses without a subject. No roles or administrators are inferred.

References: [ZITADEL OAuth endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints), [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662), [RFC 6749 client authentication](https://www.rfc-editor.org/rfc/rfc6749#section-2.3.1).

## Railway HTTP and health behavior

`railway.json` selects the Dockerfile, `node dist/index.js`, and `/ready` as the deployment health check. Missing required auth configuration aborts startup; there is no anonymous remote fallback. The server listens on Railway's `PORT`, honors `MCP_BIND_HOST`, and shuts down on SIGTERM with a bounded connection drain.

- `/health` and compatibility `/healthz`: process liveness, no external ZITADEL request.
- `/ready`: 200 only after configuration/runtime initialization; 503 during shutdown. It does not expose secrets or imply that an upstream OAuth provider is reachable.
- `/mcp`: validate Host and Origin, extract Bearer credential, verify token and required scopes, then dispatch MCP. Subsequent requests are authenticated again.
- `/.well-known/oauth-protected-resource/mcp`: public resource metadata.

The configured `MCP_PUBLIC_URL` determines OAuth metadata and challenges. Untrusted forwarded headers cannot change issuer/audience/host policy. Railway normally preserves the public Host header; explicitly configure a legitimate additional host if a trusted proxy uses another host. TLS terminates at Railway; public URLs remain HTTPS even though the internal container hop is HTTP.

Exact allowed browser origins receive CORS preflight responses and can read `WWW-Authenticate`, MCP protocol/session headers and `X-Request-Id`. Unknown origins remain forbidden. Preflight is unauthenticated, but subsequent MCP calls always pass authentication. Cookies/credentialed wildcard origins are not enabled.

The SDK's legacy Streamable HTTP path is **stateless**: initialize -> initialized -> tools/list works, but no `Mcp-Session-Id` is minted. Send Authorization on every request; clients must not require a session ID when none is returned. Legacy GET/DELETE session operations return 405. This avoids storing authentication or session state in a single Railway replica.

## MCP Inspector

Run `npx @modelcontextprotocol/inspector` locally. Select Streamable HTTP and enter your complete HTTPS `/mcp` URL. Start the OAuth flow from Inspector so it supplies the correct client ID, redirect URI, PKCE and requested scopes. Do not open a bare authorization endpoint without these parameters. For a static client, register Inspector's actual callback URL exactly; for DCR, verify instance registration policy and the resource-server project audience scope.

After login, connect and verify:

1. `initialize` succeeds, then the client sends `notifications/initialized`.
2. `tools/list` succeeds on a subsequent authenticated request.
3. `infra.identity` reports the expected subject/client and granted scopes.
4. A selected read-only provider action succeeds only with its capability scope, resource grant and server-side provider credential.

For direct browser connections, add the Inspector UI's exact origin to `MCP_ALLOWED_ORIGINS`; a proxy-based Inspector may not forward Origin. This is configuration, not a reason to disable Origin validation. HTTP header names are case-insensitive; Bearer scheme casing and multiple spaces are supported, while multiple credentials/trailing material are rejected.

## Distinguish failures by stage

Safe JSON diagnostics contain generated request IDs, mode, token shape, upstream HTTP status, active status and decision/reason categories. They never contain token text/fingerprints, Authorization headers, Basic credentials, refresh tokens or provider secrets. Correlate `X-Request-Id` with Railway logs.

| Evidence | Stage and action |
| --- | --- |
| OAuth error before `/mcp` | Token acquisition: callback, PKCE, client configuration, consent and audience scopes |
| 401 before any introspection event | Credential forwarding/extraction: missing/malformed Authorization header |
| `introspection_client_auth_failed`, upstream 401/403; downstream 503 | Resource-server client authentication: check the dedicated API application ID, secret and Basic method |
| `network_or_timeout`/`introspection_upstream_failed`; downstream 503 | Upstream unavailable: endpoint, TLS, DNS, timeout, rate limiting, server health |
| `invalid_response_schema`; downstream 503 | Upstream contract/configuration problem; inspect metadata-only diagnostics, never dump the response |
| `active=false`, issuer/audience/time rejection; downstream 401 | Token validation; active=false may also signal missing project audience authorization |
| `insufficient_scope`; downstream 403 | Valid token without required connection scopes |
| MCP tool result `policy_denied`/`step_up_required` | Provider authorization after successful connection; check exact capability scopes, trusted `mcp_resources` and step-up grants |
| HTTP 403 `invalid_origin`/`invalid_host` | HTTP boundary validation, before token introspection |

Upstream failures return sanitized 503 `temporarily_unavailable` with `Retry-After`; they no longer masquerade as `invalid_token` and trigger pointless login loops. No provider response body is echoed. Provider policy failures use standard MCP error tool results (normally HTTP 200), not a transport-level OAuth 403.

## Optional cloud integration test

Normal tests use local JWKS/introspection HTTP fixtures, without production secrets. The deployed test skips when no test credentials are supplied. Configure CI variables:

```text
MCP_INTEGRATION_URL=https://staging-mcp.example.com/mcp
MCP_INTEGRATION_TOKEN_ENDPOINT=https://instance.zitadel.cloud/oauth/v2/token
MCP_INTEGRATION_CLIENT_ID=<TEST_CLIENT_ID>
MCP_INTEGRATION_SCOPE=openid urn:zitadel:iam:org:project:id:<PROJECT_ID>:aud
MCP_INTEGRATION_EXPECTED_SUBJECT=<EXPECTED_TEST_SUBJECT>
```

Supply `MCP_INTEGRATION_CLIENT_SECRET` through CI Secrets for client-credentials acquisition, or `MCP_INTEGRATION_REFRESH_TOKEN` for the configured test client's refresh grant (public clients need no secret). For an already issued short-lived test token, `MCP_INTEGRATION_ACCESS_TOKEN` bypasses acquisition and tests forwarding/validation only. Token acquisition credentials belong to the **test OAuth client**, not the introspection API application unless that application supports the chosen grant.

The test acquires/uses a token, initializes, lists tools and calls read-only `infra.identity` to verify the principal. It reports only a failed stage; secrets and token responses are never printed. It does not mutate infrastructure. Do not run it against an unrelated environment or treat a skipped test as production validation.
