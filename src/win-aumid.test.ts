import { type ChildProcess, execFile, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

const platform = process.platform;
const key = "HKCU\\Software\\Classes\\AppUserModelId\\OpenCode";
let outcomes: (Error | null)[];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  Object.defineProperty(process, "platform", { value: "win32" });
  outcomes = [];
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(execFile).mockImplementation((...args) => {
    const complete = args.at(-1) as (error: Error | null) => void;
    const outcome = outcomes.shift() ?? null;
    queueMicrotask(() => complete(outcome));
    return {} as ChildProcess;
  });
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
});

describe("ensureAumidRegistered", () => {
  it("queries an existing registration once for concurrent and later notifications", async () => {
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await Promise.all([ensureAumidRegistered(), ensureAumidRegistered()]);
    await ensureAumidRegistered();

    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith(
      "reg",
      ["query", key, "/v", "DisplayName"],
      { timeout: 3000, windowsHide: true },
      expect.any(Function),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("registers the name and existing icon after a missing registry entry", async () => {
    outcomes = [new Error("Entry not found"), null, null, null];
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await expect(ensureAumidRegistered()).resolves.toBeUndefined();

    expect(execFile).toHaveBeenCalledTimes(4);
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      "reg",
      ["add", key, "/ve", "/d", "OpenCode", "/f"],
      { timeout: 5000, windowsHide: true },
      expect.any(Function),
    );
    expect(execFile).toHaveBeenNthCalledWith(
      3,
      "reg",
      [
        "add",
        key,
        "/v",
        "DisplayName",
        "/t",
        "REG_EXPAND_SZ",
        "/d",
        "OpenCode",
        "/f",
      ],
      { timeout: 5000, windowsHide: true },
      expect.any(Function),
    );
    expect(execFile).toHaveBeenNthCalledWith(
      4,
      "reg",
      [
        "add",
        key,
        "/v",
        "IconUri",
        "/t",
        "REG_EXPAND_SZ",
        "/d",
        expect.stringMatching(/[/\\]icon\.png$/),
        "/f",
      ],
      { timeout: 5000, windowsHide: true },
      expect.any(Function),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("does not register an icon that is absent", async () => {
    outcomes = [new Error("Entry not found"), null, null];
    vi.mocked(existsSync).mockReturnValue(false);
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await ensureAumidRegistered();

    expect(execFile).toHaveBeenCalledTimes(3);
  });

  it.each(["darwin", "linux"])("does nothing on %s", async (platform) => {
    Object.defineProperty(process, "platform", { value: platform });
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await expect(ensureAumidRegistered()).resolves.toBeUndefined();

    expect(execFile).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("swallows registration errors and does not retry them on every alert", async () => {
    outcomes = [new Error("Entry not found"), new Error("Access denied")];
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await expect(ensureAumidRegistered()).resolves.toBeUndefined();
    await expect(ensureAumidRegistered()).resolves.toBeUndefined();

    expect(execFile).toHaveBeenCalledTimes(2);
  });

  it("swallows synchronous launch errors", async () => {
    vi.mocked(execFile).mockImplementation(() => {
      throw new Error("reg is unavailable");
    });
    const { ensureAumidRegistered } = await import("./win-aumid.js");

    await expect(ensureAumidRegistered()).resolves.toBeUndefined();

    expect(execFile).toHaveBeenCalledTimes(2);
  });
});
