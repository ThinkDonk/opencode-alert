export type AlertEventType = "idle" | "error" | "permission";

export interface AlertEvent {
  raw: unknown;
  type: AlertEventType;
  sessionID: string;
  message: string;
}

export function toAlertEvent(raw: unknown): AlertEvent | null {
  const event = raw as Record<string, unknown> | null;
  if (!event) return null;

  const sessionID =
    (event.sessionID as string) ??
    ((event.properties as Record<string, unknown>)?.sessionID as string) ??
    (((event.properties as Record<string, unknown>)?.info as Record<string, unknown>)?.id as string) ??
    "unknown";

  switch (event.type) {
    case "session.idle":
      return { raw, type: "idle", sessionID, message: "Task completed" };
    case "session.error":
      return { raw, type: "error", sessionID, message: "Error occurred" };
    case "permission.updated":
      return {
        raw,
        type: "permission",
        sessionID,
        message: `Permission required: ${
          ((event.properties as Record<string, unknown>)?.input as Record<string, unknown>)?.type ?? "unknown"
        }`,
      };
    default:
      return null;
  }
}
