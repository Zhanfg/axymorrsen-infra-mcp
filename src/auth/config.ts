export type AuthMode =
  | "disabled"
  | "jwt"
  | "introspection";

export type JwtAudienceMode =
  | "exact"
  | "client_id";

interface RemoteAuthConfigBase {
  resourceUrl: URL;
  issuer: URL;
  // OAuth issuer identifiers must not gain a slash through URL serialization.
  issuerIdentifier?: string;
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

export interface DisabledAuthConfig {
  mode: "disabled";
}

export interface JwtAuthConfig
  extends RemoteAuthConfigBase {
  mode: "jwt";
  audienceMode: JwtAudienceMode;
  audience: string;
  jwksUrl: URL;
}

export interface IntrospectionAuthConfig
  extends RemoteAuthConfigBase {
  mode: "introspection";
  introspectionEndpoint: URL;
  introspectionClientId: string;
  introspectionClientSecret: string;
  introspectionAudience?: string;
}

export type RemoteAuthConfig =
  | JwtAuthConfig
  | IntrospectionAuthConfig;

export type GatewayAuthConfig =
  | DisabledAuthConfig
  | RemoteAuthConfig;

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
      `${name} is required for remote authentication`,
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

  if (url.username || url.password || url.hash) {
    throw new Error(`${name} must not contain credentials or a fragment`);
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

function sharedRemoteConfig(
  env: Env,
  allowInsecureLocalhost: boolean,
): Omit<
  RemoteAuthConfigBase,
  "registrationEndpoint" |
  "clientIdMetadataDocumentSupported"
> & {
  registrationEndpoint?: URL;
  clientIdMetadataDocumentSupported?: boolean;
} {
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

  const config = {
    resourceUrl,
    issuer,
    issuerIdentifier: requireEnv(env, "MCP_AUTH_ISSUER_URL"),
    authorizationEndpoint,
    tokenEndpoint,
    requiredScopes,
    scopesSupported,
    allowedHosts,
    allowedOrigins,
    allowInsecureLocalhost,
    ...(registrationEndpoint
      ? { registrationEndpoint }
      : {}),
  };

  if (
    env.MCP_AUTH_CLIENT_ID_METADATA_DOCUMENT_SUPPORTED !==
    undefined
  ) {
    return {
      ...config,
      clientIdMetadataDocumentSupported:
        parseBoolean(
          env.MCP_AUTH_CLIENT_ID_METADATA_DOCUMENT_SUPPORTED,
        ),
    };
  }

  return config;
}

export function loadAuthConfig(
  env: Env = process.env,
): GatewayAuthConfig {
  env = {
    ...env,
    MCP_AUTH_ISSUER_URL: env.MCP_AUTH_ISSUER_URL ?? env.ZITADEL_ISSUER,
    MCP_AUTH_INTROSPECTION_ENDPOINT: env.MCP_AUTH_INTROSPECTION_ENDPOINT ?? env.ZITADEL_INTROSPECTION_URL,
    MCP_AUTH_INTROSPECTION_CLIENT_ID: env.MCP_AUTH_INTROSPECTION_CLIENT_ID ?? env.ZITADEL_CLIENT_ID,
    MCP_AUTH_INTROSPECTION_CLIENT_SECRET: env.MCP_AUTH_INTROSPECTION_CLIENT_SECRET ?? env.ZITADEL_CLIENT_SECRET,
  };
  const mode = (
    env.MCP_AUTH_MODE
      ?.trim()
      .toLowerCase() ||
    "disabled"
  ) as AuthMode;

  if (mode === "disabled") {
    return { mode };
  }

  if (
    mode !== "jwt" &&
    mode !== "introspection"
  ) {
    throw new Error(
      `unsupported MCP_AUTH_MODE: ${mode}`,
    );
  }

  const allowInsecureLocalhost =
    parseBoolean(
      env.MCP_AUTH_ALLOW_INSECURE_LOCALHOST,
      false,
    );

  const shared =
    sharedRemoteConfig(
      env,
      allowInsecureLocalhost,
    );

  if (mode === "jwt") {
    return {
      ...shared,
      mode,
      audienceMode:
        parseAudienceMode(
          env.MCP_AUTH_AUDIENCE_MODE,
        ),
      audience:
        env.MCP_AUTH_AUDIENCE
          ?.trim() ||
        shared.resourceUrl.toString(),
      jwksUrl:
        parseSecureUrl(
          requireEnv(
            env,
            "MCP_AUTH_JWKS_URL",
          ),
          "MCP_AUTH_JWKS_URL",
          allowInsecureLocalhost,
        ),
    };
  }

  return {
    ...shared,
    mode,
    introspectionEndpoint:
      parseSecureUrl(
        requireEnv(
          env,
          "MCP_AUTH_INTROSPECTION_ENDPOINT",
        ),
        "MCP_AUTH_INTROSPECTION_ENDPOINT",
        allowInsecureLocalhost,
      ),
    introspectionClientId:
      requireEnv(
        env,
        "MCP_AUTH_INTROSPECTION_CLIENT_ID",
      ),
    introspectionClientSecret:
      requireEnv(
        env,
        "MCP_AUTH_INTROSPECTION_CLIENT_SECRET",
      ),
    ...(env.MCP_AUTH_INTROSPECTION_AUDIENCE
      ?.trim()
      ? {
          introspectionAudience:
            env.MCP_AUTH_INTROSPECTION_AUDIENCE.trim(),
        }
      : {}),
  };
}
