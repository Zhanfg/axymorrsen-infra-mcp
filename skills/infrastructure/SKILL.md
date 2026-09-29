# Axymorrsen Infrastructure MCP

Use this skill only as an enhancement. The MCP server must remain fully usable through standard MCP tools, resources, prompts, and schemas without loading this file.

## First-use workflow

1. Call `infra.capabilities` and `infra.providers`.
2. Read `docs://authentication`, `docs://secrets`, `docs://providers/core4`, `docs://providers/platform5`, `docs://providers/runtime3`, and `docs://security` when the task touches remote access or mutations.
3. Call `infra.permissions` when authorization is uncertain.
4. Use `infra.explain_tool` before unfamiliar or high-risk actions.
5. Read the current resource state before mutation when practical.
6. Execute the narrowest tool that satisfies the request.
7. Verify state after writes and deployments.

## Authorization model

MCP authorization and provider credentials are separate.

The client receives a short-lived MCP access token. The server validates its scopes and `mcp_resources` resource allowlist. Provider credentials remain server-side.

Example grants:

```text
github:repo:example/*
gitlab:project:example/*
cloudflare:zone:023e105f4ecef8ad9ca31a8372d0c353
circleci:project:gh/example/project
```

A wildcard may appear in an authorization grant, but never in a concrete execution target.

Capabilities classified as `DESTRUCTIVE`, `SECURITY`, or `BILLING` require a trusted step-up signal in addition to ordinary scopes.

## Core provider pack

GitHub:
- `github.repository.get`
- `github.repository.create`
- `github.release.create`

GitLab:
- `gitlab.project.get`
- `gitlab.project.create`

Cloudflare:
- `cloudflare.dns.list`
- `cloudflare.dns.create`
- `cloudflare.dns.update`
- `cloudflare.dns.delete`

CircleCI:
- `circleci.pipeline.list`
- `circleci.pipeline.trigger`
- `circleci.workflow.cancel`
- `circleci.workflow.rerun`

## Platform provider pack

Vercel:
- `vercel.project.get`
- `vercel.deployment.list`
- `vercel.deployment.cancel`

Railway:
- `railway.project.get`
- `railway.service_instance.get`
- `railway.service.deploy`

Supabase:
- `supabase.project.get`
- `supabase.branch.list`
- `supabase.branch.get`
- `supabase.branch.create`

Sentry:
- `sentry.issue.get`
- `sentry.issue.event.get`
- `sentry.issue.update`

HCP Terraform:
- `terraform.workspace.get`
- `terraform.run.list`
- `terraform.run.plan`
- `terraform.run.apply`
- `terraform.run.cancel`

Terraform run creation is deliberately plan-only. Applying a plan is classified as destructive and requires step-up authorization. Secrets/API-key mutation surfaces are not exposed for Vercel or Supabase, and Sentry merge/discard/public-sharing operations are intentionally omitted.

## Runtime provider pack

Docker Hub:
- `docker.repository.get`
- `docker.tag.list`
- `docker.tag.get`
- `docker.repository.create`

Kubernetes:
- `kubernetes.namespace.list`
- `kubernetes.namespace.get`
- `kubernetes.deployment.list`
- `kubernetes.deployment.get`
- `kubernetes.deployment.scale`

HashiCorp Vault:
- `vault.health.get`
- `vault.kv.metadata.list`
- `vault.kv.metadata.get`
- `vault.kv.metadata.update`
- `vault.kv.metadata.delete`

Docker Hub credentials are exchanged server-side for a short-lived Hub bearer token and are never exposed to MCP clients. Kubernetes scaling uses the scale subresource plus a resourceVersion precondition and requires step-up authorization. Vault tools operate only on KV v2 metadata; no tool in this pack reads or writes secret values. Metadata update/delete require step-up authorization.

## Secret backends

Provider credentials may use explicit `env:` or `vault-kv2:` references. A Vault KV v2 reference has the form:

```text
vault-kv2:<mount>/<path>#<field>
```

The MCP client never receives the resolved value. Vault's own bootstrap token remains outside the same resolver to avoid circular dependency. Prefer a narrowly scoped bootstrap token that can read only the provider credential paths.

## Operating principles

- Never request or expose raw provider credentials.
- Never put tokens in URLs, logs, prompts, tool output, or source control.
- Change only resources covered by the caller's allowlist.
- Preserve unrelated settings unless explicitly requested.
- Treat destructive, security, and billing actions as high risk.
- Prefer reversible operations.
- Treat server-side policy decisions as authoritative.
- Do not bypass `read-only`, `freeze-writes`, or `lockdown` safety modes.

## Desktop / stdio clients

When a host supports only a local stdio MCP command, use the repository's stdio-to-remote bridge. The bridge mirrors remote tools, resources, resource templates, and prompts.

The local bridge may receive only:
- `MCP_REMOTE_URL`
- a short-lived `MCP_BRIDGE_TOKEN`

It must never receive provider tokens.

See `docs://bridge` when exposed by the server or `docs/bridge.md` in the repository.
