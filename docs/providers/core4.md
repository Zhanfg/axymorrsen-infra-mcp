# Core Provider Pack

The first provider pack exposes a deliberately small set of high-value operations. Every operation is routed through the shared ProviderExecutor before any provider request is sent.

## GitHub

Authentication: server-side token resolved from `GITHUB_CREDENTIAL_REF`.

Initial capabilities:

- `github.repository.get`
- `github.repository.create`
- `github.release.create`

Resource format:

```text
github:repo:<owner>/<repository>
```

Creating a user-owned repository first verifies the authenticated GitHub login matches the requested owner. Organization repositories use the owner in the API path.

## GitLab

Authentication: server-side token resolved from `GITLAB_CREDENTIAL_REF`.

Initial capabilities:

- `gitlab.project.get`
- `gitlab.project.create`

Resource format:

```text
gitlab:project:<namespace>/<project>
```

Project creation requires both namespace ID and namespace path. The adapter verifies they match before creating the project.

## Cloudflare

Authentication: scoped API token resolved from `CLOUDFLARE_CREDENTIAL_REF`.

Initial capabilities:

- `cloudflare.dns.list`
- `cloudflare.dns.create`
- `cloudflare.dns.update`
- `cloudflare.dns.delete`

Resource format:

```text
cloudflare:zone:<zone-id>
```

DNS deletion is classified as DESTRUCTIVE and therefore requires step-up authorization in addition to the DNS write scope.

## CircleCI

Authentication: server-side CircleCI token resolved from `CIRCLECI_CREDENTIAL_REF`.

Initial capabilities:

- `circleci.pipeline.list`
- `circleci.pipeline.trigger`
- `circleci.workflow.cancel`
- `circleci.workflow.rerun`

Resource format:

```text
circleci:project:<project-slug>
```

Workflow mutation performs a read-before-write verification that the workflow's `project_slug` matches the authorized project supplied by the caller.

## Credentials

The default references are:

```text
env:GITHUB_TOKEN
env:GITLAB_TOKEN
env:CLOUDFLARE_API_TOKEN
env:CIRCLECI_TOKEN
```

These are references only. Real values must be injected by the deployment platform or another secret backend and must never be committed.
