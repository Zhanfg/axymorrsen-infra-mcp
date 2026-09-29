import { describe, expect, it } from "vitest";
import { parseScopes } from "../src/auth/jwt-verifier.js";

describe("parseScopes", () => {
  it("normalizes OAuth scope and scp claims without duplicates", () => {
    expect(
      parseScopes({
        scope: "mcp github:read",
        scp: ["github:read", "cloudflare:dns:read"],
      }),
    ).toEqual(["mcp", "github:read", "cloudflare:dns:read"]);
  });

  it("ignores malformed scope values", () => {
    expect(parseScopes({ scope: 42, scp: [null, "mcp", 7] })).toEqual(["mcp"]);
  });
});
