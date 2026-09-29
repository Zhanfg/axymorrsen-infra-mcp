import {
  EnvironmentSecretResolver,
} from "../secrets/resolver.js";
import { CircleCIProvider } from "./circleci.js";
import { CloudflareProvider } from "./cloudflare.js";
import { GitHubProvider } from "./github.js";
import { GitLabProvider } from "./gitlab.js";
import { RailwayProvider } from "./railway.js";
import { SentryProvider } from "./sentry.js";
import { SupabaseProvider } from "./supabase.js";
import { TerraformProvider } from "./terraform.js";
import { VercelProvider } from "./vercel.js";
import {
  providerRegistry,
} from "./registry.js";

let bootstrapped = false;

function optionalBaseUrl(
  value: string | undefined,
): { baseUrl: string } | {} {
  return value
    ? { baseUrl: value }
    : {};
}

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
      ...optionalBaseUrl(
        env.GITHUB_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new GitLabProvider({
      secretResolver: secrets,
      credentialRef:
        env.GITLAB_CREDENTIAL_REF ??
        "env:GITLAB_TOKEN",
      ...optionalBaseUrl(
        env.GITLAB_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new CloudflareProvider({
      secretResolver: secrets,
      credentialRef:
        env.CLOUDFLARE_CREDENTIAL_REF ??
        "env:CLOUDFLARE_API_TOKEN",
      ...optionalBaseUrl(
        env.CLOUDFLARE_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new CircleCIProvider({
      secretResolver: secrets,
      credentialRef:
        env.CIRCLECI_CREDENTIAL_REF ??
        "env:CIRCLECI_TOKEN",
      ...optionalBaseUrl(
        env.CIRCLECI_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new VercelProvider({
      secretResolver: secrets,
      credentialRef:
        env.VERCEL_CREDENTIAL_REF ??
        "env:VERCEL_TOKEN",
      ...optionalBaseUrl(
        env.VERCEL_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new RailwayProvider({
      secretResolver: secrets,
      credentialRef:
        env.RAILWAY_CREDENTIAL_REF ??
        "env:RAILWAY_TOKEN",
      ...optionalBaseUrl(
        env.RAILWAY_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new SupabaseProvider({
      secretResolver: secrets,
      credentialRef:
        env.SUPABASE_CREDENTIAL_REF ??
        "env:SUPABASE_ACCESS_TOKEN",
      ...optionalBaseUrl(
        env.SUPABASE_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new SentryProvider({
      secretResolver: secrets,
      credentialRef:
        env.SENTRY_CREDENTIAL_REF ??
        "env:SENTRY_AUTH_TOKEN",
      ...optionalBaseUrl(
        env.SENTRY_API_BASE_URL,
      ),
    }),
  );

  providerRegistry.register(
    new TerraformProvider({
      secretResolver: secrets,
      credentialRef:
        env.TERRAFORM_CREDENTIAL_REF ??
        "env:TFC_TOKEN",
      ...optionalBaseUrl(
        env.TERRAFORM_API_BASE_URL,
      ),
    }),
  );

  bootstrapped = true;
}
