import type {
  ProviderResult,
} from "../core/types.js";

export type FetchLike = typeof fetch;

export interface ProviderHttpClientOptions {
  baseUrl: URL;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class ProviderHttpClient {
  readonly #baseUrl: URL;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(
    options: ProviderHttpClientOptions,
  ) {
    this.#baseUrl = options.baseUrl;
    this.#fetch =
      options.fetchImpl ?? fetch;
    this.#timeoutMs =
      options.timeoutMs ?? 15_000;
  }

  async request(
    path: string,
    init: RequestInit,
  ): Promise<ProviderResult> {
    const url = new URL(
      path.replace(/^\//u, ""),
      this.#baseUrl,
    );

    try {
      const response =
        await this.#fetch(url, {
          ...init,
          signal:
            AbortSignal.timeout(
              this.#timeoutMs,
            ),
        });

      const text =
        await response.text();
      let data: unknown = undefined;

      if (text.length > 0) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          error: {
            code:
              `provider_http_${response.status}`,
            message:
              `provider API request failed with HTTP ${response.status}`,
            retryable:
              response.status === 429 ||
              response.status >= 500,
          },
        };
      }

      return {
        ok: true,
        data,
      };
    } catch {
      return {
        ok: false,
        error: {
          code:
            "provider_network_error",
          message:
            "provider API request failed",
          retryable: true,
        },
      };
    }
  }
}

export function jsonBody(
  value: unknown,
): {
  body: string;
  headers: Record<string, string>;
} {
  return {
    body: JSON.stringify(value),
    headers: {
      "content-type":
        "application/json",
    },
  };
}

export function objectValue(
  value: unknown,
): Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<
        string,
        unknown
      >)
    : {};
}
