import {
  EnvironmentSecretResolver,
  RoutedSecretResolver,
  type SecretResolver,
} from "./resolver.js";
import {
  VaultKv2SecretResolver,
} from "./vault-kv2.js";

function parseBackends(
  value: string | undefined,
): string[] {
  const raw =
    value?.trim() || "env";

  return [
    ...new Set(
      raw
        .split(",")
        .map((item) =>
          item.trim(),
        )
        .filter(Boolean),
    ),
  ];
}

export interface SecretResolverFactoryOptions {
  fetchImpl?: typeof fetch;
}

export function createProviderSecretResolver(
  env: NodeJS.ProcessEnv =
    process.env,
  options:
    SecretResolverFactoryOptions = {},
): SecretResolver {
  const enabled =
    parseBackends(
      env.SECRET_BACKEND,
    );

  const routes =
    new Map<
      string,
      SecretResolver
    >();

  if (enabled.includes("env")) {
    routes.set(
      "env",
      new EnvironmentSecretResolver(
        env,
      ),
    );
  }

  if (
    enabled.includes(
      "vault-kv2",
    )
  ) {
    const address =
      env.VAULT_API_BASE_URL ??
      env.VAULT_ADDR;
    const token =
      env.VAULT_TOKEN;

    if (!address) {
      throw new Error(
        "VAULT_API_BASE_URL or VAULT_ADDR is required for vault-kv2 secret backend",
      );
    }

    if (!token) {
      throw new Error(
        "VAULT_TOKEN is required to bootstrap vault-kv2 secret backend",
      );
    }

    routes.set(
      "vault-kv2",
      new VaultKv2SecretResolver(
        {
          baseUrl: address,
          token,
          ...(env.VAULT_NAMESPACE
            ? {
                namespace:
                  env.VAULT_NAMESPACE,
              }
            : {}),
          ...(options.fetchImpl
            ? {
                fetchImpl:
                  options.fetchImpl,
              }
            : {}),
        },
      ),
    );
  }

  const unsupported =
    enabled.filter(
      (backend) =>
        backend !== "env" &&
        backend !==
          "vault-kv2",
    );

  if (unsupported.length > 0) {
    throw new Error(
      "unsupported secret backend",
    );
  }

  if (routes.size === 0) {
    throw new Error(
      "at least one secret backend must be enabled",
    );
  }

  return new RoutedSecretResolver(
    routes,
  );
}
