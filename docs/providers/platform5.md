# Platform Provider Pack

This pack adds bounded adapters for Vercel, Railway, Supabase, Sentry, and HCP Terraform. Provider credentials remain server-side and every tool still passes through the shared scope, resource, safety-mode, step-up, and audit kernel.

## Vercel

Capabilities:
- `vercel.project.get`
- `vercel.deployment.list`
- `vercel.deployment.cancel`

Resource:
```text
vercel:project:<team-id>/<project-id>
```

Deployment cancellation performs a deployment lookup first and verifies `projectId` before issuing the cancel request. Environment-variable and secret mutation is intentionally not exposed.

## Railway

Capabilities:
- `railway.project.get`
- `railway.service_instance.get`
- `railway.service.deploy`

Resource:
```text
railway:project:<project-id>
```

The adapter uses Railway's GraphQL Public API. Service-instance reads and deploys first query the project and verify both the service ID and environment ID belong to that project. The first version uses account/workspace/OAuth Bearer tokens; project-token header support is intentionally separate.

## Supabase

Capabilities:
- `supabase.project.get`
- `supabase.branch.list`
- `supabase.branch.get`
- `supabase.branch.create`

Resource:
```text
supabase:project:<project-ref>
```

Branch creation accepts only non-secret branch configuration. The adapter does not expose Management API secrets, API keys, database passwords, or arbitrary secret overrides.

## Sentry

Capabilities:
- `sentry.issue.get`
- `sentry.issue.event.get`
- `sentry.issue.update`

Resource:
```text
sentry:issue:<organization>/<issue-id>
```

The write surface is deliberately limited to ordinary issue-workflow fields such as status, substatus, priority, assignment, subscription, and bookmark state. Merge, discard, public-sharing, and organization mutation are omitted.

## HCP Terraform

Capabilities:
- `terraform.workspace.get`
- `terraform.run.list`
- `terraform.run.plan`
- `terraform.run.apply`
- `terraform.run.cancel`

Resource:
```text
terraform:workspace:<organization>/<workspace>
```

`terraform.run.plan` always sends `plan-only: true`; it cannot queue an auto-applying run. `terraform.run.apply` performs workspace/run relationship verification and is classified as DESTRUCTIVE, so it requires trusted step-up authorization. Force-cancel, force-execute, destroy-run shortcuts, and workspace force-delete are not exposed.

## Credentials

Default environment-backed references:
```text
env:VERCEL_TOKEN
env:RAILWAY_TOKEN
env:SUPABASE_ACCESS_TOKEN
env:SENTRY_AUTH_TOKEN
env:TFC_TOKEN
```

Use scoped/fine-grained provider credentials wherever supported. Never place provider credentials in MCP access-token claims.
