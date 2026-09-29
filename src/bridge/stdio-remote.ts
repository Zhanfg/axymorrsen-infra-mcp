import {
  serveStdio,
} from "@modelcontextprotocol/server/stdio";
import {
  loadRemoteBridgeConfig,
} from "./config.js";
import {
  createRemoteBridgeServer,
} from "./remote.js";

const config =
  loadRemoteBridgeConfig();

const handle = serveStdio(
  () =>
    createRemoteBridgeServer(
      config,
    ),
  {
    onerror(error) {
      process.stderr.write(
        `MCP bridge error: ${error.message}\n`,
      );
    },
  },
);

process.stderr.write(
  `Axymorrsen Infra MCP stdio bridge connected to ${config.remoteUrl.origin}\n`,
);

async function shutdown(): Promise<void> {
  await handle.close();
  process.exit(0);
}

process.on(
  "SIGINT",
  () => void shutdown(),
);
process.on(
  "SIGTERM",
  () => void shutdown(),
);
