# Runtime Provider Pack

This pack completes the initial provider roadmap with Docker Hub, Kubernetes, and HashiCorp Vault. All operations still pass through MCP scopes, concrete resource allowlists, safety modes, step-up policy, and audit logging.

## Docker Hub

Capabilities:
- `docker.repository.get`
- `docker.tag.list`
- `docker.tag.get`
- `docker.repository.create`

Resource:
```text
docker:repo:<namespace>/<repository>
```

Docker Hub authentication is intentionally two-stage. The server resolves an identifier plus PAT/OAT/password-compatible secret, exchanges them through `/v2/auth/token`, keeps the returned short-lived bearer token only in memory, and uses that bearer token for Hub API requests.

The MCP surface does not expose token creation, credential values, tag deletion, or repository deletion.

## Kubernetes

Capabilities:
- `kubernetes.namespace.list`
- `kubernetes.namespace.get`
- `kubernetes.deployment.list`
- `kubernetes.deployment.get`
- `kubernetes.deployment.scale`

Resources:
```text
kubernetes:cluster:<cluster-id>
kubernetes:namespace:<cluster-id>/<namespace>
kubernetes:deployment:<cluster-id>/<namespace>/<deployment>
```

Scaling is deliberately classified as DESTRUCTIVE so it requires step-up authorization. The adapter reads the `scale` subresource first, requires its `metadata.resourceVersion`, then PATCHes the scale subresource with that resource version as a concurrency precondition.

The initial pack does not expose pod exec, logs, Secrets, ConfigMaps, arbitrary patch, admission configuration, RBAC mutation, or namespace deletion.

For in-cluster use, mount the Kubernetes service-account CA and configure Node with `NODE_EXTRA_CA_CERTS`. Do not disable TLS verification.

## HashiCorp Vault

Capabilities:
- `vault.health.get`
- `vault.kv.metadata.list`
- `vault.kv.metadata.get`
- `vault.kv.metadata.update`
- `vault.kv.metadata.delete`

Resources:
```text
vault:instance:<instance-id>
vault:kv:<instance-id>/<mount>/<path>
```

The Vault adapter never calls the KV v2 `/data/` endpoints. It operates only on `/metadata/` and returns only operational metadata such as version numbers, created/deletion timestamps, destroyed state, CAS requirements, and retention settings.

`custom_metadata` is deliberately omitted from MCP output because users may place sensitive information there.

Metadata update is classified SECURITY and metadata deletion is DESTRUCTIVE; both require step-up authorization. Metadata delete permanently removes the key metadata and every version, matching Vault KV v2 semantics.

## Credentials

Default references:
```text
env:DOCKERHUB_IDENTIFIER
env:DOCKERHUB_SECRET
env:KUBERNETES_TOKEN
env:VAULT_TOKEN
```

Non-secret resource identities are configured separately:
```text
KUBERNETES_CLUSTER_ID=default-cluster
VAULT_INSTANCE_ID=default-vault
```

Use distinct IDs when one gateway can address multiple logical environments. Provider credentials remain server-side and must never be embedded in MCP access-token claims.
