import type {
  HealthStatus,
  ProviderResult,
} from "../core/types.js";
import type {
  SecretResolver,
} from "../secrets/resolver.js";
import {
  ProviderHttpClient,
  type FetchLike,
} from "./http.js";

export interface ProviderBaseOptions {
  id: string;
  baseUrl: string | URL;
  credentialRef: string;
  secretResolver: SecretResolver;
  fetchImpl?: FetchLike;
}

export abstract class ProviderBase {
  readonly #id: string;
  readonly #credentialRef: string;
  readonly #secretResolver:
    SecretResolver;
  protected readonly http:
    ProviderHttpClient;

  constructor(
    options: ProviderBaseOptions,
  ) {
    this.#id = options.id;
    this.#credentialRef =
      options.credentialRef;
    this.#secretResolver =
      options.secretResolver;
    this.http =
      new ProviderHttpClient({
        baseUrl:
          typeof options.baseUrl ===
          "string"
            ? new URL(
                options.baseUrl,
              )
            : options.baseUrl,
        ...(options.fetchImpl
          ? {
              fetchImpl:
                options.fetchImpl,
            }
          : {}),
      });
  }

  protected async token(): Promise<
    ProviderResult<string>
  > {
    try {
      const secret =
        await this.#secretResolver.resolve(
          this.#credentialRef,
        );
      return {
        ok: true,
        data: secret.reveal(),
      };
    } catch {
      return {
        ok: false,
        error: {
          code:
            "credential_unavailable",
          message:
            "provider credential is unavailable",
        },
      };
    }
  }

  async credentialHealth(): Promise<
    HealthStatus
  > {
    const token =
      await this.token();
    return {
      ok: token.ok,
      provider: this.#id,
      ...(token.ok
        ? {}
        : {
            message:
              "credential unavailable",
          }),
    };
  }
}
