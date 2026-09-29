# Stdio to Remote MCP Bridge

Some desktop MCP hosts launch a local process over stdio but cannot connect directly to a remote Streamable HTTP MCP endpoint. The bridge makes the remote Axymorrsen Infra MCP appear as a local stdio MCP server.

## Security boundary

The bridge never needs GitHub, GitLab, Cloudflare, CircleCI, Vault, or cloud-provider credentials.

It may hold only a short-lived access token for the remote MCP resource:

```text
MCP_REMOTE_URL=https://mcp.example.com/mcp
MCP_BRIDGE_TOKEN=<SHORT_LIVED_MCP_ACCESS_TOKEN>
```

Pass the token through the process environment or an OS secret launcher. Do not put it in command-line arguments, desktop configuration committed to source control, shell history, or URLs.

For an unauthenticated loopback development server, `MCP_BRIDGE_TOKEN` may be omitted.

## Run

After building:

```sh
MCP_REMOTE_URL=https://mcp.example.com/mcp \
MCP_BRIDGE_TOKEN=<REDACTED> \
npm run bridge:stdio
```

A desktop client that accepts command/args/environment MCP configuration can launch:

```text
command: node
args:
  - /path/to/axymorrsen-infra-mcp/dist/bridge/stdio-remote.js
environment:
  MCP_REMOTE_URL: https://mcp.example.com/mcp
  MCP_BRIDGE_TOKEN: <short-lived token supplied by secret storage>
```

The bridge mirrors the remote server's current:

- tools and their JSON input/output schemas
- static resources
- resource templates
- prompts and prompt arguments

Calls are forwarded to the remote MCP server. Provider authorization is still enforced remotely, so a compromised desktop bridge cannot expand its own scopes or resource allowlist.

## Token lifecycle

The first bridge version accepts a supplied bearer token. It deliberately does not persist OAuth tokens locally. Interactive OAuth/token refresh can be added later as a separate credential-provider module without changing the proxy surface.
