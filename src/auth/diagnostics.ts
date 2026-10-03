import { AsyncLocalStorage } from "node:async_hooks";

export const authenticationContext = new AsyncLocalStorage<{ requestId: string; mode: string }>();
export interface AuthenticationDiagnostic {
  event: "authentication" | "introspection" | "request" | "protocol_error";
  reason?: string;
  decision?: "allowed" | "denied" | "unavailable";
  tokenType?: "jwt" | "opaque";
  upstreamStatus?: number;
  active?: boolean;
  status?: number;
  sessionState?: "stateless";
}
// Callers supply controlled categories, never errors, headers or claims.
export function authenticationDiagnostic(event: AuthenticationDiagnostic): void {
  process.stderr.write(`${JSON.stringify({ ...authenticationContext.getStore(), ...event })}\n`);
}
export class AuthenticationServiceError extends Error {
  constructor(readonly reason: string) {
    super("Authentication service unavailable");
    this.name = "AuthenticationServiceError";
  }
}
