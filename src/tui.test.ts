import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import tui from "../tui.js";
import { type AlertConfig, loadConfig } from "./config.js";
import { sendDesktopNotification, sendWindowsToast } from "./desktop.js";
import { playSound } from "./sound.js";
import { detectTerminal, isTerminalFocused } from "./terminal.js";
import { ensureAumidRegistered } from "./win-aumid.js";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(actual.tmpdir(), "opencode-alert-tui-test-"));
  return { ...actual, homedir: () => home };
});
vi.mock("./config.js", () => ({ loadConfig: vi.fn() }));
vi.mock("./desktop.js", () => ({
  sendDesktopNotification: vi.fn(async () => {}),
  sendWindowsToast: vi.fn(async () => {}),
}));
vi.mock("./sound.js", () => ({ playSound: vi.fn(async () => {}) }));
vi.mock("./terminal.js", () => ({
  detectTerminal: vi.fn(),
  isTerminalFocused: vi.fn(() => true),
}));
vi.mock("./win-aumid.js", () => ({ ensureAumidRegistered: vi.fn() }));

type Event = { id: string; type: string; data: Record<string, unknown> };
type Session = {
  title?: string;
  parentID?: string;
  location?: { directory: string };
};
let sequence = 0;
let config: AlertConfig;
const cleanups: (() => void)[] = [];
const notifications = () => [
  ...vi.mocked(sendWindowsToast).mock.calls,
  ...vi.mocked(sendDesktopNotification).mock.calls,
];

function event(
  sessionID: string,
  type = "session.execution.succeeded",
  data: Record<string, unknown> = {},
): Event {
  return { id: `evt_tui_${++sequence}`, type, data: { sessionID, ...data } };
}

