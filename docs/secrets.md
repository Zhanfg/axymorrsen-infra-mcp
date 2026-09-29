# Secret backends

Provider credentials are server-side only. MCP clients never receive GitHub, GitLab, Cloudflare, CircleCI, Vercel, Railway, Supabase, Sentry, HCP Terraform, Docker Hub, Kubernetes, or Vault credentials.

## Reference schemes

Environment-backed references:

```text
env:GITHUB_TOKEN
```

Vault KV v2 references:

```text
vault-kv2:secret/providers/github#token
vault-kv2:secret/providers/cloudflare#token
```

The Vault reference format is:

```text
vault-kv2:<mount>/<path>#<field>
```

Only an exact top-level string field is returned to the provider adapter. Secret objects are never exposed through MCP tools, resources, logs, or audit events.

## Enable backends

The default is:

```text
SECRET_BACKEND=env
```

Enable both environment references and Vault KV v2:

```text
SECRET_BACKEND=env,vault-kv2
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=<BOOTSTRAP_TOKEN>
```

`VAULT_API_BASE_URL=https://vault.example.com/v1/` can be used instead of `VAULT_ADDR`.

For Vault Enterprise namespaces:

```text
VAULT_NAMESPACE=admin/team
```

## Bootstrap boundary

The Vault secret backend must authenticate before it can read provider credentials. Its bootstrap token therefore cannot itself be stored behind the same Vault resolver.

Inject the bootstrap token using the deployment platform secret store, Kubernetes secret injection, Docker secret-to-environment plumbing, or an equivalent trusted mechanism. Use a narrowly scoped Vault token that can read only the exact KV paths containing provider credentials.

The separate Vault provider adapter also uses an environment-backed Vault token by default to avoid circular resolution.

## Example provider references

```text
GITHUB_CREDENTIAL_REF=vault-kv2:secret/providers/github#token
GITLAB_CREDENTIAL_REF=vault-kv2:secret/providers/gitlab#token
CLOUDFLARE_CREDENTIAL_REF=vault-kv2:secret/providers/cloudflare#token
CIRCLECI_CREDENTIAL_REF=vault-kv2:secret/providers/circleci#token
VERCEL_CREDENTIAL_REF=vault-kv2:secret/providers/vercel#token
RAILWAY_CREDENTIAL_REF=vault-kv2:secret/providers/railway#token
SUPABASE_CREDENTIAL_REF=vault-kv2:secret/providers/supabase#token
SENTRY_CREDENTIAL_REF=vault-kv2:secret/providers/sentry#token
TERRAFORM_CREDENTIAL_REF=vault-kv2:secret/providers/terraform#token
DOCKERHUB_IDENTIFIER_REF=vault-kv2:secret/providers/dockerhub#identifier
DOCKERHUB_SECRET_REF=vault-kv2:secret/providers/dockerhub#secret
KUBERNETES_CREDENTIAL_REF=vault-kv2:secret/providers/kubernetes#token
```

Vault KV v2 reads use the documented `/<mount>/data/<path>` API shape and the bootstrap token is transmitted in the `X-Vault-Token` header.
