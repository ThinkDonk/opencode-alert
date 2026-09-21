import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertConfig } from "./config.js";
import { sendDesktopNotification, sendWindowsToast } from "./desktop.js";
import { dispatch, resetToolCallMap, toAlertEvent } from "./notify.js";

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
    id: "evt_loc",
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

  it("processes events without a location envelope", async () => {
    await dispatch(
      executionEvent("ses_no_loc"),
      makeConfig(),
      { location: { directory: "D:/proj" } },
      null,
    );
    expect(notified()).toBe(true);
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
