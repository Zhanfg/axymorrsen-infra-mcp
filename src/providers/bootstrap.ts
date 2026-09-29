import {
  EnvironmentSecretResolver,
} from "../secrets/resolver.js";
import {
  CircleCIProvider,
} from "./circleci.js";
import {
  CloudflareProvider,
} from "./cloudflare.js";
import {
  GitHubProvider,
} from "./github.js";
import {
  GitLabProvider,
} from "./gitlab.js";
import {
  providerRegistry,
} from "./registry.js";

let bootstrapped = false;

export function bootstrapCoreProviders(
  env: NodeJS.ProcessEnv =
    process.env,
): void {
  if (bootstrapped) return;

  const secrets =
    new EnvironmentSecretResolver(
      env,
    );

  providerRegistry.register(
    new GitHubProvider({
      secretResolver: secrets,
      credentialRef:
        env.GITHUB_CREDENTIAL_REF ??
        "env:GITHUB_TOKEN",
      ...(env.GITHUB_API_BASE_URL
        ? {
            baseUrl:
              env.GITHUB_API_BASE_URL,
          }
        : {}),
    }),
  );

  providerRegistry.register(
    new GitLabProvider({
      secretResolver: secrets,
      credentialRef:
        env.GITLAB_CREDENTIAL_REF ??
        "env:GITLAB_TOKEN",
      ...(env.GITLAB_API_BASE_URL
        ? {
            baseUrl:
              env.GITLAB_API_BASE_URL,
          }
        : {}),
    }),
  );

  providerRegistry.register(
    new CloudflareProvider({
      secretResolver: secrets,
      credentialRef:
        env.CLOUDFLARE_CREDENTIAL_REF ??
        "env:CLOUDFLARE_API_TOKEN",
      ...(env.CLOUDFLARE_API_BASE_URL
        ? {
            baseUrl:
              env.CLOUDFLARE_API_BASE_URL,
          }
        : {}),
    }),
  );

  providerRegistry.register(
    new CircleCIProvider({
      secretResolver: secrets,
      credentialRef:
        env.CIRCLECI_CREDENTIAL_REF ??
        "env:CIRCLECI_TOKEN",
      ...(env.CIRCLECI_API_BASE_URL
        ? {
            baseUrl:
              env.CIRCLECI_API_BASE_URL,
          }
        : {}),
    }),
  );

  bootstrapped = true;
}
