import { beforeEach, describe, expect, it } from "vitest";
import { resetToolCallMap, toAlertEvent } from "./notify.js";

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
