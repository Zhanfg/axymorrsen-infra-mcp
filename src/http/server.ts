import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { GatewayAuthConfig } from "../auth/config.js";
import { authenticateMcpRequest, createAuthRuntime, maybeServeOAuthMetadata, type AuthRuntime } from "../auth/http.js";
import { authenticationContext, authenticationDiagnostic } from "../auth/diagnostics.js";
import { createInfraMcpServer } from "../mcp/server.js";

const corsHeaders = ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-method", "mcp-name", "mcp-session-id", "last-event-id"];
function isLoopback(host: string): boolean {
  return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host);
}
function json(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function createGatewayHttpServer(config: GatewayAuthConfig, options: {
  runtime?: AuthRuntime;
  serverFactory?: typeof createInfraMcpServer;
} = {}) {
  const runtime = options.runtime ?? createAuthRuntime(config);
  const handler = createMcpHandler(options.serverFactory ?? createInfraMcpServer, {
    onerror: () => authenticationDiagnostic({ event: "protocol_error", reason: "mcp_handler_failed" }),
  });
  const nodeHandler = toNodeHandler(handler, {
    onerror: () => authenticationDiagnostic({ event: "protocol_error", reason: "http_adapter_failed" }),
  });
  let ready = true;

  function reject(res: ServerResponse, reason: string): false {
    json(res, 403, { error: "forbidden", reason });
    return false;
  }
  function validHost(req: IncomingMessage, res: ServerResponse): boolean {
    if (!req.headers.host) return reject(res, "missing_host");
    try {
      const parsed = new URL(`http://${req.headers.host}`);
      if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return reject(res, "invalid_host");
      const host = parsed.hostname.toLowerCase();
      return (runtime.mode === "disabled" ? isLoopback(host) : runtime.config.allowedHosts.includes(host)) || reject(res, "invalid_host");
    } catch { return reject(res, "invalid_host"); }
  }
  function validOrigin(req: IncomingMessage, res: ServerResponse): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      // Origin must be an origin, not a URL containing paths or credentials.
      if (parsed.origin !== origin) return reject(res, "invalid_origin");
      return (runtime.mode === "disabled" ? isLoopback(parsed.hostname) : runtime.config.allowedOrigins.includes(origin)) || reject(res, "invalid_origin");
    } catch { return reject(res, "invalid_origin"); }
  }
  function cors(req: IncomingMessage, res: ServerResponse): void {
    if (!req.headers.origin) return;
    res.setHeader("access-control-allow-origin", req.headers.origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-expose-headers", "WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version, X-Request-Id");
  }
  async function request(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Public URLs and OAuth metadata use configured public origins. Never trust
    // client-supplied Forwarded / X-Forwarded-Host to change the security boundary.
    let path: string;
    try { path = new URL(req.url ?? "/", "http://localhost").pathname; }
    catch { json(res, 400, { error: "invalid_request" }); return; }
    if (path === "/health" || path === "/healthz") {
      json(res, 200, { status: "ok", authMode: runtime.mode }); return;
    }
    if (path === "/ready") {
      json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", authMode: runtime.mode }); return;
    }
    if (runtime.mode !== "disabled" && path.startsWith("/.well-known/")) {
      res.setHeader("access-control-allow-origin", "*");
      if (await maybeServeOAuthMetadata(req, res, runtime)) return;
    }
    if (path !== "/mcp") { json(res, 404, { error: "not_found" }); return; }
    if (!ready) { json(res, 503, { error: "temporarily_unavailable" }); return; }
    if (!validHost(req, res) || !validOrigin(req, res)) return;
    cors(req, res);
    if (req.method === "OPTIONS") {
      const method = req.headers["access-control-request-method"];
      const requested = String(req.headers["access-control-request-headers"] ?? "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
      if (!req.headers.origin || typeof method !== "string" || !["POST", "GET", "DELETE"].includes(method) || requested.some(h => !corsHeaders.includes(h))) {
        json(res, 403, { error: "forbidden", reason: "invalid_preflight" }); return;
      }
      res.writeHead(204, {
        "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
        "access-control-allow-headers": corsHeaders.join(", "),
        "access-control-max-age": "600",
      });
      res.end(); return;
    }
    const auth = await authenticateMcpRequest(req, res, runtime);
    if (auth === null) return;
    if (auth) Object.assign(req, { auth });
    if (!req.method) { json(res, 400, { error: "missing_method" }); return; }
    await nodeHandler(req as Parameters<typeof nodeHandler>[0], res);
  }
  const server = createServer((req, res) => {
    const requestId = randomUUID();
    res.setHeader("x-request-id", requestId);
    res.setHeader("cache-control", "no-store");
    authenticationContext.run({ requestId, mode: runtime.mode }, () => {
      res.once("finish", () => authenticationDiagnostic({ event: "request", status: res.statusCode, sessionState: "stateless" }));
      void request(req, res).catch(() => {
        authenticationDiagnostic({ event: "protocol_error", reason: "request_failed" });
        if (!res.headersSent) json(res, 500, { error: "internal_server_error" });
        else res.end();
      });
    });
  });
  return {
    server,
    async close(): Promise<void> {
      ready = false;
      const closing = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      const deadline = setTimeout(() => server.closeAllConnections(), 5_000);
      deadline.unref();
      try { await handler.close(); await closing; }
      finally { clearTimeout(deadline); }
    },
  };
}
