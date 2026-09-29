const ENV_REFERENCE = /^env:([A-Z][A-Z0-9_]*)$/u;

export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return "<REDACTED>";
  }

  toJSON(): string {
    return "<REDACTED>";
  }
}

export interface SecretResolver {
  resolve(
    reference: string,
  ): Promise<SecretValue>;
}

export class EnvironmentSecretResolver
  implements SecretResolver
{
  readonly #env: NodeJS.ProcessEnv;

  constructor(
    env: NodeJS.ProcessEnv =
      process.env,
  ) {
    this.#env = env;
  }

  async resolve(
    reference: string,
  ): Promise<SecretValue> {
    const match =
      ENV_REFERENCE.exec(reference);

    if (!match) {
      throw new Error(
        "unsupported secret reference",
      );
    }

    const name = match[1];
    if (!name) {
      throw new Error(
        "invalid secret reference",
      );
    }

    const value = this.#env[name];
    if (!value) {
      throw new Error(
        "secret is unavailable",
      );
    }

    return new SecretValue(value);
  }
}

export class RoutedSecretResolver
  implements SecretResolver
{
  readonly #routes:
    ReadonlyMap<string, SecretResolver>;

  constructor(
    routes: ReadonlyMap<
      string,
      SecretResolver
    >,
  ) {
    this.#routes = routes;
  }

  async resolve(
    reference: string,
  ): Promise<SecretValue> {
    const separator =
      reference.indexOf(":");

    if (separator <= 0) {
      throw new Error(
        "invalid secret reference",
      );
    }

    const scheme =
      reference.slice(0, separator);
    const resolver =
      this.#routes.get(scheme);

    if (!resolver) {
      throw new Error(
        "unsupported secret reference",
      );
    }

    return resolver.resolve(reference);
  }
}
