export type AuthMode = "disabled" | "jwt";
export type JwtAudienceMode =
  | "exact"
  | "client_id";

export interface DisabledAuthConfig {
  mode: "disabled";
}

export interface JwtAuthConfig {
  mode: "jwt";
  resourceUrl: URL;
  audienceMode: JwtAudienceMode;
  audience: string;
  issuer: URL;
  jwksUrl: URL;
  authorizationEndpoint: URL;
  tokenEndpoint: URL;
  registrationEndpoint?: URL;
  clientIdMetadataDocumentSupported?: boolean;
  requiredScopes: string[];
  scopesSupported: string[];
  allowedHosts: string[];
  allowedOrigins: string[];
  allowInsecureLocalhost: boolean;
}

export type GatewayAuthConfig =
  | DisabledAuthConfig
  | JwtAuthConfig;

type Env = Record<
  string,
  string | undefined
>;

function requireEnv(
  env: Env,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required when MCP_AUTH_MODE=jwt`,
    );
  }
  return value;
}

function parseBoolean(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (
    value === undefined ||
    value.trim() === ""
  ) {
    return defaultValue;
  }

  switch (
    value.trim().toLowerCase()
  ) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(
        `invalid boolean value: ${value}`,
      );
  }
}

function parseList(
  value: string | undefined,
): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[\s,]+/u)
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean),
    ),
  ];
}

function isLoopbackHostname(
  hostname: string,
): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function parseSecureUrl(
  value: string,
  name: string,
  allowInsecureLocalhost: boolean,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${name} must be a valid absolute URL`,
    );
  }

  if (url.protocol === "https:") {
    return url;
  }

  if (
    allowInsecureLocalhost &&
    url.protocol === "http:" &&
    isLoopbackHostname(
      url.hostname,
    )
  ) {
    return url;
  }

  throw new Error(
    `${name} must use https`,
  );
}

function parseOrigin(
  value: string,
  name: string,
): string {
  const url = new URL(value);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} entries must be origins without a path, query, or fragment`,
    );
  }
  return url.origin;
}

function parseAudienceMode(
  value: string | undefined,
): JwtAudienceMode {
  const mode =
    value?.trim().toLowerCase() ||
    "exact";

  if (
    mode !== "exact" &&
    mode !== "client_id"
  ) {
    throw new Error(
      `unsupported MCP_AUTH_AUDIENCE_MODE: ${mode}`,
    );
  }

  return mode;
}

export function loadAuthConfig(
  env: Env = process.env,
): GatewayAuthConfig {
  const mode = (
    env.MCP_AUTH_MODE
      ?.trim()
      .toLowerCase() ||
    "disabled"
  ) as AuthMode;

  if (mode === "disabled") {
    return { mode };
  }

  if (mode !== "jwt") {
    throw new Error(
      `unsupported MCP_AUTH_MODE: ${mode}`,
    );
  }

  const allowInsecureLocalhost =
    parseBoolean(
      env.MCP_AUTH_ALLOW_INSECURE_LOCALHOST,
      false,
    );

  const resourceUrl =
    parseSecureUrl(
      requireEnv(
        env,
        "MCP_PUBLIC_URL",
      ),
      "MCP_PUBLIC_URL",
      allowInsecureLocalhost,
    );

  const issuer =
    parseSecureUrl(
      requireEnv(
        env,
        "MCP_AUTH_ISSUER_URL",
      ),
      "MCP_AUTH_ISSUER_URL",
      allowInsecureLocalhost,
    );

  const jwksUrl =
    parseSecureUrl(
      requireEnv(
        env,
        "MCP_AUTH_JWKS_URL",
      ),
      "MCP_AUTH_JWKS_URL",
      allowInsecureLocalhost,
    );

  const authorizationEndpoint =
    parseSecureUrl(
      requireEnv(
        env,
        "MCP_AUTHORIZATION_ENDPOINT",
      ),
      "MCP_AUTHORIZATION_ENDPOINT",
      allowInsecureLocalhost,
    );

  const tokenEndpoint =
    parseSecureUrl(
      requireEnv(
        env,
        "MCP_TOKEN_ENDPOINT",
      ),
      "MCP_TOKEN_ENDPOINT",
      allowInsecureLocalhost,
    );

  const registrationEndpointValue =
    env.MCP_REGISTRATION_ENDPOINT
      ?.trim();

  const registrationEndpoint =
    registrationEndpointValue
      ? parseSecureUrl(
          registrationEndpointValue,
          "MCP_REGISTRATION_ENDPOINT",
          allowInsecureLocalhost,
        )
      : undefined;

  const requiredScopes =
    parseList(
      env.MCP_AUTH_REQUIRED_SCOPES,
    );
  if (requiredScopes.length === 0) {
    requiredScopes.push(
      "infra:connect",
    );
  }

  const scopesSupported =
    parseList(
      env.MCP_AUTH_SCOPES_SUPPORTED,
    );
  if (scopesSupported.length === 0) {
    scopesSupported.push(
      ...requiredScopes,
    );
  }

  for (
    const scope of requiredScopes
  ) {
    if (
      !scopesSupported.includes(
        scope,
      )
    ) {
      throw new Error(
        `required scope is not advertised by MCP_AUTH_SCOPES_SUPPORTED: ${scope}`,
      );
    }
  }

  const configuredHosts =
    parseList(
      env.MCP_ALLOWED_HOSTS,
    ).map((host) =>
      host.toLowerCase(),
    );

  const allowedHosts = [
    ...new Set([
      resourceUrl.hostname.toLowerCase(),
      ...configuredHosts,
    ]),
  ];

  const allowedOrigins =
    parseList(
      env.MCP_ALLOWED_ORIGINS,
    ).map((origin) =>
      parseOrigin(
        origin,
        "MCP_ALLOWED_ORIGINS",
      ),
    );

  const config: JwtAuthConfig = {
    mode,
    resourceUrl,
    audienceMode:
      parseAudienceMode(
        env.MCP_AUTH_AUDIENCE_MODE,
      ),
    audience:
      env.MCP_AUTH_AUDIENCE
        ?.trim() ||
      resourceUrl.toString(),
    issuer,
    jwksUrl,
    authorizationEndpoint,
    tokenEndpoint,
    requiredScopes,
    scopesSupported,
    allowedHosts,
    allowedOrigins,
    allowInsecureLocalhost,
  };

  if (registrationEndpoint) {
    config.registrationEndpoint =
      registrationEndpoint;
  }

  if (
    env.MCP_AUTH_CLIENT_ID_METADATA_DOCUMENT_SUPPORTED !==
    undefined
  ) {
    config.clientIdMetadataDocumentSupported =
      parseBoolean(
        env.MCP_AUTH_CLIENT_ID_METADATA_DOCUMENT_SUPPORTED,
      );
  }

  return config;
}
