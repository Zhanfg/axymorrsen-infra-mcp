import {
  Client,
  InMemoryTransport,
} from "@modelcontextprotocol/client";
import {
  createMcpHandler,
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createRemoteBridgeServer,
  type RemoteBridgeServer,
} from "../src/bridge/remote.js";

const closeables: Array<{
  close(): Promise<void>;
}> = [];

afterEach(async () => {
  while (closeables.length > 0) {
    const item = closeables.pop();
    if (item) {
      await item.close();
    }
  }
});

function buildRemoteServer(): McpServer {
  const server = new McpServer({
    name: "remote-test-server",
    version: "1.0.0",
  });

  server.registerTool(
    "echo",
    {
      description:
        "Echo one message.",
      inputSchema: z.object({
        message: z.string(),
      }),
      outputSchema: z.object({
        echoed: z.string(),
      }),
    },
    async ({ message }) => ({
      content: [
        {
          type: "text",
          text: message,
        },
      ],
      structuredContent: {
        echoed: message,
      },
    }),
  );

  server.registerResource(
    "info",
    "remote://info",
    {
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: "remote-info",
        },
      ],
    }),
  );

  server.registerResource(
    "item",
    new ResourceTemplate(
      "remote://item/{id}",
      { list: undefined },
    ),
    {
      mimeType:
        "application/json",
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType:
            "application/json",
          text: JSON.stringify({
            id: variables.id,
          }),
        },
      ],
    }),
  );

  server.registerPrompt(
    "greet",
    {
      argsSchema: z.object({
        name: z.string(),
      }),
    },
    ({ name }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hello ${name}`,
          },
        },
      ],
    }),
  );

  return server;
}

describe("stdio remote bridge surface", () => {
  it("mirrors tools resources templates and prompts end-to-end", async () => {
    const handler =
      createMcpHandler(
        buildRemoteServer,
      );

    const fetchImpl =
      (async (
        input,
        init,
      ) => {
        const request =
          input instanceof Request &&
          init === undefined
            ? input
            : new Request(
                input,
                init,
              );

        return handler.fetch(
          request,
        );
      }) as typeof fetch;

    const bridge:
      RemoteBridgeServer =
      await createRemoteBridgeServer(
        {
          remoteUrl:
            new URL(
              "http://test.local/mcp",
            ),
        },
        { fetchImpl },
      );

    closeables.push(bridge);

    const [
      clientTransport,
      serverTransport,
    ] =
      InMemoryTransport.createLinkedPair();

    await bridge.connect(
      serverTransport,
    );

    const client = new Client({
      name:
        "bridge-test-client",
      version: "1.0.0",
    });
    closeables.push(client);

    await client.connect(
      clientTransport,
    );

    const { tools } =
      await client.listTools();
    expect(
      tools.map(
        (tool) => tool.name,
      ),
    ).toContain("echo");

    const call =
      await client.callTool({
        name: "echo",
        arguments: {
          message: "hello",
        },
      });
    expect(
      call.structuredContent,
    ).toEqual({
      echoed: "hello",
    });

    const { resources } =
      await client.listResources();
    expect(
      resources.map(
        (resource) =>
          resource.uri,
      ),
    ).toContain(
      "remote://info",
    );

    const info =
      await client.readResource({
        uri: "remote://info",
      });
    expect(
      JSON.stringify(info),
    ).toContain("remote-info");

    const {
      resourceTemplates,
    } =
      await client.listResourceTemplates();
    expect(
      resourceTemplates.map(
        (template) =>
          template.uriTemplate,
      ),
    ).toContain(
      "remote://item/{id}",
    );

    const item =
      await client.readResource({
        uri: "remote://item/42",
      });
    expect(
      JSON.stringify(item),
    ).toContain('"id":"42"');

    const { prompts } =
      await client.listPrompts();
    expect(
      prompts.map(
        (prompt) => prompt.name,
      ),
    ).toContain("greet");

    const prompt =
      await client.getPrompt({
        name: "greet",
        arguments: {
          name: "Ada",
        },
      });
    expect(
      JSON.stringify(prompt),
    ).toContain("Hello Ada");
  });
});
