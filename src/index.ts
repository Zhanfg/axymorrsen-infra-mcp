import { loadAuthConfig } from "./auth/config.js";
import { bootstrapCoreProviders } from "./providers/bootstrap.js";
import { createGatewayHttpServer } from "./http/server.js";

const config = loadAuthConfig();
const host = process.env.MCP_BIND_HOST ?? (config.mode === "disabled" ? "127.0.0.1" : "0.0.0.0");
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? "3000");
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("Invalid listen port");
if (config.mode === "disabled" && !["127.0.0.1", "::1", "localhost"].includes(host)) {
  throw new Error("MCP_AUTH_MODE=disabled only permits loopback binding; configure remote OAuth authentication before exposure");
}
bootstrapCoreProviders();
const gateway = createGatewayHttpServer(config);
gateway.server.on("error", () => {
  process.stderr.write("MCP HTTP server failed to listen\n");
  process.exit(1);
});
gateway.server.listen(port, host, () => {
  process.stderr.write(`Axymorrsen Infra MCP listening on ${host}:${port} (auth=${config.mode})\n`);
});
let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  void gateway.close().then(() => process.exit(0), () => process.exit(1));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
