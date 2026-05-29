import { describe, expect, it } from "vitest";
import { toAlertEvent } from "./notify.js";

describe("toAlertEvent - cancel events", () => {
  it("message.updated with MessageAbortedError -> cancel", () => {
    const raw = {
      type: "message.updated",
      sessionID: "abc",
      properties: {
        error: { name: "MessageAbortedError" },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({
      type: "cancel",
      message: "Message cancelled",
      sessionID: "abc",
    });
  });

  it("message.updated without MessageAbortedError -> null", () => {
    const raw = {
      type: "message.updated",
      sessionID: "abc",
      properties: {
        error: { name: "SomeOtherError" },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toBeNull();
  });

  it("message.updated without error -> null", () => {
    const raw = {
      type: "message.updated",
      sessionID: "abc",
    };
    const result = toAlertEvent(raw);
    expect(result).toBeNull();
  });
});

describe("toAlertEvent - subagent events", () => {
  it("message.part.updated with task tool completed -> subagent", () => {
    const raw = {
      type: "message.part.updated",
      sessionID: "abc",
      properties: {
        part: {
          tool: { name: "task" },
          state: { status: "completed" },
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({
      type: "subagent",
      message: "Subagent completed",
      sessionID: "abc",
    });
  });

  it("message.part.updated with task tool completed and content", () => {
    const raw = {
      type: "message.part.updated",
      sessionID: "abc",
      properties: {
        part: {
          tool: { name: "task" },
          state: { status: "completed" },
          content: "Subagent finished successfully",
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({
      type: "subagent",
      message: "Subagent finished successfully",
      sessionID: "abc",
    });
  });

  it("message.part.updated with non-task tool -> null", () => {
    const raw = {
      type: "message.part.updated",
      sessionID: "abc",
      properties: {
        part: {
          tool: { name: "bash" },
          state: { status: "completed" },
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toBeNull();
  });

  it("message.part.updated with task tool not completed -> null", () => {
    const raw = {
      type: "message.part.updated",
      sessionID: "abc",
      properties: {
        part: {
          tool: { name: "task" },
          state: { status: "running" },
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toBeNull();
  });

  it("message.part.updated without tool -> null", () => {
    const raw = {
      type: "message.part.updated",
      sessionID: "abc",
      properties: {
        part: {
          state: { status: "completed" },
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toBeNull();
  });
});
