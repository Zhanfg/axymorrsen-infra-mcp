import type { AuthInfo } from "@modelcontextprotocol/server";

export interface GatewayAuthContext {
  clientId: string;
  subject: string;
  scopes: string[];
  allowedResources: string[];
}

export function gatewayAuthContext(authInfo: AuthInfo): GatewayAuthContext {
  const extra = authInfo.extra ?? {};
  const subject =
    typeof extra.subject === "string" && extra.subject.length > 0
      ? extra.subject
      : authInfo.clientId;
  const allowedResources = Array.isArray(extra.allowedResources)
    ? extra.allowedResources.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return {
    clientId: authInfo.clientId,
    subject,
    scopes: [...authInfo.scopes],
    allowedResources,
  };
}
