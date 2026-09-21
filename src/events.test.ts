import { describe, expect, it } from "vitest";
import { toAlertEvent } from "./notify.js";

describe("toAlertEvent - invalid inputs", () => {
  it("returns null for null input", () => {
    expect(toAlertEvent(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toAlertEvent(undefined)).toBeNull();
  });

  it("returns null for unknown event type", () => {
    expect(
      toAlertEvent({
        id: "evt_1",
        type: "unknown.event",
        data: { sessionID: "abc" },
      }),
    ).toBeNull();
  });

  it("returns null for event without type", () => {
    expect(
      toAlertEvent({ id: "evt_1", data: { sessionID: "abc" } }),
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(toAlertEvent("session.execution.succeeded")).toBeNull();
  });
});

describe("toAlertEvent - session.execution.succeeded", () => {
  it("maps to idle with default message", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.succeeded",
      data: { sessionID: "abc" },
    };
    expect(toAlertEvent(raw)).toEqual({
      raw,
      type: "idle",
      sessionID: "abc",
      message: "Task completed",
      sessionTitle: "",
    });
  });

  it("defaults sessionID to unknown when data is missing", () => {
    expect(
      toAlertEvent({ id: "evt_1", type: "session.execution.succeeded" }),
    ).toMatchObject({ type: "idle", sessionID: "unknown" });
  });
});

describe("toAlertEvent - session.execution.failed", () => {
  it("string error passes through as message", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.failed",
      data: { sessionID: "abc", error: "Rate limit exceeded" },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      sessionID: "abc",
      message: "Rate limit exceeded",
    });
  });

  it("object error with message extracts message", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.failed",
      data: {
        sessionID: "abc",
        error: { name: "APIError", message: "Invalid API key" },
      },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      message: "Invalid API key",
    });
  });

  it("object error without message falls back", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.failed",
      data: { sessionID: "abc", error: { name: "UnknownError" } },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      message: "Error occurred",
    });
  });

  it("missing error falls back", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.failed",
      data: { sessionID: "abc" },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      message: "Error occurred",
    });
  });
});

describe("toAlertEvent - session.execution.interrupted", () => {
  it("reason user maps to cancel", () => {
    const raw = {
      id: "evt_1",
      type: "session.execution.interrupted",
      data: { sessionID: "abc", reason: "user" },
    };
    expect(toAlertEvent(raw)).toEqual({
      raw,
      type: "cancel",
      sessionID: "abc",
      message: "Message cancelled",
      sessionTitle: "",
    });
  });

  it.each(["shutdown", "superseded", "inactivity"])(
    "reason %s returns null",
    (reason) => {
      expect(
        toAlertEvent({
          id: "evt_1",
          type: "session.execution.interrupted",
          data: { sessionID: "abc", reason },
        }),
      ).toBeNull();
    },
  );

  it("missing reason returns null", () => {
    expect(
      toAlertEvent({
        id: "evt_1",
        type: "session.execution.interrupted",
        data: { sessionID: "abc" },
      }),
    ).toBeNull();
  });
});

describe("toAlertEvent - permission.asked", () => {
  it("message takes priority over action and resources", () => {
    const raw = {
      id: "evt_1",
      type: "permission.asked",
      data: {
        sessionID: "ses_123",
        action: "Bash",
        resources: ["rm -rf /tmp/x"],
        message: "Allow running rm -rf?",
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "permission", sessionID: "ses_123" });
    expect(result).toHaveProperty("message", "Allow running rm -rf?");
  });

  it("falls back to action + first resource", () => {
    const raw = {
      id: "evt_1",
      type: "permission.asked",
      data: {
        sessionID: "ses_123",
        action: "Bash",
        resources: ["rm -rf /tmp/x", "ls -la"],
      },
    };
    expect(toAlertEvent(raw)).toHaveProperty("message", "Bash: rm -rf /tmp/x");
  });

  it("action without resources shows action only", () => {
    const raw = {
      id: "evt_1",
      type: "permission.asked",
      data: { sessionID: "ses_123", action: "edit", resources: [] },
    };
    expect(toAlertEvent(raw)).toHaveProperty("message", "edit");
  });

  it("no message/action/resource falls back to default", () => {
    const raw = {
      id: "evt_1",
      type: "permission.asked",
      data: { sessionID: "ses_123" },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "permission", sessionID: "ses_123" });
    expect(result).toHaveProperty("message", "Permission required");
  });
});

describe("toAlertEvent - form.created", () => {
  it("uses form title and joined field titles", () => {
    const raw = {
      id: "evt_1",
      type: "form.created",
      data: {
        form: {
          id: "form_1",
          sessionID: "ses_123",
          title: "Confirm plan",
          fields: [
            {
              key: "framework",
              title: "Framework",
              description: "Which one?",
            },
            { key: "package_manager", title: "Pkg manager" },
          ],
        },
      },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "question", sessionID: "ses_123" });
    expect(result).toHaveProperty(
      "message",
      "Confirm plan: Framework, Pkg manager",
    );
  });

  it("fields without title fall back to key", () => {
    const raw = {
      id: "evt_1",
      type: "form.created",
      data: {
        form: {
          id: "form_1",
          sessionID: "ses_123",
          title: "Setup",
          fields: [{ key: "framework" }],
        },
      },
    };
    expect(toAlertEvent(raw)).toHaveProperty("message", "Setup: framework");
  });

  it("sessionID comes from data.form.sessionID", () => {
    const raw = {
      id: "evt_1",
      type: "form.created",
      data: {
        form: {
          id: "form_1",
          sessionID: "form-session",
          title: "T",
          fields: [],
        },
      },
    };
    expect(toAlertEvent(raw)).toHaveProperty("sessionID", "form-session");
  });

  it("missing form falls back to Question", () => {
    const raw = { id: "evt_1", type: "form.created", data: {} };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "question" });
    expect(result).toHaveProperty("message", "Question");
  });
});

describe("toAlertEvent - sessionID extraction", () => {
  it("extracts sessionID from data.sessionID", () => {
    expect(
      toAlertEvent({
        id: "evt_1",
        type: "session.execution.succeeded",
        data: { sessionID: "direct-id" },
      }),
    ).toHaveProperty("sessionID", "direct-id");
  });

  it("defaults sessionID to unknown when data has none", () => {
    expect(
      toAlertEvent({
        id: "evt_1",
        type: "session.execution.succeeded",
        data: {},
      }),
    ).toHaveProperty("sessionID", "unknown");
  });
});
