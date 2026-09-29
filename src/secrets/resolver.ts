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
