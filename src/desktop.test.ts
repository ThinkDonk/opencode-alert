import {
  type ChildProcess,
  execFile,
  execSync,
  spawn,
  spawnSync,
} from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDesktopNotification, sendWindowsToast } from "./desktop.js";
import { ensureAumidRegistered } from "./win-aumid.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("./win-aumid.js", () => ({
  ensureAumidRegistered: vi.fn(),
}));

const platform = process.platform;
let completions: ((error: Error | null) => void)[];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ensureAumidRegistered).mockResolvedValue(undefined);
  completions = [];
  vi.mocked(execFile).mockImplementation((...args) => {
    completions.push(args.at(-1) as (error: Error | null) => void);
    return {} as ChildProcess;
  });
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
});

describe("sendWindowsToast", () => {
  it("returns a pending promise until the asynchronous toast succeeds", async () => {
    const settled = vi.fn();
    const pending = sendWindowsToast("Done", "Finished").then(settled);

    expect(ensureAumidRegistered).toHaveBeenCalledTimes(1);
    expect(execFile).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        expect.stringContaining("CreateToastNotifier('OpenCode').Show($toast)"),
      ],
      { timeout: 10000, windowsHide: true },
      expect.any(Function),
    );

    completions[0](null);
    await pending;
    expect(settled).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it("starts exactly one fallback after a toast failure and awaits it", async () => {
    const settled = vi.fn();
    const pending = sendWindowsToast("Done", "Finished").then(settled);

    await Promise.resolve();
    completions[0](new Error("Toast unavailable"));
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        expect.stringContaining("$n.ShowBalloonTip(5000)"),
      ],
      { timeout: 10000, windowsHide: true },
      expect.any(Function),
    );

    completions[1](null);
    await pending;
    expect(settled).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  it("swallows fallback process failures", async () => {
    const pending = sendWindowsToast("Done", "Finished");
    await Promise.resolve();
    completions[0](new Error("Toast process timed out"));
    await Promise.resolve();
    completions[1](new Error("Balloon process failed"));

    await expect(pending).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  it("does not launch a process when the TUI has already closed", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendWindowsToast("Done", "Finished", controller.signal),
    ).resolves.toBeUndefined();
    expect(ensureAumidRegistered).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("does not start PowerShell if the TUI closes while registration is pending", async () => {
    let finishRegistration = () => {};
    vi.mocked(ensureAumidRegistered).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRegistration = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = sendWindowsToast("Done", "Finished", controller.signal);

    expect(execFile).not.toHaveBeenCalled();
    controller.abort();
    finishRegistration();

    await expect(pending).resolves.toBeUndefined();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("passes cancellation to the process and skips fallback when the TUI closes", async () => {
    const controller = new AbortController();
    const pending = sendWindowsToast("Done", "Finished", controller.signal);
    await Promise.resolve();
    expect(execFile).toHaveBeenCalledWith(
      "powershell",
      expect.any(Array),
      {
        timeout: 10000,
        windowsHide: true,
        signal: controller.signal,
      },
      expect.any(Function),
    );

    controller.abort();
    completions[0](new Error("Toast process aborted"));

    await expect(pending).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it("swallows synchronous launch failures and tries the fallback once", async () => {
    vi.mocked(execFile).mockImplementation(() => {
      throw new Error("Cannot launch PowerShell");
    });

    await expect(sendWindowsToast("Done", "Finished")).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(execSync).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("preserves literal escaping and the OpenCode AUMID for both backends", async () => {
    const pending = sendWindowsToast("User's task", "It's <finished>");
    await Promise.resolve();
    completions[0](new Error("Toast unavailable"));
    await Promise.resolve();

    for (const call of vi.mocked(execFile).mock.calls) {
      const args = call[1] as string[];
      const script = args.at(-1);
      expect(script).toContain("User''s task");
      expect(script).toContain("It''s finished");
      expect(script).toContain(
        "SetCurrentProcessExplicitAppUserModelID('OpenCode')",
      );
      expect(script).toContain("$ErrorActionPreference = 'Stop'");
    }

    completions[1](null);
    await pending;
  });
});

describe("sendDesktopNotification", () => {
  it.each(["darwin", "linux", "win32"])(
    "handles asynchronous process errors on %s without keeping the process alive",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
      vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

      await expect(
        sendDesktopNotification("Done", "Finished"),
      ).resolves.toBeUndefined();
      expect(() =>
        child.emit("error", new Error("Command unavailable")),
      ).not.toThrow();
      expect(child.unref).toHaveBeenCalledTimes(1);
    },
  );
});
