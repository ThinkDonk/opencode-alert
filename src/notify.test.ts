import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertConfig } from "./config.js";
import { sendDesktopNotification, sendWindowsToast } from "./desktop.js";
import { dispatch, resetToolCallMap, toAlertEvent } from "./notify.js";
import { playSound } from "./sound.js";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const home = mkdtempSync(join(actual.tmpdir(), "opencode-alert-test-"));
  return { ...actual, homedir: () => home };
});

vi.mock("./desktop.js", () => ({
  sendDesktopNotification: vi.fn(async () => {}),
  sendWindowsToast: vi.fn(() => {}),
}));

vi.mock("./sound.js", () => ({
  playSound: vi.fn(async () => {}),
}));

function inputStarted(id: string, name: string) {
  return {
    id: `evt_in_${id}`,
    type: "session.tool.input.started",
    data: { sessionID: "ses_123", id, name },
  };
}

function toolSuccess(id: string, content?: unknown) {
  return {
    id: `evt_out_${id}`,
    type: "session.tool.success",
    data: {
      sessionID: "ses_123",
      id,
      ...(content !== undefined ? { content } : {}),
    },
  };
}

describe("toAlertEvent - tool flow", () => {
  beforeEach(() => {
    resetToolCallMap();
  });

  it("input.started alone returns null", () => {
    expect(toAlertEvent(inputStarted("call_1", "task"))).toBeNull();
  });

  it("input.started(task) then success maps to subagent", () => {
    toAlertEvent(inputStarted("call_1", "task"));
    expect(toAlertEvent(toolSuccess("call_1"))).toMatchObject({
      type: "subagent",
      sessionID: "ses_123",
      message: "Subagent completed",
    });
  });

  it("string content becomes the subagent message", () => {
    toAlertEvent(inputStarted("call_1", "task"));
    expect(
      toAlertEvent(toolSuccess("call_1", "Subagent finished successfully")),
    ).toMatchObject({
      type: "subagent",
      message: "Subagent finished successfully",
    });
  });

  it("non-string content falls back to default message", () => {
    toAlertEvent(inputStarted("call_1", "task"));
    expect(
      toAlertEvent(toolSuccess("call_1", { text: "structured" })),
    ).toMatchObject({ type: "subagent", message: "Subagent completed" });
  });

  it("input.started for other tools yields null on success", () => {
    toAlertEvent(inputStarted("call_1", "bash"));
    expect(toAlertEvent(toolSuccess("call_1"))).toBeNull();
  });

  it("success without prior input.started returns null", () => {
    expect(toAlertEvent(toolSuccess("call_unknown"))).toBeNull();
  });

  it("success consumes the recorded call only once", () => {
    toAlertEvent(inputStarted("call_1", "task"));
    expect(toAlertEvent(toolSuccess("call_1"))).not.toBeNull();
    expect(toAlertEvent(toolSuccess("call_1"))).toBeNull();
  });

  it("malformed input.started records are ignored", () => {
    expect(
      toAlertEvent({
        id: "evt_bad",
        type: "session.tool.input.started",
        data: { sessionID: "ses_123", id: 42, name: "task" },
      }),
    ).toBeNull();
    expect(toAlertEvent(toolSuccess("42"))).toBeNull();
  });

  it("evicts oldest entries beyond the 500 cap (FIFO)", () => {
    for (let i = 0; i < 500; i++) {
      toAlertEvent(inputStarted(`old-${i}`, "task"));
    }
    toAlertEvent(inputStarted("fresh", "task"));
    expect(toAlertEvent(toolSuccess("old-0"))).toBeNull();
    expect(toAlertEvent(toolSuccess("old-1"))).toMatchObject({
      type: "subagent",
    });
    expect(toAlertEvent(toolSuccess("fresh"))).toMatchObject({
      type: "subagent",
    });
  });
});

