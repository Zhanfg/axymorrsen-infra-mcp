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
import type { JwtAuthConfig } from "./config.js";

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function scopesFromPayload(payload: JWTPayload): string[] {
  const scope = payload.scope;
  if (typeof scope === "string") {
    return [...new Set(scope.split(/\s+/u).filter(Boolean))];
  }

  const scp = payload.scp;
  if (Array.isArray(scp) && scp.every((item) => typeof item === "string")) {
    return [...new Set(scp)];
  }
  if (typeof scp === "string") {
    return [...new Set(scp.split(/\s+/u).filter(Boolean))];
  }

  return [];
}

function resourcesFromPayload(payload: JWTPayload): string[] {
  const resources = payload.mcp_resources;
  if (!Array.isArray(resources)) return [];
  return [...new Set(resources.filter((item): item is string => typeof item === "string"))];
}

export function authInfoFromJwtPayload(
  token: string,
  payload: JWTPayload,
  config: JwtAuthConfig,
): AuthInfo {
  if (typeof payload.exp !== "number") {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "access token is missing an expiration",
    );
  }

  const clientId =
    stringClaim(payload, "client_id") ??
    stringClaim(payload, "azp") ??
    payload.sub;

  if (!clientId) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "access token is missing a client identifier",
    );
  }

  const subject = payload.sub ?? clientId;
  const allowedResources = resourcesFromPayload(payload);

  return {
    token,
    clientId,
    scopes: scopesFromPayload(payload),
    expiresAt: payload.exp,
    resource: config.resourceUrl.toString(),
    extra: {
      subject,
      allowedResources,
    },
  };
}

export class JwtTokenVerifier implements OAuthTokenVerifier {
  readonly #config: JwtAuthConfig;
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: JwtAuthConfig) {
    this.#config = config;
    this.#jwks = createRemoteJWKSet(config.jwksUrl);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#config.issuer.toString(),
        audience: this.#config.audience,
      });

      return authInfoFromJwtPayload(token, payload, this.#config);
    } catch (error) {
      if (
        error instanceof OAuthError &&
        error.code === OAuthErrorCode.InvalidToken
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