function windowFor(
  ids: string[],
  options: { tabs?: boolean; location?: string } = {},
) {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const sessions = new Map<string, Session>(
    ids.map((id) => [id, { title: id, location: { directory: `D:/${id}` } }]),
  );
  const state = {
    ids: [...ids],
    tabs: options.tabs ?? true,
    route: { type: "session", sessionID: ids[0] } as {
      type: string;
      sessionID?: string;
    },
  };
  const renderer = Object.assign(new EventEmitter(), {
    isDestroyed: false,
    triggerNotification: vi.fn(),
  });
  const root = (id: string): string => {
    const parent = sessions.get(id)?.parentID;
    return parent ? root(parent) : id;
  };
  const context = {
    ...(options.location ? { location: { directory: options.location } } : {}),
    data: {
      on: vi.fn((type: string, handle: (event: Event) => void) => {
        const handlers = listeners.get(type) ?? new Set();
        handlers.add(handle);
        listeners.set(type, handlers);
        return () => {
          handlers.delete(handle);
        };
      }),
      session: { get: vi.fn((id: string) => sessions.get(id)), root },
      location: { default: () => ({ directory: "D:/default" }) },
    },
    ui: {
      tabs: {
        enabled: () => state.tabs,
        list: () => state.ids.map((sessionID) => ({ sessionID })),
      },
      router: { current: () => state.route },
    },
    renderer,
  };
  const originalNotification = renderer.triggerNotification;
  const cleanup = tui.setup(context);
  cleanups.push(cleanup);
  return {
    state,
    sessions,
    renderer,
    context,
    cleanup,
    originalNotification,
    async emit(value: Event) {
      for (const handle of listeners.get(value.type) ?? []) handle(value);
      await vi.advanceTimersByTimeAsync(0);
    },
    listenerCount: () =>
      [...listeners.values()].reduce((count, set) => count + set.size, 0),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + ++sequence * 60000);
  config = {
    enabled: true,
    desktop: {
      enabled: true,
      events: ["idle", "error", "permission", "question"],
    },
    sound: { enabled: false, events: {}, default: "", customDir: "" },
    filter: {
      quietHours: { enabled: false, start: "22:00", end: "08:00" },
      minInterval: 0,
    },
    suppressWhenFocused: false,
    notifyOnIdle: true,
    delayMs: {},
    notifyChildSessions: true,
    soundCommand: null,
  };
  vi.mocked(loadConfig).mockReturnValue(config);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

describe("TUI notification scope", () => {
  it("notifies all open tabs including inactive tabs and ignores other sessions before config IO", async () => {
    const window = windowFor(["active", "inactive"]);
    await window.emit(event("foreign"));
    expect(loadConfig).not.toHaveBeenCalled();
    expect(notifications()).toHaveLength(0);
    await window.emit(event("inactive"));
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0][1]).toBe("inactive");
    await window.emit(event("active"));
    expect(notifications()).toHaveLength(2);
  });

  it("routes different sessions to their own windows", async () => {
    const first = windowFor(["first"]);
    const second = windowFor(["second"]);
    const firstEvent = event("first");
    await first.emit(firstEvent);
    await second.emit(firstEvent);
    const secondEvent = event("second");
    await first.emit(secondEvent);
    await second.emit(secondEvent);
    expect(notifications().map((call) => call[1])).toEqual(["first", "second"]);
  });

  it("notifies a shared event only once across two TUI instances", async () => {
    const first = windowFor(["shared"]);
    const second = windowFor(["shared"]);
    const value = event("shared");
    await Promise.all([first.emit(value), second.emit(value)]);
    expect(notifications()).toHaveLength(1);
  });

  it("uses only the current session route when tabs are disabled", async () => {
    const window = windowFor(["current", "hidden"], { tabs: false });
    await window.emit(event("hidden"));
    expect(notifications()).toHaveLength(0);
    await window.emit(event("current"));
    expect(notifications()).toHaveLength(1);
    window.state.route = { type: "home" };
    await window.emit(event("current"));
    window.state.route = { type: "plugin" };
    await window.emit(event("current"));
    expect(notifications()).toHaveLength(1);
  });

  it.each(["closed tab", "left session route", "destroyed renderer"])(
    "suppresses delayed notifications after %s",
    async (mode) => {
      config.delayMs.idle = 1000;
      const window = windowFor(["pending"], {
        tabs: mode !== "left session route",
      });
      await window.emit(event("pending"));
      if (mode === "closed tab") window.state.ids = [];
      if (mode === "left session route") window.state.route = { type: "home" };
      if (mode === "destroyed renderer") window.renderer.isDestroyed = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(notifications()).toHaveLength(0);
    },
  );

  it("unsubscribes, removes focus listeners, and cancels delays on cleanup", async () => {
    config.delayMs.idle = 1000;
    const window = windowFor(["cleanup"]);
    await window.emit(event("cleanup"));
    window.cleanup();
    expect(window.listenerCount()).toBe(0);
    expect(window.renderer.listenerCount("focus")).toBe(0);
    expect(window.renderer.listenerCount("blur")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await window.emit(event("cleanup"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(notifications()).toHaveLength(0);
  });

  it("allows family permission and question alerts while filtering child completion", async () => {
    const window = windowFor(["family"]);
    window.sessions.set("child", {
      parentID: "family",
      title: "Child",
      location: { directory: "D:/family" },
    });
    await window.emit(event("child"));
    expect(notifications()).toHaveLength(0);
    await window.emit(event("family"));
    await window.emit(event("child", "permission.asked", { action: "edit" }));
    await window.emit(
      event("unused", "form.created", {
        form: { sessionID: "child", title: "Choice" },
      }),
    );
    expect(notifications().map((call) => call[0])).toEqual([
      "✅ Task Completed",
      "🔑 Permission Required",
      "❓ Question",
    ]);
  });

  it("filters unopened sessions before recording tool names", async () => {
    config.desktop.events = ["subagent"];
    const window = windowFor(["tools"]);
    window.sessions.set("foreign_child", { parentID: "foreign_root" });
    await window.emit(
      event("foreign_child", "session.tool.input.started", {
        id: "call_foreign",
        name: "task",
      }),
    );
    window.state.ids.push("foreign_root");
    await window.emit(
      event("foreign_child", "session.tool.success", { id: "call_foreign" }),
    );
    expect(notifications()).toHaveLength(0);
  });

  it("uses renderer focus independently per TUI and never modifies native notifications", async () => {
    config.suppressWhenFocused = true;
    const first = windowFor(["focus"]);
    const second = windowFor(["focus"]);
    first.renderer.emit("focus");
    second.renderer.emit("blur");
    const value = event("focus");
    await first.emit(value);
    expect(notifications()).toHaveLength(0);
    await second.emit(value);
    expect(notifications()).toHaveLength(1);
    expect(first.renderer.triggerNotification).toBe(first.originalNotification);
    expect(first.renderer.triggerNotification).not.toHaveBeenCalled();
    expect(isTerminalFocused).not.toHaveBeenCalled();
    expect(detectTerminal).not.toHaveBeenCalled();
  });

  it("allows unknown initial focus and rechecks focus before a delayed send", async () => {
    config.suppressWhenFocused = true;
    const window = windowFor(["initial_focus"]);
    await window.emit(event("initial_focus"));
    expect(notifications()).toHaveLength(1);
    config.delayMs.idle = 1000;
    window.renderer.emit("blur");
    await window.emit(event("initial_focus"));
    window.renderer.emit("focus");
    await vi.advanceTimersByTimeAsync(1000);
    expect(notifications()).toHaveLength(1);
  });

  it("loads project configuration by session directory and caches it for the plugin lifetime", async () => {
    const window = windowFor(["project_a", "project_b"], {
      location: "D:/tui",
    });
    await window.emit(event("project_a"));
    await window.emit(event("project_a"));
    await window.emit(event("project_b"));
    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(loadConfig).toHaveBeenNthCalledWith(1, "D:/project_a");
    expect(loadConfig).toHaveBeenNthCalledWith(2, "D:/project_b");
  });

  it.each(["D:/tui", undefined])(
    "falls back to the TUI or default location %s without session metadata",
    async (location) => {
      const window = windowFor(["uncached"], { location });
      window.sessions.delete("uncached");
      await window.emit(event("uncached"));
      expect(loadConfig).toHaveBeenCalledWith(location ?? "D:/default");
      expect(notifications()).toHaveLength(1);
    },
  );

  it("keeps desktop and sound switches independent", async () => {
    config.desktop.enabled = false;
    config.sound.enabled = true;
    const window = windowFor(["sound_only"]);
    await window.emit(event("sound_only"));
    expect(notifications()).toHaveLength(0);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(ensureAumidRegistered).not.toHaveBeenCalled();
  });
});
