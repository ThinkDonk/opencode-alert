export type AlertEventType = "idle" | "error" | "permission" | "question";

export interface AlertEvent {
  raw: unknown;
  type: AlertEventType;
  sessionID: string;
  message: string;
  sessionTitle: string;
}

export function toAlertEvent(raw: unknown): AlertEvent | null {
  const event = raw as Record<string, unknown> | null;
  if (!event) return null;

  const sessionID =
    (event.sessionID as string) ??
    ((event.properties as Record<string, unknown>)?.sessionID as string) ??
    ((
      (event.properties as Record<string, unknown>)?.info as Record<
        string,
        unknown
      >
    )?.id as string) ??
    "unknown";

  switch (event.type) {
    case "session.idle":
      return {
        raw,
        type: "idle",
        sessionID,
        message: "Task completed",
        sessionTitle: "",
      };
    case "session.error": {
      const err = (event.properties as Record<string, unknown>)?.error as
        | Record<string, unknown>
        | undefined;
      const errMsg = (err?.data as Record<string, unknown>)?.message as
        | string
        | undefined;
      return {
        raw,
        type: "error",
        sessionID,
        message: errMsg ?? "Error occurred",
        sessionTitle: "",
      };
    }
    case "permission.updated": {
      const props = event.properties as Record<string, unknown> | undefined;
      const title = props?.title as string | undefined;
      const permType = props?.type as string | undefined;
      const description = (props?.description ??
        props?.message ??
        props?.content) as string | undefined;
      const detail = description ? `: ${description}` : "";
      return {
        raw,
        type: "permission",
        sessionID,
        message: `${title ?? permType ?? "Permission required"}${detail}`,
        sessionTitle: "",
      };
    }
    default:
      return null;
  }
}
