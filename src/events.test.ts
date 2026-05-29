import { describe, expect, it } from "vitest";
import { toAlertEvent } from "./notify.js";

describe("toAlertEvent", () => {
  it("returns null for null input", () => {
    expect(toAlertEvent(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toAlertEvent(undefined)).toBeNull();
  });

  it("returns null for unknown event type", () => {
    expect(toAlertEvent({ type: "unknown.event" })).toBeNull();
  });

  it("returns null for event without type", () => {
    expect(toAlertEvent({ sessionID: "abc" })).toBeNull();
  });

  it("handles session.idle event", () => {
    const raw = { type: "session.idle", sessionID: "abc" };
    expect(toAlertEvent(raw)).toEqual({
      raw,
      type: "idle",
      sessionID: "abc",
      message: "Task completed",
      sessionTitle: "",
    });
  });

  it("handles session.error event", () => {
    const raw = { type: "session.error", sessionID: "abc" };
    expect(toAlertEvent(raw)).toEqual({
      raw,
      type: "error",
      sessionID: "abc",
      message: "Error occurred",
      sessionTitle: "",
    });
  });

  it("handles session.error with specific error message", () => {
    const raw = {
      type: "session.error",
      sessionID: "abc",
      properties: {
        error: {
          name: "APIError",
          data: { message: "Rate limit exceeded", statusCode: 429 },
        },
      },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      sessionID: "abc",
      message: "Rate limit exceeded",
    });
  });

  it("handles session.error with ProviderAuthError message", () => {
    const raw = {
      type: "session.error",
      sessionID: "abc",
      properties: {
        error: {
          name: "ProviderAuthError",
          data: { providerID: "openai", message: "Invalid API key" },
        },
      },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      message: "Invalid API key",
    });
  });

  it("handles session.error with missing error data falls back", () => {
    const raw = {
      type: "session.error",
      sessionID: "abc",
      properties: { error: { name: "UnknownError" } },
    };
    expect(toAlertEvent(raw)).toMatchObject({
      type: "error",
      message: "Error occurred",
    });
  });

  it("handles permission.updated event with title", () => {
    const raw = {
      type: "permission.updated",
      sessionID: "abc",
      properties: { title: "Edit file: src/utils.ts", type: "tool_call" },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "permission" });
    expect(result).toHaveProperty("message", "Edit file: src/utils.ts");
  });

  it("handles permission.updated event without title falls back to type", () => {
    const raw = {
      type: "permission.updated",
      sessionID: "abc",
      properties: { type: "tool_call" },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "permission" });
    expect(result).toHaveProperty("message", "tool_call");
  });

  it("handles permission.updated event without input.type shows unknown", () => {
    const result = toAlertEvent({
      type: "permission.updated",
      sessionID: "abc",
    });
    expect(result).toHaveProperty("message", "Permission required");
  });

  it("handles permission.updated event with empty input object shows unknown", () => {
    const raw = {
      type: "permission.updated",
      sessionID: "abc",
      properties: {},
    };
    const result = toAlertEvent(raw);
    expect(result).toHaveProperty("message", "Permission required");
  });

  it("detects question event type from session.idle", () => {
    const raw = { type: "session.idle", sessionID: "abc" };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "idle" });
  });

  it("extracts sessionID from event.sessionID", () => {
    const result = toAlertEvent({
      type: "session.idle",
      sessionID: "direct-id",
    });
    expect(result).toHaveProperty("sessionID", "direct-id");
  });

  it("extracts sessionID from event.properties.sessionID as fallback", () => {
    const result = toAlertEvent({
      type: "session.idle",
      properties: { sessionID: "prop-id" },
    });
    expect(result).toHaveProperty("sessionID", "prop-id");
  });

  it("extracts sessionID from event.properties.info.id as second fallback", () => {
    const result = toAlertEvent({
      type: "session.idle",
      properties: { info: { id: "info-id" } },
    });
    expect(result).toHaveProperty("sessionID", "info-id");
  });

  it("defaults sessionID to unknown when none found", () => {
    const result = toAlertEvent({ type: "session.idle" });
    expect(result).toHaveProperty("sessionID", "unknown");
  });

  it("prioritizes event.sessionID over properties.sessionID", () => {
    const result = toAlertEvent({
      type: "session.idle",
      sessionID: "direct",
      properties: { sessionID: "prop", info: { id: "info" } },
    });
    expect(result).toHaveProperty("sessionID", "direct");
  });

  it("prioritizes properties.sessionID over properties.info.id", () => {
    const result = toAlertEvent({
      type: "session.idle",
      properties: { sessionID: "prop", info: { id: "info" } },
    });
    expect(result).toHaveProperty("sessionID", "prop");
  });
});
