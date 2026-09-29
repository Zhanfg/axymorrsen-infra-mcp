import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createInfraMcpServer } from "./mcp/server.js";

const host = process.env.MCP_BIND_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? "3000");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid port: ${port}`);
}

if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
  throw new Error(
    "bootstrap HTTP server only permits loopback binding; deploy behind authenticated reverse proxy middleware until remote auth lands",
  );
}

const handler = createMcpHandler(() => createInfraMcpServer());
const mcpNodeHandler = toNodeHandler(handler);
type McpNodeRequest = Parameters<typeof mcpNodeHandler>[0];

function reject(res: ServerResponse, reason: string): false {
  res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "forbidden", reason }));
  return false;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function validateHost(req: IncomingMessage, res: ServerResponse): boolean {
  const header = req.headers.host;
  if (!header) return reject(res, "missing_host");

  try {
    const parsed = new URL(`http://${header}`);
    return isLoopbackHostname(parsed.hostname) || reject(res, "invalid_host");
  } catch {
    return reject(res, "invalid_host");
  }
}

function validateOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    return isLoopbackHostname(parsed.hostname) || reject(res, "invalid_origin");
  } catch {
    return reject(res, "invalid_origin");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  if (!req.method) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "missing_method" }));
    return;
  }

  void mcpNodeHandler(req as McpNodeRequest, res);
});

server.listen(port, host, () => {
  process.stderr.write(`Axymorrsen Infra MCP listening on http://${host}:${port}/mcp\n`);
});

async function shutdown(): Promise<void> {
  await handler.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
