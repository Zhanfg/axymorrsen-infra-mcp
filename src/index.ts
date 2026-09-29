import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createInfraMcpServer } from "./mcp/server.js";

const host = process.env.MCP_BIND_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? "3000");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid port: ${port}`);
}

if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
  throw new Error(
    "bootstrap HTTP server only permits loopback binding; deploy behind an authenticated reverse proxy until remote auth middleware lands",
  );
}

const handler = createMcpHandler(() => createInfraMcpServer());
const mcpNodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

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
  void mcpNodeHandler(req, res);
});

server.listen(port, host, () => {
  process.stderr.write(`Axymorrsen Infra MCP listening on http://${host}:${port}/mcp\\n`);
});

async function shutdown(): Promise<void> {
  await handler.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
