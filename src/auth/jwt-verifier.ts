import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { JwtAuthConfig } from "../config/runtime.js";

function invalidToken(message: string): never {
  throw new OAuthError(OAuthErrorCode.InvalidToken, message);
}

function claimString(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseScopes(payload: JWTPayload): string[] {
  const collected = new Set<string>();

  const scope = payload.scope;
  if (typeof scope === "string") {
    for (const item of scope.split(/\s+/u)) {
      if (item) collected.add(item);
    }
  }

  const scp = payload.scp;
  if (typeof scp === "string") {
    for (const item of scp.split(/\s+/u)) {
      if (item) collected.add(item);
    }
  } else if (Array.isArray(scp)) {
    for (const item of scp) {
      if (typeof item === "string" && item) collected.add(item);
    }
  }

  return [...collected];
}

export function createJwtTokenVerifier(
  config: JwtAuthConfig & { resourceUrl: URL },
): OAuthTokenVerifier {
  const jwks = createRemoteJWKSet(config.jwksUrl, {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
  });

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: config.algorithms,
        });

        if (typeof payload.exp !== "number") {
          return invalidToken("access token is missing exp");
        }

        const clientId = config.clientIdClaims
          .map((name) => claimString(payload, name))
          .find((value): value is string => Boolean(value));

        if (!clientId) {
          return invalidToken(
            `access token is missing a configured client identity claim (${config.clientIdClaims.join(", ")})`,
          );
        }

        const extra: Record<string, unknown> = {};
        if (typeof payload.sub === "string") extra.subject = payload.sub;
        if (typeof payload.iss === "string") extra.issuer = payload.iss;

        return {
          token,
          clientId,
          scopes: parseScopes(payload),
          expiresAt: payload.exp,
          resource: new URL(config.resourceUrl.href),
          extra,
        };
      } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw new OAuthError(OAuthErrorCode.InvalidToken, "access token validation failed");
      }
    },
  };
}
