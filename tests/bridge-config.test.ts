import {
  describe,
  expect,
  it,
} from "vitest";
import {
  loadRemoteBridgeConfig,
} from "../src/bridge/config.js";

describe("remote bridge config", () => {
  it("accepts HTTPS and keeps the bearer token out of the URL", () => {
    const config =
      loadRemoteBridgeConfig({
        MCP_REMOTE_URL:
          "https://mcp.example.com/mcp",
        MCP_BRIDGE_TOKEN:
          "short-lived-token",
      });

    expect(
      config.remoteUrl.href,
    ).toBe(
      "https://mcp.example.com/mcp",
    );
    expect(config.token).toBe(
      "short-lived-token",
    );
    expect(
      config.remoteUrl.username,
    ).toBe("");
  });

  it("allows HTTP only for loopback development", () => {
    expect(
      loadRemoteBridgeConfig({
        MCP_REMOTE_URL:
          "http://127.0.0.1:3000/mcp",
      }).remoteUrl.protocol,
    ).toBe("http:");

    expect(() =>
      loadRemoteBridgeConfig({
        MCP_REMOTE_URL:
          "http://mcp.example.com/mcp",
      }),
    ).toThrow(/HTTPS/u);
  });

  it("rejects credentials embedded in the remote URL", () => {
    expect(() =>
      loadRemoteBridgeConfig({
        MCP_REMOTE_URL:
          "https://user:password@mcp.example.com/mcp",
      }),
    ).toThrow(
      /must not contain credentials/u,
    );
  });
});
