import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { loadAuthConfig } from "./auth/config.js";
import {
  authenticateMcpRequest,
  createAuthRuntime,
  maybeServeOAuthMetadata,
} from "./auth/http.js";
import { createInfraMcpServer } from "./mcp/server.js";
import { bootstrapCoreProviders } from "./providers/bootstrap.js";

const authConfig = loadAuthConfig();
const authRuntime = createAuthRuntime(authConfig);
bootstrapCoreProviders();

const host =
  process.env.MCP_BIND_HOST ??
  (authRuntime.mode === "jwt" ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? "3000");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid port: ${port}`);
}

if (
  authRuntime.mode === "disabled" &&
  host !== "127.0.0.1" &&
  host !== "::1" &&
  host !== "localhost"
) {
  throw new Error(
    "MCP_AUTH_MODE=disabled only permits loopback binding; configure JWT auth before remote exposure",
  );
}

const handler = createMcpHandler(() => createInfraMcpServer());
const mcpNodeHandler = toNodeHandler(handler);
type McpNodeRequest = Parameters<typeof mcpNodeHandler>[0];

function json(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function reject(res: ServerResponse, reason: string): false {
  json(res, 403, { error: "forbidden", reason });
  return false;
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function validateHost(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const header = req.headers.host;
  if (!header) return reject(res, "missing_host");

  try {
    const parsed = new URL(`http://${header}`);

    if (authRuntime.mode === "disabled") {
      return (
        isLoopbackHostname(parsed.hostname) ||
        reject(res, "invalid_host")
      );
    }

    return (
      authRuntime.config.allowedHosts.includes(
        parsed.hostname.toLowerCase(),
      ) || reject(res, "invalid_host")
    );
  } catch {
    return reject(res, "invalid_host");
  }
}

function validateOrigin(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const parsed = new URL(origin);

    if (authRuntime.mode === "disabled") {
      return (
        isLoopbackHostname(parsed.hostname) ||
        reject(res, "invalid_origin")
      );
    }

    return (
      authRuntime.config.allowedOrigins.includes(parsed.origin) ||
      reject(res, "invalid_origin")
    );
  } catch {
    return reject(res, "invalid_origin");
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (
    authRuntime.mode === "jwt" &&
    (await maybeServeOAuthMetadata(req, res, authRuntime))
  ) {
    return;
  }

  const url = new URL(
    req.url ?? "/",
    authRuntime.mode === "jwt"
      ? authRuntime.config.resourceUrl.origin
      : `http://${req.headers.host ?? "localhost"}`,
  );

  if (url.pathname === "/healthz") {
    json(res, 200, {
      status: "ok",
      authMode: authRuntime.mode,
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    json(res, 404, { error: "not_found" });
    return;
  }

  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  if (!req.method) {
    json(res, 400, { error: "missing_method" });
    return;
  }

  const authInfo = await authenticateMcpRequest(
    req,
    res,
    authRuntime,
  );
  if (authInfo === null) return;

  if (authInfo) {
    Object.assign(req, {
      auth: authInfo satisfies AuthInfo,
    });
  }

  await mcpNodeHandler(req as McpNodeRequest, res);
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((error: unknown) => {
    process.stderr.write(
      `request failure: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );

    if (!res.headersSent) {
      json(res, 500, { error: "internal_server_error" });
    } else if (!res.writableEnded) {
      res.end();
    }
  });
});

server.listen(port, host, () => {
  process.stderr.write(
    `Axymorrsen Infra MCP listening on ${host}:${port} (auth=${authRuntime.mode})\n`,
  );
});

async function shutdown(): Promise<void> {
  await handler.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
