# Axymorrsen Infrastructure MCP

Use this skill only as an enhancement. The MCP server must remain fully usable through standard MCP tools, resources, prompts, and schemas without loading this file.

## First-use workflow

1. Call `infra.capabilities` and `infra.providers`.
2. Read `docs://authentication`, `docs://providers/core4`, and `docs://security` when the task touches remote access or mutations.
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
