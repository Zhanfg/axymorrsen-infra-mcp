import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { IntrospectionAuthConfig } from "./config.js";
import { AuthenticationServiceError, authenticationDiagnostic } from "./diagnostics.js";

const nonempty = z.string().min(1);
const timestamp = z.number().int().nonnegative();
const introspectionSchema = z.discriminatedUnion("active", [
  z.object({ active: z.literal(false) }),
  z.object({
    active: z.literal(true), iss: nonempty, exp: timestamp, client_id: nonempty,
    scope: z.string().optional(), sub: nonempty.optional(), username: nonempty.optional(),
    aud: z.union([nonempty, z.array(nonempty)]).optional(), nbf: timestamp.optional(),
    token_type: nonempty.optional(), mcp_resources: z.array(nonempty).optional(),
    mcp_step_up: z.boolean().optional(),
  }),
]);

export function basicClientAuthorization(clientId: string, clientSecret: string): string {
  const encode = (value: string) => new URLSearchParams({ value }).toString().slice(6);
  return `Basic ${Buffer.from(`${encode(clientId)}:${encode(clientSecret)}`, "utf8").toString("base64")}`;
}
function invalidToken(reason: string): OAuthError {
  authenticationDiagnostic({ event: "introspection", decision: "denied", reason });
  return new OAuthError(OAuthErrorCode.InvalidToken, "Access token is invalid or expired");
}
export interface IntrospectionVerifierOptions { fetchImpl?: typeof fetch; timeoutMs?: number; }
export class IntrospectionTokenVerifier implements OAuthTokenVerifier {
  readonly #config: IntrospectionAuthConfig;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  constructor(config: IntrospectionAuthConfig, options: IntrospectionVerifierOptions = {}) {
    this.#config = config;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let response: Response;
    try {
      response = await this.#fetch(this.#config.introspectionEndpoint, {
        method: "POST",
        headers: {
          authorization: basicClientAuthorization(this.#config.introspectionClientId, this.#config.introspectionClientSecret),
          "content-type": "application/x-www-form-urlencoded", accept: "application/json",
        },
        body: new URLSearchParams({ token, token_type_hint: "access_token" }),
        signal: AbortSignal.timeout(this.#timeoutMs),
        redirect: "error",
      });
    } catch {
      authenticationDiagnostic({ event: "introspection", decision: "unavailable", reason: "network_or_timeout" });
      throw new AuthenticationServiceError("introspection_network_or_timeout");
    }
    authenticationDiagnostic({ event: "introspection", upstreamStatus: response.status });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? "introspection_client_auth_failed" : "introspection_upstream_failed";
      authenticationDiagnostic({ event: "introspection", decision: "unavailable", reason });
      throw new AuthenticationServiceError(reason);
    }
    let raw: unknown;
    try { raw = await response.json(); } catch {
      throw new AuthenticationServiceError("introspection_invalid_json");
    }
    const parsed = introspectionSchema.safeParse(raw);
    if (!parsed.success) {
      authenticationDiagnostic({ event: "introspection", decision: "unavailable", reason: "invalid_response_schema" });
      throw new AuthenticationServiceError("introspection_invalid_response");
    }
    const payload = parsed.data;
    authenticationDiagnostic({ event: "introspection", active: payload.active });
    if (!payload.active) throw invalidToken("inactive");
    if (payload.iss.replace(/\/$/u, "") !== this.#config.issuer.toString().replace(/\/$/u, "")) throw invalidToken("issuer_mismatch");
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || (payload.nbf !== undefined && payload.nbf > now)) throw invalidToken("expired_or_not_yet_valid");
    if (payload.token_type !== undefined && payload.token_type.toLowerCase() !== "bearer") throw invalidToken("unsupported_token_type");
    const audience = typeof payload.aud === "string" ? [payload.aud] : payload.aud ?? [];
    if (this.#config.introspectionAudience && !audience.includes(this.#config.introspectionAudience)) throw invalidToken("audience_mismatch");
    return {
      token, clientId: payload.client_id,
      scopes: [...new Set((payload.scope ?? "").split(/\s+/u).filter(Boolean))],
      expiresAt: payload.exp, resource: this.#config.resourceUrl,
      extra: {
        subject: payload.sub ?? payload.username ?? payload.client_id,
        allowedResources: [...new Set(payload.mcp_resources ?? [])],
        ...(payload.mcp_step_up === true ? { stepUpAuthorized: true } : {}),
      },
    };
  }
}
