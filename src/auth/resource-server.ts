import type { IncomingMessage } from "node:http";
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
  type AuthInfo,
  type BearerAuthOptions,
} from "@modelcontextprotocol/server";
import type { RuntimeConfig } from "../config/runtime.js";
import { createJwtTokenVerifier } from "./jwt-verifier.js";

export type AuthenticatedIncomingMessage = IncomingMessage & {
  auth?: AuthInfo;
};

export interface ResourceServerAuth {
  resourceMetadataUrl: string;
  metadataPaths: ReadonlySet<string>;
  protectedResourceMetadata: Readonly<Record<string, unknown>>;
  authenticate(request: AuthenticatedIncomingMessage): Promise<AuthInfo | Response>;
}

export function createResourceServerAuth(
  config: RuntimeConfig,
): ResourceServerAuth | undefined {
  if (!config.auth || !config.publicMcpUrl) return undefined;

  const resourceMetadataUrl = String(
    getOAuthProtectedResourceMetadataUrl(config.publicMcpUrl),
  );
  const resourceMetadataPath = new URL(resourceMetadataUrl).pathname;

  const options: BearerAuthOptions = {
    verifier: createJwtTokenVerifier({
      ...config.auth,
      resourceUrl: config.publicMcpUrl,
    }),
    requiredScopes: config.auth.requiredScopes,
    resourceMetadataUrl,
  };

  const protectedResourceMetadata = Object.freeze({
    resource: config.publicMcpUrl.href,
    authorization_servers: [config.auth.issuer],
    scopes_supported: config.auth.requiredScopes,
    bearer_methods_supported: ["header"],
    resource_name: "Axymorrsen Infra MCP",
  });

  return {
    resourceMetadataUrl,
    metadataPaths: new Set([
      resourceMetadataPath,
      "/.well-known/oauth-protected-resource",
    ]),
    protectedResourceMetadata,
    async authenticate(
      request: AuthenticatedIncomingMessage,
    ): Promise<AuthInfo | Response> {
      try {
        return await verifyBearerToken(request.headers.authorization, options);
      } catch (error) {
        return bearerAuthChallengeResponse(error, {
          requiredScopes: options.requiredScopes,
          resourceMetadataUrl,
        });
      }
    },
  };
}
