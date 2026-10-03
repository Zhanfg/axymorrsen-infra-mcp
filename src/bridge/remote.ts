import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  fromJsonSchema,
  McpServer,
  ResourceTemplate,
  type JsonSchemaType,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type {
  RemoteBridgeConfig,
} from "./config.js";

type JsonObject =
  Record<string, unknown>;

export interface RemoteBridgeOptions {
  fetchImpl?: typeof fetch;
}

function optionalString(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.length > 0
    ? value
    : undefined;
}

function resourceMetadata(
  value: JsonObject,
): {
  title?: string;
  description?: string;
  mimeType?: string;
} {
  const title =
    optionalString(value.title);
  const description =
    optionalString(
      value.description,
    );
  const mimeType =
    optionalString(value.mimeType);

  return {
    ...(title ? { title } : {}),
    ...(description
      ? { description }
      : {}),
    ...(mimeType
      ? { mimeType }
      : {}),
  };
}

export class RemoteBridgeServer
  extends McpServer
{
  readonly #remote: Client;
  readonly #transport:
    StreamableHTTPClientTransport;

  constructor(
    remote: Client,
    transport:
      StreamableHTTPClientTransport,
  ) {
    super({
      name:
        "axymorrsen-infra-mcp-stdio-bridge",
      version: "0.9.0-hotfix1",
    });

    this.#remote = remote;
    this.#transport = transport;
  }

  override async close(): Promise<void> {
    try {
      await this.#transport
        .terminateSession();
    } catch {
      // A stateless endpoint may not have a session to terminate.
    }

    await this.#remote.close();
    await super.close();
  }
}

export async function createRemoteBridgeServer(
  config: RemoteBridgeConfig,
  options: RemoteBridgeOptions = {},
): Promise<RemoteBridgeServer> {
  const remote = new Client(
    {
      name:
        "axymorrsen-infra-mcp-stdio-bridge",
      version: "0.9.0-hotfix1",
    },
    {
      versionNegotiation: {
        mode: "auto",
      },
    },
  );

  const transport =
    new StreamableHTTPClientTransport(
      config.remoteUrl,
      {
        ...(config.token
          ? {
              requestInit: {
                headers: {
                  authorization:
                    `Bearer ${config.token}`,
                },
              },
            }
          : {}),
        ...(options.fetchImpl
          ? {
              fetch:
                options.fetchImpl,
            }
          : {}),
      },
    );

  await remote.connect(transport);

  const server =
    new RemoteBridgeServer(
      remote,
      transport,
    );

  const [
    toolResult,
    resourceResult,
    templateResult,
    promptResult,
  ] = await Promise.all([
    remote.listTools(),
    remote.listResources(),
    remote.listResourceTemplates(),
    remote.listPrompts(),
  ]);

  for (const tool of toolResult.tools) {
    const inputSchema =
      fromJsonSchema<JsonObject>(
        tool.inputSchema as JsonSchemaType,
      );

    const outputSchema =
      tool.outputSchema
        ? fromJsonSchema<JsonObject>(
            tool.outputSchema as JsonSchemaType,
          )
        : undefined;

    server.registerTool(
      tool.name,
      {
        ...(tool.title
          ? { title: tool.title }
          : {}),
        ...(tool.description
          ? {
              description:
                tool.description,
            }
          : {}),
        inputSchema,
        ...(outputSchema
          ? { outputSchema }
          : {}),
        ...(tool.annotations
          ? {
              annotations:
                tool.annotations,
            }
          : {}),
      },
      async (args) =>
        remote.callTool({
          name: tool.name,
          arguments: args,
        }),
    );
  }

  for (
    const resource of
    resourceResult.resources
  ) {
    server.registerResource(
      resource.name,
      resource.uri,
      resourceMetadata(
        resource as unknown as
          JsonObject,
      ),
      async (uri) =>
        remote.readResource({
          uri: uri.href,
        }),
    );
  }

  for (
    const template of
    templateResult.resourceTemplates
  ) {
    const uriTemplate =
      optionalString(
        template.uriTemplate,
      );

    if (!uriTemplate) continue;

    server.registerResource(
      template.name,
      new ResourceTemplate(
        uriTemplate,
        { list: undefined },
      ),
      resourceMetadata(
        template as unknown as
          JsonObject,
      ),
      async (uri) =>
        remote.readResource({
          uri: uri.href,
        }),
    );
  }

  for (
    const prompt of
    promptResult.prompts
  ) {
    const shape:
      Record<
        string,
        z.ZodTypeAny
      > = {};

    for (
      const argument of
      prompt.arguments ?? []
    ) {
      let schema =
        z.string();

      if (argument.description) {
        schema = schema.describe(
          argument.description,
        );
      }

      shape[argument.name] =
        argument.required
          ? schema
          : schema.optional();
    }

    server.registerPrompt(
      prompt.name,
      {
        ...(prompt.title
          ? { title: prompt.title }
          : {}),
        ...(prompt.description
          ? {
              description:
                prompt.description,
            }
          : {}),
        argsSchema:
          z.object(shape),
      },
      async (args) =>
        remote.getPrompt({
          name: prompt.name,
          arguments:
            args as Record<
              string,
              string
            >,
        }),
    );
  }

  return server;
}
