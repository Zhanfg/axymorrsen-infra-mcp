import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createMcpHandler,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createResourceServerAuth } from "./auth/resource-server.js";
import {
  isLoopbackHostname,
  loadRuntimeConfig,
} from "./config/runtime.js";
import { createInfraMcpServer } from "./mcp/server.js";

const config = loadRuntimeConfig();
const resourceAuth = createResourceServerAuth(config);

const handler = createMcpHandler(({ authInfo }) =>
  createInfraMcpServer({ ...(authInfo ? { authInfo } : {}) }),
);
const mcpNodeHandler = toNodeHandler(handler);
type McpNodeRequest = Parameters<typeof mcpNodeHandler>[0];
type RequestWithAuth = IncomingMessage & { auth?: AuthInfo };

function json(
  res: ServerResponse,
  status: number,
  value: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(value));
}

function reject(res: ServerResponse, reason: string): false {
  json(res, 403, { error: "forbidden", reason });
  return false;
}

function requestHostname(header: string): string | undefined {
  try {
    return new URL(`http://${header}`).hostname;
  } catch {
    return undefined;
  }
}

function validateHost(req: IncomingMessage, res: ServerResponse): boolean {
  const header = req.headers.host;
  if (!header) return reject(res, "missing_host");

  const hostname = requestHostname(header);
  if (!hostname) return reject(res, "invalid_host");

  return (
    config.allowedHostnames.includes(hostname) ||
    reject(res, "invalid_host")
  );
}

function validateOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    return (
      config.allowedOrigins.includes(parsed.origin) ||
      reject(res, "invalid_origin")
    );
  } catch {
    return reject(res, "invalid_origin");
  }
}

async function writeFetchResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(response.status, headers);
  const body = new Uint8Array(await response.arrayBuffer());
  res.end(body);
}

async function handleRequest(
  req: RequestWithAuth,
  res: ServerResponse,
): Promise<void> {
  if (!validateHost(req, res)) return;

  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/healthz") {
    json(res, 200, {
      status: "ok",
      auth: resourceAuth ? "required" : "local-only",
    });
    return;
  }

  if (resourceAuth?.metadataPaths.has(url.pathname)) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {
        allow: "GET, HEAD",
        "access-control-allow-origin": "*",
      });
      res.end();
      return;
    }

    json(
      res,
      200,
      resourceAuth.protectedResourceMetadata,
      {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    );
    return;
  }

  if (url.pathname !== "/mcp") {
    json(res, 404, { error: "not_found" });
    return;
  }

  if (!validateOrigin(req, res)) return;

  if (resourceAuth) {
    const authResult = await resourceAuth.authenticate(req);
    if (authResult instanceof Response) {
      await writeFetchResponse(res, authResult);
      return;
    }
    req.auth = authResult;
  }

  if (!req.method) {
    json(res, 400, { error: "missing_method" });
    return;
  }

  void mcpNodeHandler(req as McpNodeRequest, res);
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "unknown server error";
    process.stderr.write(`request failed: ${message}\n`);
    if (!res.headersSent) {
      json(res, 500, { error: "internal_server_error" });
    } else {
      res.end();
    }
  });
});

server.listen(config.port, config.bindHost, () => {
  const local =
    isLoopbackHostname(config.bindHost) && !config.publicMcpUrl
      ? `http://${config.bindHost}:${config.port}/mcp`
      : config.publicMcpUrl?.href ?? "/mcp";

  process.stderr.write(
    `Axymorrsen Infra MCP listening on ${config.bindHost}:${config.port}; resource ${local}\n`,
  );
});

async function shutdown(): Promise<void> {
  await handler.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
