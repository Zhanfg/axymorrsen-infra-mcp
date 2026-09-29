# Client configuration

The server exposes standard MCP over Streamable HTTP. Clients that support remote MCP can connect directly to the public MCP URL and complete OAuth using the server's protected-resource metadata.

Clients that only support stdio can launch the included bridge.

## Remote-capable client

Canonical endpoint:

```text
https://mcp.example.com/mcp
```

Do not place GitHub, GitLab, Cloudflare, CircleCI, Vercel, Railway, Supabase, Sentry, Terraform, Docker Hub, Kubernetes, or Vault provider credentials in the client.

The client should receive only its short-lived MCP access token and the scopes/resources granted to that token.

## Stdio-only client

Common command/args/environment shape:

```json
{
  "mcpServers": {
    "axymorrsen-infra": {
      "command": "node",
      "args": [
        "/absolute/path/to/axymorrsen-infra-mcp/dist/bridge/stdio-remote.js"
      ],
      "env": {
        "MCP_REMOTE_URL": "https://mcp.example.com/mcp",
        "MCP_BRIDGE_TOKEN": "<inject-from-client-secret-store>"
      }
    }
  }
}
```

Exact configuration filenames and field names vary by MCP host. The portable contract is the stdio command plus its environment, not a vendor-specific configuration file.

## First use

An unfamiliar model or client should:

1. call `infra.help`
2. call `infra.providers`
3. call `infra.capabilities`
4. read `docs://security`, `docs://secrets`, and the relevant provider guide
5. use `infra.explain_tool` before unfamiliar mutations

The optional `skill://infrastructure/SKILL.md` resource contains the same operating model in agent-oriented form.
