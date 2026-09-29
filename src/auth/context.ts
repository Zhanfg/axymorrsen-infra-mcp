export interface GatewayAuthContext {
  clientId: string;
  subject: string;
  scopes: string[];
  allowedResources: string[];
}

/**
 * Remote authentication is intentionally not enabled in the bootstrap runtime.
 *
 * Until OAuth/OIDC verification middleware lands, the HTTP entrypoint only
 * binds to loopback. Provider credentials are never accepted from MCP clients.
 */
export const REMOTE_AUTH_IMPLEMENTED = false;
