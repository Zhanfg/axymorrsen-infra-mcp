import type {
  SecretResolver,
} from "./resolver.js";
import {
  SecretValue,
} from "./resolver.js";

const REFERENCE =
  /^vault-kv2:([A-Za-z0-9._-]+)\\/([^#]+)#([A-Za-z0-9._-]+)$/u;

export interface VaultKv2SecretResolverOptions {
  baseUrl: string | URL;
  token: string;
  namespace?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isLoopbackHostname(
  hostname: string,
): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function normalizeBaseUrl(
  value: string | URL,
): URL {
  const url =
    value instanceof URL
      ? new URL(value.href)
      : new URL(value);

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Vault base URL must not contain credentials, query, or fragment",
    );
  }

  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      isLoopbackHostname(
        url.hostname,
      )
    )
  ) {
    throw new Error(
      "Vault base URL must use HTTPS unless it is loopback",
    );
  }

  if (
    url.pathname === "/" ||
    url.pathname === ""
  ) {
    url.pathname = "/v1/";
  } else if (
    url.pathname === "/v1"
  ) {
    url.pathname = "/v1/";
  } else if (
    !url.pathname.endsWith(
      "/v1/",
    )
  ) {
    throw new Error(
      "Vault base URL must target the /v1/ API root",
    );
  }

  return url;
}

function validatePath(
  path: string,
): string[] {
  const parts = path.split("/");

  if (
    parts.length === 0 ||
    parts.some(
      (part) =>
        part.length === 0 ||
        part === "." ||
        part === ".." ||
        part.includes("*"),
    )
  ) {
    throw new Error(
      "invalid Vault secret path",
    );
  }

  return parts;
}

export class VaultKv2SecretResolver
  implements SecretResolver
{
  readonly #baseUrl: URL;
  readonly #token: string;
  readonly #namespace:
    string | undefined;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(
    options:
      VaultKv2SecretResolverOptions,
  ) {
    if (!options.token) {
      throw new Error(
        "Vault bootstrap token is required",
      );
    }

    this.#baseUrl =
      normalizeBaseUrl(
        options.baseUrl,
      );
    this.#token = options.token;
    this.#namespace =
      options.namespace;
    this.#fetch =
      options.fetchImpl ?? fetch;
    this.#timeoutMs =
      options.timeoutMs ?? 10_000;
  }

  async resolve(
    reference: string,
  ): Promise<SecretValue> {
    const match =
      REFERENCE.exec(reference);

    if (!match) {
      throw new Error(
        "invalid Vault KV v2 secret reference",
      );
    }

    const mount = match[1];
    const rawPath = match[2];
    const field = match[3];

    if (
      !mount ||
      !rawPath ||
      !field
    ) {
      throw new Error(
        "invalid Vault KV v2 secret reference",
      );
    }

    const pathParts =
      validatePath(rawPath);

    const relativePath = [
      encodeURIComponent(mount),
      "data",
      ...pathParts.map((part) =>
        encodeURIComponent(part),
      ),
    ].join("/");

    const url = new URL(
      relativePath,
      this.#baseUrl,
    );

    const response =
      await this.#fetch(url, {
        method: "GET",
        headers: {
          "x-vault-token":
            this.#token,
          "x-vault-request":
            "true",
          accept:
            "application/json",
          ...(this.#namespace
            ? {
                "x-vault-namespace":
                  this.#namespace,
              }
            : {}),
        },
        signal:
          AbortSignal.timeout(
            this.#timeoutMs,
          ),
      });

    if (!response.ok) {
      throw new Error(
        "Vault secret is unavailable",
      );
    }

    let payload: unknown;
    try {
      payload =
        await response.json();
    } catch {
      throw new Error(
        "Vault returned an invalid response",
      );
    }

    const top =
      objectValue(payload);
    const outerData =
      objectValue(top.data);
    const secretData =
      objectValue(
        outerData.data,
      );
    const value =
      secretData[field];

    if (
      typeof value !== "string" ||
      value.length === 0
    ) {
      throw new Error(
        "Vault secret field is unavailable",
      );
    }

    return new SecretValue(value);
  }
}

function objectValue(
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
