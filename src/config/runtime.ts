export interface JwtAuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: URL;
  requiredScopes: string[];
  algorithms: string[];
  clientIdClaims: string[];
}

export interface RuntimeConfig {
  bindHost: string;
  port: number;
  publicMcpUrl?: URL;
  allowedHostnames: string[];
  allowedOrigins: string[];
  auth?: JwtAuthConfig;
}

export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function csv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function requiredUrl(name: string, value: string | undefined): URL {
  if (!value) throw new Error(`${name} is required`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function optionalUrl(name: string, value: string | undefined): URL | undefined {
  return value ? requiredUrl(name, value) : undefined;
}

function isSecureOrLoopback(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname));
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const bindHost = env.MCP_BIND_HOST ?? "127.0.0.1";
  const port = Number(env.PORT ?? env.MCP_PORT ?? "3000");

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port: ${port}`);
  }

  const publicMcpUrl = optionalUrl("MCP_PUBLIC_MCP_URL", env.MCP_PUBLIC_MCP_URL);
  if (publicMcpUrl && !isSecureOrLoopback(publicMcpUrl)) {
    throw new Error("MCP_PUBLIC_MCP_URL must use HTTPS unless it is loopback");
  }

  const authRequested = Boolean(
    env.MCP_AUTH_ISSUER ||
      env.MCP_AUTH_JWKS_URL ||
      env.MCP_AUTH_AUDIENCE ||
      env.MCP_AUTH_REQUIRED_SCOPES,
  );

  let auth: JwtAuthConfig | undefined;
  if (authRequested) {
    if (!publicMcpUrl) {
      throw new Error("MCP_PUBLIC_MCP_URL is required when authentication is enabled");
    }

    const issuerUrl = requiredUrl("MCP_AUTH_ISSUER", env.MCP_AUTH_ISSUER);
    const jwksUrl = requiredUrl("MCP_AUTH_JWKS_URL", env.MCP_AUTH_JWKS_URL);

    if (!isSecureOrLoopback(issuerUrl) || !isSecureOrLoopback(jwksUrl)) {
      throw new Error("OAuth issuer and JWKS URLs must use HTTPS unless they are loopback");
    }

    auth = {
      issuer: env.MCP_AUTH_ISSUER!,
      audience: env.MCP_AUTH_AUDIENCE ?? publicMcpUrl.href,
      jwksUrl,
      requiredScopes: csv(env.MCP_AUTH_REQUIRED_SCOPES, ["mcp"]),
      algorithms: csv(env.MCP_AUTH_ALGORITHMS, ["RS256", "PS256", "ES256", "EdDSA"]),
      clientIdClaims: csv(env.MCP_AUTH_CLIENT_ID_CLAIMS, ["client_id", "azp"]),
    };
  }

  if (!isLoopbackHostname(bindHost) && !auth) {
    throw new Error(
      "remote binding requires OAuth/OIDC authentication; configure MCP_AUTH_ISSUER and MCP_AUTH_JWKS_URL",
    );
  }

  if (!isLoopbackHostname(bindHost) && !publicMcpUrl) {
    throw new Error("remote binding requires MCP_PUBLIC_MCP_URL");
  }

  const allowedHostnames = new Set(csv(env.MCP_ALLOWED_HOSTS));
  if (publicMcpUrl) allowedHostnames.add(publicMcpUrl.hostname);
  if (isLoopbackHostname(bindHost)) {
    allowedHostnames.add("localhost");
    allowedHostnames.add("127.0.0.1");
    allowedHostnames.add("[::1]");
    allowedHostnames.add("::1");
  }

  const allowedOrigins = new Set(csv(env.MCP_ALLOWED_ORIGINS));
  if (publicMcpUrl) allowedOrigins.add(publicMcpUrl.origin);
  if (isLoopbackHostname(bindHost)) {
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add(`http://127.0.0.1:${port}`);
    allowedOrigins.add(`http://[::1]:${port}`);
  }

  return {
    bindHost,
    port,
    ...(publicMcpUrl ? { publicMcpUrl } : {}),
    allowedHostnames: [...allowedHostnames],
    allowedOrigins: [...allowedOrigins],
    ...(auth ? { auth } : {}),
  };
}
