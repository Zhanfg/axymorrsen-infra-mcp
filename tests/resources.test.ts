import {
  describe,
  expect,
  it,
} from "vitest";
import {
  isValidResourcePattern,
  resourceMatches,
  resourcesAllowed,
} from "../src/core/resources.js";

describe("resource authorization", () => {
  it("matches exact resources", () => {
    expect(
      resourceMatches(
        "github:repo:example/project",
        "github:repo:example/project",
      ),
    ).toBe(true);

    expect(
      resourceMatches(
        "github:repo:example/project",
        "github:repo:example/other",
      ),
    ).toBe(false);
  });

  it("supports suffix wildcard prefixes only", () => {
    expect(
      resourceMatches(
        "github:repo:example/*",
        "github:repo:example/project",
      ),
    ).toBe(true);

    expect(
      isValidResourcePattern(
        "github:*:example",
      ),
    ).toBe(false);
  });

  it("requires every requested resource to be authorized", () => {
    expect(
      resourcesAllowed(
        [
          "github:repo:example/*",
          "cloudflare:zone:abc",
        ],
        [
          "github:repo:example/a",
          "cloudflare:zone:abc",
        ],
      ),
    ).toBe(true);

    expect(
      resourcesAllowed(
        ["github:repo:example/*"],
        [
          "github:repo:example/a",
          "github:repo:other/b",
        ],
      ),
    ).toBe(false);
  });
});
