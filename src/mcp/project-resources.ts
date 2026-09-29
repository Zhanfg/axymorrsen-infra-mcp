import {
  readFile,
} from "node:fs/promises";
import type {
  McpServer,
} from "@modelcontextprotocol/server";

interface ProjectResource {
  name: string;
  uri: string;
  path: string;
  title: string;
  description: string;
}

const resources:
  readonly ProjectResource[] = [
    {
      name:
        "authentication-guide",
      uri:
        "docs://authentication",
      path:
        "docs/authentication.md",
      title:
        "Authentication guide",
      description:
        "OAuth resource-server deployment and JWT authorization guidance.",
    },
    {
      name:
        "core-provider-guide",
      uri:
        "docs://providers/core4",
      path:
        "docs/providers/core4.md",
      title:
        "Core provider pack",
      description:
        "GitHub, GitLab, Cloudflare and CircleCI capabilities, resource formats and credentials.",
    },
    {
      name:
        "platform-provider-guide",
      uri:
        "docs://providers/platform5",
      path:
        "docs/providers/platform5.md",
      title:
        "Platform provider pack",
      description:
        "Vercel, Railway, Supabase, Sentry and HCP Terraform capabilities and safety boundaries.",
    },
    {
      name:
        "runtime-provider-guide",
      uri:
        "docs://providers/runtime3",
      path:
        "docs/providers/runtime3.md",
      title:
        "Runtime provider pack",
      description:
        "Docker Hub, Kubernetes and HashiCorp Vault capabilities and security boundaries.",
    },
    {
      name:
        "bridge-guide",
      uri:
        "docs://bridge",
      path:
        "docs/bridge.md",
      title:
        "Stdio remote bridge",
      description:
        "Connect stdio-only desktop MCP hosts to the remote infrastructure gateway.",
    },
    {
      name:
        "deployment-guide",
      uri:
        "docs://deployment",
      path:
        "docs/deployment.md",
      title:
        "OCI deployment",
      description:
        "Fail-closed Docker and OCI deployment guidance.",
    },
    {
      name:
        "infrastructure-skill",
      uri:
        "skill://infrastructure/SKILL.md",
      path:
        "skills/infrastructure/SKILL.md",
      title:
        "Infrastructure skill",
      description:
        "Optional agent guidance for safely operating the infrastructure MCP.",
    },
  ];

async function readProjectFile(
  path: string,
): Promise<string> {
  const url = new URL(
    `../../${path}`,
    import.meta.url,
  );

  return readFile(
    url,
    "utf8",
  );
}

export function registerProjectResources(
  server: McpServer,
): void {
  for (const resource of resources) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description:
          resource.description,
        mimeType:
          "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType:
              "text/markdown",
            text:
              await readProjectFile(
                resource.path,
              ),
          },
        ],
      }),
    );
  }
}
