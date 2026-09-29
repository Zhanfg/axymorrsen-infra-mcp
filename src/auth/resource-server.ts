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
  if (!config.auth || !publicMcpUrl) return undefined;

  const authConfig = config.auth;
  const publicMcpUrl = publicMcpUrl;

  const resourceMetadataUrl = String(
    getOAuthProtectedResourceMetadataUrl(publicMcpUrl),
  );
  const resourceMetadataPath = new URL(resourceMetadataUrl).pathname;

  const options: BearerAuthOptions = {
    verifier: createJwtTokenVerifier({
      ...config.auth,
      resourceUrl: publicMcpUrl,
    }),
    requiredScopes: authConfig.requiredScopes,
    resourceMetadataUrl,
  };

  const protectedResourceMetadata = Object.freeze({
    resource: publicMcpUrl.href,
    authorization_servers: [authConfig.issuer],
    scopes_supported: authConfig.requiredScopes,
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
          requiredScopes: authConfig.requiredScopes,
          resourceMetadataUrl,
        });
      }
    },
  };
}