function makeConfig(): AlertConfig {
  return {
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
}

function executionEvent(
  sessionID: string,
  location?: { directory: string; workspaceID?: string },
) {
  return {
    id: `evt_${sessionID}`,
    type: "session.execution.succeeded",
    ...(location ? { location } : {}),
    data: { sessionID },
  };
}

describe("dispatch - location self-filter", () => {
  const notified = () =>
    vi.mocked(sendWindowsToast).mock.calls.length +
      vi.mocked(sendDesktopNotification).mock.calls.length >
    0;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes events matching own directory and workspaceID", async () => {
    await dispatch(
      executionEvent("ses_match", {
        directory: "D:/proj",
        workspaceID: "ws_1",
      }),
      makeConfig(),
      { location: { directory: "D:/proj", workspaceID: "ws_1" } },
      null,
    );
    expect(notified()).toBe(true);
  });

  it("skips events from a different directory", async () => {
    await dispatch(
      executionEvent("ses_other_dir", { directory: "D:/other" }),
      makeConfig(),
      { location: { directory: "D:/proj" } },
      null,
    );
    expect(notified()).toBe(false);
  });

  it("skips events with a conflicting workspaceID", async () => {
    await dispatch(
      executionEvent("ses_ws_conflict", {
        directory: "D:/proj",
        workspaceID: "ws_2",
      }),
      makeConfig(),
      { location: { directory: "D:/proj", workspaceID: "ws_1" } },
      null,
    );
    expect(notified()).toBe(false);
  });

  it("skips events carrying a workspaceID when own location has none", async () => {
    await dispatch(
      executionEvent("ses_ws_one_sided", {
        directory: "D:/proj",
        workspaceID: "ws_1",
      }),
      makeConfig(),
      { location: { directory: "D:/proj" } },
      null,
    );
    expect(notified()).toBe(false);
  });

  it("resolves events without a location envelope from the session", async () => {
    const get = vi.fn(async () => ({
      title: "Owned session",
      location: { directory: "D:/proj" },
    }));
    await dispatch(
      executionEvent("ses_no_loc"),
      makeConfig(),
      { location: { directory: "D:/proj" }, session: { get } },
      null,
    );
    expect(notified()).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("processes everything when ctx has no location", async () => {
    await dispatch(
      executionEvent("ses_ctx_no_loc", { directory: "D:/other" }),
      makeConfig(),
      {},
      null,
    );
    expect(notified()).toBe(true);
  });
});

describe("dispatch - duplicate notification regressions", () => {
  const notificationCount = () =>
    vi.mocked(sendWindowsToast).mock.calls.length +
    vi.mocked(sendDesktopNotification).mock.calls.length;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only the owning location notifies for a locationless global event", async () => {
    const event = executionEvent("ses_global_owned");
    const get = vi.fn(async () => ({
      title: "Owned task",
      location: { directory: "D:/owner", workspaceID: "ws_owner" },
    }));
    await Promise.all(
      [
        { directory: "D:/other" },
        { directory: "D:/owner", workspaceID: "ws_other" },
      ].map((location) =>
        dispatch(event, makeConfig(), { location, session: { get } }, null),
      ),
    );
    expect(notificationCount()).toBe(0);
    await dispatch(
      event,
      makeConfig(),
      {
        location: { directory: "D:/owner", workspaceID: "ws_owner" },
        session: { get },
      },
      null,
    );
    expect(notificationCount()).toBe(1);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it.each(["unavailable", "missing location", "no session API"])(
    "does not broadcast a locationless event when session ownership is %s",
    async (mode) => {
      const get = vi.fn(async () => {
        if (mode === "unavailable") throw new Error("session unavailable");
        return { title: "Unknown ownership" };
      });
      await dispatch(
        executionEvent(`ses_unowned_${mode}`),
        makeConfig(),
        {
          location: { directory: "D:/proj" },
          ...(mode === "no session API" ? {} : { session: { get } }),
        },
        null,
      );
      expect(notificationCount()).toBe(0);
    },
  );

  it.each([0, 5])(
    "deduplicates event IDs with a %s-second throttle",
    async (minInterval) => {
      const event = executionEvent(`ses_replayed_${minInterval}`);
      const config = makeConfig();
      config.filter.minInterval = minInterval;
      await dispatch(event, config, {}, null);
      await vi.advanceTimersByTimeAsync(6000);
      await dispatch(event, config, {}, null);
      expect(notificationCount()).toBe(1);
      await dispatch(
        { ...event, id: `evt_next_turn_${minInterval}` },
        config,
        {},
        null,
      );
      expect(notificationCount()).toBe(2);
    },
  );

  it("notifies only the parent when a task and multiple child sessions complete", async () => {
    const location = { directory: "D:/parent_task" };
    const get = vi.fn(async ({ sessionID }: { sessionID: string }) => ({
      location,
      title: sessionID,
      ...(sessionID === "ses_parent" ? {} : { parentID: "ses_parent" }),
    }));
    const ctx = { location, session: { get } };
    await Promise.all(
      ["ses_child_1", "ses_child_2", "ses_parent"].map((id) =>
        dispatch(executionEvent(id), makeConfig(), ctx, null),
      ),
    );
    expect(notificationCount()).toBe(1);
    const messages = [
      ...vi.mocked(sendWindowsToast).mock.calls,
      ...vi.mocked(sendDesktopNotification).mock.calls,
    ];
    expect(messages[0][1]).toBe("ses_parent");
  });

  it.each([
    "session.execution.failed",
    "session.execution.interrupted",
    "permission.asked",
    "form.created",
  ])("checks session ownership for locationless %s events", async (type) => {
    const config = makeConfig();
    config.desktop.events = [
      "idle",
      "error",
      "cancel",
      "permission",
      "question",
    ];
    const sessionID = `ses_foreign_${type}`;
    await dispatch(
      {
        id: `evt_foreign_${type}`,
        type,
        data: {
          sessionID,
          reason: "user",
          form: { sessionID, title: "Question" },
        },
      },
      config,
      {
        location: { directory: "D:/here" },
        session: {
          get: async () => ({ location: { directory: "D:/elsewhere" } }),
        },
      },
      null,
    );
    expect(notificationCount()).toBe(0);
  });

  it("claims a shared event only once across separately loaded modules", async () => {
    const event = executionEvent("ses_module_reload");
    vi.resetModules();
    const other = await import("./notify.js");
    await Promise.all([
      dispatch(event, makeConfig(), {}, null),
      other.dispatch(event, makeConfig(), {}, null),
    ]);
    expect(notificationCount()).toBe(1);
  });

  it("keeps events without IDs compatible", async () => {
    const { id: _id, ...event } = executionEvent("ses_missing_id");
    await dispatch(event, makeConfig(), {}, null);
    await dispatch(event, makeConfig(), {}, null);
    expect(notificationCount()).toBe(2);
  });

  it("does not claim events filtered by location", async () => {
    const event = executionEvent("ses_filtered_owner", {
      directory: "D:/owner",
    });
    await dispatch(
      event,
      makeConfig(),
      { location: { directory: "D:/other" } },
      null,
    );
    await dispatch(
      event,
      makeConfig(),
      { location: { directory: "D:/owner" } },
      null,
    );
    expect(notificationCount()).toBe(1);
  });

  it("cancels delayed notifications without consuming the event", async () => {
    const event = executionEvent("ses_delayed_cleanup");
    const controller = new AbortController();
    const config = makeConfig();
    config.delayMs.idle = 1500;
    await dispatch(event, config, {}, null, controller.signal);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1500);
    expect(notificationCount()).toBe(0);
    await dispatch(event, makeConfig(), {}, null);
    expect(notificationCount()).toBe(1);
  });

  it("stops an in-flight session lookup after cleanup", async () => {
    let resolveSession: (value: { title: string }) => void = () => {};
    const get = vi.fn(
      () =>
        new Promise<{ title: string }>((resolve) => {
          resolveSession = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = dispatch(
      executionEvent("ses_cancel_lookup"),
      makeConfig(),
      { session: { get } },
      null,
      controller.signal,
    );
    controller.abort();
    resolveSession({ title: "Finished after cleanup" });
    await pending;
    expect(notificationCount()).toBe(0);
  });

  it.each(["disabled", "excluded"])(
    "honors %s desktop notifications while keeping sound independent",
    async (mode) => {
      const config = makeConfig();
      config.desktop.enabled = mode !== "disabled";
      config.desktop.events = mode === "excluded" ? ["error"] : ["idle"];
      config.sound.enabled = true;
      await dispatch(executionEvent(`ses_desktop_${mode}`), config, {}, null);
      expect(notificationCount()).toBe(0);
      expect(playSound).toHaveBeenCalledTimes(1);
    },
  );

  it("does not claim events with all notification channels disabled", async () => {
    const event = executionEvent("ses_disabled_channels");
    const config = makeConfig();
    config.desktop.enabled = false;
    await dispatch(event, config, {}, null);
    expect(notificationCount()).toBe(0);
    await dispatch(event, makeConfig(), {}, null);
    expect(notificationCount()).toBe(1);
  });

  it("checks TUI scope before associating a tool call", async () => {
    resetToolCallMap();
    await dispatch(
      inputStarted("foreign_tool", "task"),
      makeConfig(),
      {
        shouldNotify: () => false,
      },
      null,
    );
    expect(toAlertEvent(toolSuccess("foreign_tool"))).toBeNull();
  });

  it("rechecks TUI scope at send time without consuming a closed tab's event", async () => {
    const event = executionEvent("ses_scope_delay");
    const config = makeConfig();
    config.delayMs.idle = 1000;
    let open = true;
    await dispatch(event, config, { shouldNotify: () => open }, null);
    open = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(notificationCount()).toBe(0);
    await dispatch(event, makeConfig(), { shouldNotify: () => true }, null);
    expect(notificationCount()).toBe(1);
  });

  it("uses the TUI focus callback at send time", async () => {
    const event = executionEvent("ses_tui_focus_delay");
    const config = makeConfig();
    config.suppressWhenFocused = true;
    config.delayMs.idle = 1000;
    let focused = false;
    await dispatch(event, config, { isFocused: () => focused }, null);
    focused = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(notificationCount()).toBe(0);
    focused = false;
    await dispatch(
      event,
      { ...config, delayMs: {} },
      { isFocused: () => focused },
      null,
    );
    expect(notificationCount()).toBe(1);
  });
});
