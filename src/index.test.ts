import { beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../index.js";
import { loadConfig } from "./config.js";
import { dispatch } from "./notify.js";
import { detectTerminal } from "./terminal.js";
import { ensureAumidRegistered } from "./win-aumid.js";

vi.mock("./config.js", () => ({
  loadConfig: vi.fn(() => ({ enabled: false })),
}));
vi.mock("./notify.js", () => ({ dispatch: vi.fn(async () => {}) }));
vi.mock("./terminal.js", () => ({ detectTerminal: vi.fn(() => null) }));
vi.mock("./win-aumid.js", () => ({ ensureAumidRegistered: vi.fn(() => {}) }));

describe("server compatibility entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not load config, register notifications, or subscribe on the server", async () => {
    const subscribe = vi.fn();
    await plugin.setup({
      location: { directory: "D:/server" },
      event: { subscribe },
    });
    expect(loadConfig).not.toHaveBeenCalled();
    expect(ensureAumidRegistered).not.toHaveBeenCalled();
    expect(detectTerminal).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
