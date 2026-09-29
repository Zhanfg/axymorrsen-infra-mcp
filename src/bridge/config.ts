export interface RemoteBridgeConfig {
  remoteUrl: URL;
  token?: string;
}

function isLoopback(
  hostname: string,
): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function loadRemoteBridgeConfig(
  env: NodeJS.ProcessEnv =
    process.env,
): RemoteBridgeConfig {
  const value =
    env.MCP_REMOTE_URL?.trim();

  if (!value) {
    throw new Error(
      "MCP_REMOTE_URL is required",
    );
  }

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(value);
  } catch {
    throw new Error(
      "MCP_REMOTE_URL must be an absolute URL",
    );
  }

  if (
    remoteUrl.username ||
    remoteUrl.password
  ) {
    throw new Error(
      "MCP_REMOTE_URL must not contain credentials",
    );
  }

  if (remoteUrl.hash) {
    throw new Error(
      "MCP_REMOTE_URL must not contain a fragment",
    );
  }

  if (
    remoteUrl.protocol !== "https:" &&
    !(
      remoteUrl.protocol === "http:" &&
      isLoopback(remoteUrl.hostname)
    )
  ) {
    throw new Error(
      "MCP_REMOTE_URL must use HTTPS unless it is loopback",
    );
  }

  const token =
    env.MCP_BRIDGE_TOKEN?.trim();

  return {
    remoteUrl,
    ...(token
      ? { token }
      : {}),
  };
}
