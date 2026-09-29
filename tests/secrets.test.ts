import {
  describe,
  expect,
  it,
} from "vitest";
import {
  EnvironmentSecretResolver,
  SecretValue,
} from "../src/secrets/resolver.js";

describe("secret resolver", () => {
  it("redacts secret values when serialized or stringified", () => {
    const secret =
      new SecretValue("sensitive");

    expect(String(secret)).toBe(
      "<REDACTED>",
    );
    expect(
      JSON.stringify({ secret }),
    ).toBe(
      '{"secret":"<REDACTED>"}',
    );
    expect(secret.reveal()).toBe(
      "sensitive",
    );
  });

  it("resolves only explicit env references", async () => {
    const resolver =
      new EnvironmentSecretResolver({
        PROVIDER_TOKEN: "secret",
      });

    await expect(
      resolver.resolve(
        "env:PROVIDER_TOKEN",
      ),
    ).resolves.toBeInstanceOf(
      SecretValue,
    );

    await expect(
      resolver.resolve(
        "file:/tmp/secret",
      ),
    ).rejects.toThrow(
      "unsupported secret reference",
    );
  });
});
