import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AlertConfig, QuietHoursConfig } from "./config.js";
import { sendDesktopNotification } from "./desktop.js";
import { playSound } from "./sound.js";

const THROTTLE_FILE = join(
  homedir(),
  ".config",
  "opencode",
  "alert-throttle.json",
);

let lastNotification: Record<string, number> = {};

function loadThrottleState(): void {
  try {
    const data = readFileSync(THROTTLE_FILE, "utf-8");
    lastNotification = JSON.parse(data);
  } catch {
    lastNotification = {};
  }
}

function saveThrottleState(): void {
  try {
    const dir = join(homedir(), ".config", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(THROTTLE_FILE, JSON.stringify(lastNotification), "utf-8");
  } catch {
    // Persistence is best-effort
  }
}

loadThrottleState();

export function resetThrottleState(): void {
  lastNotification = {};
  try {
    unlinkSync(THROTTLE_FILE);
  } catch {
    // File may not exist
  }
}

export function isInQuietHours(config: QuietHoursConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const [startH, startM] = config.start.split(":").map(Number);
  const [endH, endM] = config.end.split(":").map(Number);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}

export function shouldThrottle(
  eventType: string,
  minInterval: number,
): boolean {
  const now = Date.now();
  const last = lastNotification[eventType] ?? 0;
  if (now - last < minInterval * 1000) return true;
  lastNotification[eventType] = now;
  saveThrottleState();
  return false;
}

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

interface PluginContext {
  $: any;
  directory: string;
  worktree?: string;
  client: any;
}

export async function dispatch(
  rawEvent: unknown,
  config: AlertConfig,
  ctx: PluginContext,
): Promise<void> {
  const alertEvent = toAlertEvent(rawEvent);
  if (!alertEvent) return;
  if (
    (alertEvent.type === "idle" || alertEvent.type === "permission") &&
    ctx.client
  ) {
    const shouldNotify = await enrichFromSession(alertEvent, ctx.client);
    if (!shouldNotify) return;
  }

  const { type, message } = alertEvent;

  if (isInQuietHours(config.filter.quietHours)) return;
  if (shouldThrottle(type, config.filter.minInterval)) return;

  const promises: Promise<void>[] = [];

  if (
    config.desktop.enabled &&
    config.desktop.events.includes(type as AlertEventType)
  ) {
    promises.push(sendDesktopNotification(type, message, ctx.$));
  }

  if (config.sound.enabled) {
    promises.push(playSound(type, config.sound, ctx.$));
  }

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[opencode-alert] notification failed:", result.reason);
    }
  }
}

function extractTextFromParts(parts: any[]): string {
  return parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text ?? p.content ?? "")
    .join(" ");
}

function isQuestionText(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.endsWith("?")) return true;
  const questionStarters = [
    "would you",
    "do you",
    "should",
    "can you",
    "could you",
  ];
  return questionStarters.some((s) => trimmed.startsWith(s));
}

async function enrichFromSession(
  alertEvent: AlertEvent,
  client: any,
): Promise<boolean> {
  try {
    const sessionResult = await client.session.get({
      path: { id: alertEvent.sessionID },
    });
    if (sessionResult?.data?.parentID) {
      return false;
    }
    if (sessionResult?.data?.title) {
      const title = String(sessionResult.data.title);
      const truncated =
        title.length > 50 ? `${title.substring(0, 47)}...` : title;
      alertEvent.sessionTitle = truncated;
      if (alertEvent.type === "idle") {
        alertEvent.message = truncated;
      } else {
        alertEvent.message = `${alertEvent.message} (${truncated})`;
      }
    }
  } catch (e) {
    console.error("[opencode-alert] enrichFromSession session.get failed:", e);
  }

  try {
    const messagesResult = await client.session.messages({
      path: { id: alertEvent.sessionID },
    });
    if (messagesResult?.data && Array.isArray(messagesResult.data)) {
      const messages = messagesResult.data;
      const lastAssistantMsg = messages
        .filter((m: any) => m.info?.role === "assistant")
        .pop();
      if (lastAssistantMsg?.parts) {
        const text = extractTextFromParts(lastAssistantMsg.parts);
        if (text && isQuestionText(text)) {
          alertEvent.type = "question";
        }
      }
    }
  } catch (e) {
    console.error(
      "[opencode-alert] enrichFromSession session.messages failed:",
      e,
    );
  }

  return true;
}
