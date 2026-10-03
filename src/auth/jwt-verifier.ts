import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import type {
  JwtAuthConfig,
} from "./config.js";
import { AuthenticationServiceError } from "./diagnostics.js";

function stringClaim(
  payload: JWTPayload,
  name: string,
): string | undefined {
  const value = payload[name];
  return (
    typeof value === "string" &&
    value.length > 0
      ? value
      : undefined
  );
}

function scopesFromPayload(
  payload: JWTPayload,
): string[] {
  const scope = payload.scope;
  if (typeof scope === "string") {
    return [
      ...new Set(
        scope
          .split(/\s+/u)
          .filter(Boolean),
      ),
    ];
  }

  const scp = payload.scp;
  if (
    Array.isArray(scp) &&
    scp.every(
      (item) =>
        typeof item === "string",
    )
  ) {
    return [...new Set(scp)];
  }

  if (typeof scp === "string") {
    return [
      ...new Set(
        scp
          .split(/\s+/u)
          .filter(Boolean),
      ),
    ];
  }

  return [];
}

function resourcesFromPayload(
  payload: JWTPayload,
): string[] {
  const resources =
    payload.mcp_resources;

  if (!Array.isArray(resources)) {
    return [];
  }

  return [
    ...new Set(
      resources.filter(
        (item): item is string =>
          typeof item === "string",
      ),
    ),
  ];
}

function audienceValues(
  payload: JWTPayload,
): string[] {
  const audience = payload.aud;

  if (typeof audience === "string") {
    return [audience];
  }

  if (
    Array.isArray(audience) &&
    audience.every(
      (item) =>
        typeof item === "string",
    )
  ) {
    return audience;
  }

  return [];
}

function clientIdFromPayload(
  payload: JWTPayload,
  allowSubjectFallback: boolean,
): string | undefined {
  return (
    stringClaim(
      payload,
      "client_id",
    ) ??
    stringClaim(payload, "azp") ??
    (allowSubjectFallback
      ? payload.sub
      : undefined)
  );
}

export function authInfoFromJwtPayload(
  token: string,
  payload: JWTPayload,
  config: JwtAuthConfig,
): AuthInfo {
  if (
    typeof payload.exp !== "number"
  ) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "access token is missing an expiration",
    );
  }

  const clientId =
    clientIdFromPayload(
      payload,
      config.audienceMode !==
        "client_id",
    );

  if (!clientId) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "access token is missing a client identifier",
    );
  }

  if (
    config.audienceMode ===
      "client_id" &&
    !audienceValues(
      payload,
    ).includes(clientId)
  ) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "access token audience does not include the authenticated client",
    );
  }

  const subject =
    payload.sub ?? clientId;
  const allowedResources =
    resourcesFromPayload(payload);
  const stepUpAuthorized =
    payload.mcp_step_up === true;

  return {
    token,
    clientId,
    scopes:
      scopesFromPayload(payload),
    expiresAt: payload.exp,
    resource: config.resourceUrl,
    extra: {
      subject,
      allowedResources,
      ...(stepUpAuthorized
        ? {
            stepUpAuthorized: true,
          }
        : {}),
    },
  };
}

export class JwtTokenVerifier
  implements OAuthTokenVerifier
{
  readonly #config:
    JwtAuthConfig;
  readonly #jwks:
    ReturnType<
      typeof createRemoteJWKSet
    >;

  constructor(
    config: JwtAuthConfig,
  ) {
    this.#config = config;
    this.#jwks =
      createRemoteJWKSet(
        config.jwksUrl,
      );
  }

  async verifyAccessToken(
    token: string,
  ): Promise<AuthInfo> {
    try {
      const verifyOptions = {
        issuer:
          this.#config.issuerIdentifier ?? this.#config.issuer.toString(),
        ...(this.#config
          .audienceMode === "exact"
          ? {
              audience:
                this.#config
                  .audience,
            }
          : {}),
      };

      const { payload } =
        await jwtVerify(
          token,
          this.#jwks,
          verifyOptions,
        );

      return authInfoFromJwtPayload(
        token,
        payload,
        this.#config,
      );
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && "code" in error &&
        ["ERR_JWKS_TIMEOUT", "ERR_JWKS_INVALID", "ERR_JOSE_GENERIC"].includes(String(error.code)))) {
        throw new AuthenticationServiceError("jwks_unavailable");
      }
      if (
        error instanceof OAuthError &&
        error.code ===
          OAuthErrorCode.InvalidToken
      ) {
        throw error;
      }

      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        "access token validation failed",
      );
    }
  }
}
