import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AlertConfig, QuietHoursConfig } from "./config.js";
import { sendDesktopNotification } from "./desktop.js";
import { sendOSCNotification, sendWindowsToast } from "./osc.js";
import { playSound } from "./sound.js";
import { type TerminalInfo, isTerminalFocused } from "./terminal.js";

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

const DEBOUNCE_MS = 3000;
const MAX_DEBOUNCE_ENTRIES = 200;
const debounceEntries = new Map<string, number>();
const SPECIFIC_EVENTS = new Set(["error", "permission", "question"]);

function shouldSuppressIdleByDebounce(sessionID: string): boolean {
  const now = Date.now();
  for (const eventType of SPECIFIC_EVENTS) {
    const key = `${sessionID}:${eventType}`;
    const ts = debounceEntries.get(key);
    if (ts && now - ts < DEBOUNCE_MS) {
      return true;
    }
  }
  return false;
}

function recordDebounce(sessionID: string, eventType: string): void {
  const key = `${sessionID}:${eventType}`;
  debounceEntries.set(key, Date.now());

  if (debounceEntries.size > MAX_DEBOUNCE_ENTRIES) {
    const cutoff = Date.now() - DEBOUNCE_MS;
    for (const [k, v] of debounceEntries) {
      if (v < cutoff) {
        debounceEntries.delete(k);
      }
    }
  }
}

export const EVENT_TITLES: Record<AlertEventType, string> = {
  idle: "✅ Task Completed",
  error: "❌ Error Occurred",
  permission: "🔑 Permission Required",
  question: "❓ Question",
  cancel: "🚫 Cancelled",
  subagent: "🤖 Subagent Done",
};

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
  sessionID: string,
  eventType: string,
  minInterval: number,
): boolean {
  const key = `${sessionID}:${eventType}`;
  const now = Date.now();
  const last = lastNotification[key] ?? 0;
  if (now - last < minInterval * 1000) return true;
  lastNotification[key] = now;
  saveThrottleState();
  return false;
}

export type AlertEventType =
  | "idle"
  | "error"
  | "permission"
  | "question"
  | "cancel"
  | "subagent";

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
    case "permission.asked": {
      const props = event.properties as Record<string, unknown> | undefined;
      const perm = props?.permission as Record<string, unknown> | undefined;
      const description =
        (perm?.description as string | undefined) ??
        (props?.description as string | undefined) ??
        (perm?.message as string | undefined);
      const detail = description ? `: ${description}` : "";
      return {
        raw,
        type: "permission",
        sessionID,
        message: `${(perm?.title as string | undefined) ?? "Permission required"}${detail}`,
        sessionTitle: "",
      };
    }
    case "question.asked": {
      const props = event.properties as Record<string, unknown> | undefined;
      const questions = props?.questions as
        | Array<Record<string, unknown>>
        | undefined;
      const firstQ = questions?.[0];
      const header = firstQ?.header as string | undefined;
      const questionText = firstQ?.question as string | undefined;
      const detail = questionText ? `: ${questionText}` : "";
      return {
        raw,
        type: "question",
        sessionID,
        message: `${header ?? "Question"}${detail}`,
        sessionTitle: "",
      };
    }
    case "message.updated": {
      const props = event.properties as Record<string, unknown> | undefined;
      const err = props?.error as Record<string, unknown> | undefined;
      if (err?.name === "MessageAbortedError") {
        return {
          raw,
          type: "cancel",
          sessionID,
          message: "Message cancelled",
          sessionTitle: "",
        };
      }
      return null;
    }
    case "message.part.updated": {
      const props = event.properties as Record<string, unknown> | undefined;
      const part = props?.part as Record<string, unknown> | undefined;
      const tool = part?.tool as Record<string, unknown> | undefined;
      const state = part?.state as Record<string, unknown> | undefined;
      if (tool?.name === "task" && state?.status === "completed") {
        const content =
          typeof part?.content === "string"
            ? (part.content as string)
            : undefined;
        return {
          raw,
          type: "subagent",
          sessionID,
          message: content || "Subagent completed",
          sessionTitle: "",
        };
      }
      return null;
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
  terminal: TerminalInfo | null,
): Promise<void> {
  const alertEvent = toAlertEvent(rawEvent);
  if (!alertEvent) {
    return;
  }
  if (
    (alertEvent.type === "idle" ||
      alertEvent.type === "permission" ||
      alertEvent.type === "question") &&
    ctx.client
  ) {
    const shouldNotify = await enrichFromSession(alertEvent, ctx.client);
    if (!shouldNotify) {
      return;
    }
  }

  if (alertEvent.type === "subagent") {
    if (!config.notifyChildSessions) {
      return;
    }
    if (ctx.client) {
      const isChild = await checkIsChildSession(
        alertEvent.sessionID,
        ctx.client,
      );
      if (!isChild) {
        return;
      }
    }
  }

  const { type, message, sessionID } = alertEvent;

  if (type === "idle" && !config.notifyOnIdle) {
    return;
  }

  if (type === "idle" && shouldSuppressIdleByDebounce(sessionID)) {
    return;
  }
  recordDebounce(sessionID, type);

  if (isInQuietHours(config.filter.quietHours)) {
    return;
  }
  if (shouldThrottle(sessionID, type, config.filter.minInterval)) {
    return;
  }

  if (config.suppressWhenFocused && isTerminalFocused(terminal)) {
    return;
  }

  const doNotify = async () => {
    const promises: Promise<void>[] = [];
    const title = EVENT_TITLES[type];
    const protocol = terminal?.protocol ?? null;

    if (process.platform === "win32") {
      sendWindowsToast(title, message);
    } else {
      if (protocol) {
        sendOSCNotification(title, message, protocol);
      }
      if (
        config.desktop.enabled &&
        config.desktop.events.includes(type as AlertEventType)
      ) {
        promises.push(sendDesktopNotification(title, message, ctx.$));
      }
    }

    if (config.sound.enabled) {
      promises.push(playSound(type, config.sound, ctx.$, config.soundCommand));
    }

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[opencode-alert] notification failed:", result.reason);
      }
    }
  };

  const delay = config.delayMs?.[type] ?? 0;
  if (delay > 0) {
    setTimeout(() => {
      doNotify().catch(() => {});
    }, delay);
  } else {
    await doNotify();
  }
}

async function checkIsChildSession(
  sessionID: string,
  client: any,
): Promise<boolean> {
  try {
    const result = await client.session.get({ path: { id: sessionID } });
    return !!result?.data?.parentID;
  } catch {
    return false;
  }
}

async function enrichFromSession(
  alertEvent: AlertEvent,
  client: any,
): Promise<boolean> {
  try {
    const sessionResult = await client.session.get({
      path: { id: alertEvent.sessionID },
    });
    if (sessionResult?.data?.parentID && alertEvent.type === "idle") {
      return false;
    }
    if (sessionResult?.data?.title) {
      const title = String(sessionResult.data.title);
      if (title.toLowerCase().startsWith("new session")) {
        return true;
      }
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

  return true;
}
