import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
  type OAuthMetadata,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import type {
  GatewayAuthConfig,
  RemoteAuthConfig,
} from "./config.js";
import {
  IntrospectionTokenVerifier,
} from "./introspection-verifier.js";
import {
  JwtTokenVerifier,
} from "./jwt-verifier.js";

export interface DisabledAuthRuntime {
  mode: "disabled";
}

export interface RemoteAuthRuntime {
  mode: "jwt" | "introspection";
  config: RemoteAuthConfig;
  verifier: OAuthTokenVerifier;
  resourceMetadataUrl: string;
  oauthMetadata: OAuthMetadata;
}

export type AuthRuntime =
  | DisabledAuthRuntime
  | RemoteAuthRuntime;

function buildOAuthMetadata(
  config: RemoteAuthConfig,
): OAuthMetadata {
  const metadata: OAuthMetadata = {
    issuer:
      config.issuer.toString(),
    authorization_endpoint:
      config.authorizationEndpoint.toString(),
    token_endpoint:
      config.tokenEndpoint.toString(),
    response_types_supported: [
      "code",
    ],
    code_challenge_methods_supported: [
      "S256",
    ],
    scopes_supported:
      config.scopesSupported,
  };

  if (
    config.registrationEndpoint
  ) {
    metadata.registration_endpoint =
      config.registrationEndpoint.toString();
  }

  if (
    config.clientIdMetadataDocumentSupported !==
    undefined
  ) {
    metadata.client_id_metadata_document_supported =
      config.clientIdMetadataDocumentSupported;
  }

  return metadata;
}

export function createAuthRuntime(
  config: GatewayAuthConfig,
): AuthRuntime {
  if (
    config.mode === "disabled"
  ) {
    return {
      mode: "disabled",
    };
  }

  const verifier:
    OAuthTokenVerifier =
    config.mode === "jwt"
      ? new JwtTokenVerifier(
          config,
        )
      : new IntrospectionTokenVerifier(
          config,
        );

  return {
    mode: config.mode,
    config,
    verifier,
    resourceMetadataUrl:
      getOAuthProtectedResourceMetadataUrl(
        config.resourceUrl,
      ),
    oauthMetadata:
      buildOAuthMetadata(
        config,
      ),
  };
}

function nodeHeaders(
  req: IncomingMessage,
): Headers {
  const headers =
    new Headers();

  for (
    const [name, value] of
    Object.entries(req.headers)
  ) {
    if (
      typeof value === "string"
    ) {
      headers.set(name, value);
    } else if (
      Array.isArray(value)
    ) {
      for (const item of value) {
        headers.append(
          name,
          item,
        );
      }
    }
  }

  return headers;
}

export async function writeWebResponse(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode =
    response.status;

  response.headers.forEach(
    (value, name) =>
      res.setHeader(
        name,
        value,
      ),
  );

  const body =
    Buffer.from(
      await response.arrayBuffer(),
    );
  res.end(body);
}

export async function maybeServeOAuthMetadata(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: AuthRuntime,
): Promise<boolean> {
  if (
    runtime.mode === "disabled"
  ) {
    return false;
  }

  const url =
    new URL(
      req.url ?? "/",
      runtime.config
        .resourceUrl.origin,
    );

  const request =
    new Request(url, {
      method:
        req.method ?? "GET",
      headers:
        nodeHeaders(req),
    });

  const response =
    oauthMetadataResponse(
      request,
      {
        oauthMetadata:
          runtime.oauthMetadata,
        resourceServerUrl:
          runtime.config
            .resourceUrl,
        resourceName:
          "Axymorrsen Infrastructure MCP",
        scopesSupported:
          runtime.config
            .scopesSupported,
        dangerouslyAllowInsecureIssuerUrl:
          runtime.config
            .allowInsecureLocalhost,
      },
    );

  if (!response) {
    return false;
  }

  await writeWebResponse(
    response,
    res,
  );
  return true;
}

export async function authenticateMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: AuthRuntime,
): Promise<
  AuthInfo |
  undefined |
  null
> {
  if (
    runtime.mode === "disabled"
  ) {
    return undefined;
  }

  const options = {
    verifier: runtime.verifier,
    requiredScopes:
      runtime.config
        .requiredScopes,
    resourceMetadataUrl:
      runtime
        .resourceMetadataUrl,
  };

  try {
    return await verifyBearerToken(
      req.headers.authorization,
      options,
    );
  } catch (error) {
    await writeWebResponse(
      bearerAuthChallengeResponse(
        error,
        {
          requiredScopes:
            options
              .requiredScopes,
          resourceMetadataUrl:
            options
              .resourceMetadataUrl,
        },
      ),
      res,
    );

    return null;
  }
}
