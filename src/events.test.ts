import { describe, it, expect } from "vitest";
import { toAlertEvent } from "./events.js";

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
    });
  });

  it("handles session.error event", () => {
    const raw = { type: "session.error", sessionID: "abc" };
    expect(toAlertEvent(raw)).toEqual({
      raw,
      type: "error",
      sessionID: "abc",
      message: "Error occurred",
    });
  });

  it("handles permission.updated event with known input type", () => {
    const raw = {
      type: "permission.updated",
      sessionID: "abc",
      properties: { input: { type: "tool_call" } },
    };
    const result = toAlertEvent(raw);
    expect(result).toMatchObject({ type: "permission" });
    expect(result).toHaveProperty("message", "Permission required: tool_call");
  });

  it("permission event with missing input.type shows unknown", () => {
    const result = toAlertEvent({ type: "permission.updated", sessionID: "abc" });
    expect(result).toHaveProperty("message", "Permission required: unknown");
  });

  it("permission event with empty input object shows unknown", () => {
    const raw = {
      type: "permission.updated",
      sessionID: "abc",
      properties: { input: {} },
    };
    const result = toAlertEvent(raw);
    expect(result).toHaveProperty("message", "Permission required: unknown");
  });

  it("extracts sessionID from event.sessionID", () => {
    const result = toAlertEvent({ type: "session.idle", sessionID: "direct-id" });
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
