import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import type {
  IntrospectionAuthConfig,
} from "./config.js";

type JsonObject =
  Record<string, unknown>;

function objectValue(
  value: unknown,
): JsonObject {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.length > 0
    ? value
    : undefined;
}

function audienceValues(
  value: unknown,
): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string",
    )
  ) {
    return value;
  }

  return [];
}

function scopes(
  value: unknown,
): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/\s+/u)
        .filter(Boolean),
    ),
  ];
}

function normalizeIssuer(
  value: string,
): string {
  return value.replace(/\/$/u, "");
}

function formEncode(
  value: string,
): string {
  const params =
    new URLSearchParams({
      value,
    });
  return params
    .toString()
    .slice("value=".length);
}

function basicAuth(
  clientId: string,
  clientSecret: string,
): string {
  const value =
    `${formEncode(clientId)}:${formEncode(clientSecret)}`;

  return Buffer
    .from(value, "utf8")
    .toString("base64");
}

export interface IntrospectionVerifierOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class IntrospectionTokenVerifier
  implements OAuthTokenVerifier
{
  readonly #config:
    IntrospectionAuthConfig;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(
    config: IntrospectionAuthConfig,
    options:
      IntrospectionVerifierOptions = {},
  ) {
    this.#config = config;
    this.#fetch =
      options.fetchImpl ?? fetch;
    this.#timeoutMs =
      options.timeoutMs ?? 10_000;
  }

  async verifyAccessToken(
    token: string,
  ): Promise<AuthInfo> {
    try {
      const body =
        new URLSearchParams({
          token,
          token_type_hint:
            "access_token",
        });

      const response =
        await this.#fetch(
          this.#config
            .introspectionEndpoint,
          {
            method: "POST",
            headers: {
              authorization:
                `Basic ${basicAuth(
                  this.#config
                    .introspectionClientId,
                  this.#config
                    .introspectionClientSecret,
                )}`,
              "content-type":
                "application/x-www-form-urlencoded",
              accept:
                "application/json",
            },
            body,
            signal:
              AbortSignal.timeout(
                this.#timeoutMs,
              ),
          },
        );

      if (!response.ok) {
        throw invalidToken();
      }

      let raw: unknown;
      try {
        raw =
          await response.json();
      } catch {
        throw invalidToken();
      }

      const payload =
        objectValue(raw);

      if (
        payload.active !== true
      ) {
        throw invalidToken();
      }

      const issuer =
        stringValue(payload.iss);
      if (
        !issuer ||
        normalizeIssuer(issuer) !==
          normalizeIssuer(
            this.#config
              .issuer.toString(),
          )
      ) {
        throw invalidToken();
      }

      const expiresAt =
        typeof payload.exp ===
        "number"
          ? payload.exp
          : undefined;

      if (
        !expiresAt ||
        expiresAt <=
          Math.floor(
            Date.now() / 1000,
          )
      ) {
        throw invalidToken();
      }

      const clientId =
        stringValue(
          payload.client_id,
        );
      if (!clientId) {
        throw invalidToken();
      }

      if (
        this.#config
          .introspectionAudience &&
        !audienceValues(
          payload.aud,
        ).includes(
          this.#config
            .introspectionAudience,
        )
      ) {
        throw invalidToken();
      }

      const subject =
        stringValue(payload.sub) ??
        stringValue(
          payload.username,
        ) ??
        clientId;

      const allowedResources =
        Array.isArray(
          payload.mcp_resources,
        )
          ? payload.mcp_resources.filter(
              (
                item,
              ): item is string =>
                typeof item ===
                "string",
            )
          : [];

      return {
        token,
        clientId,
        scopes:
          scopes(payload.scope),
        expiresAt,
        resource:
          this.#config
            .resourceUrl,
        extra: {
          subject,
          allowedResources,
          ...(payload.mcp_step_up ===
          true
            ? {
                stepUpAuthorized:
                  true,
              }
            : {}),
        },
      };
    } catch (error) {
      if (
        error instanceof OAuthError &&
        error.code ===
          OAuthErrorCode.InvalidToken
      ) {
        throw error;
      }

      throw invalidToken();
    }
  }
}

function invalidToken(): OAuthError {
  return new OAuthError(
    OAuthErrorCode.InvalidToken,
    "access token validation failed",
  );
}
