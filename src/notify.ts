import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AlertConfig, QuietHoursConfig } from "./config.js";
import { sendDesktopNotification, sendWindowsToast } from "./desktop.js";
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

const TOOL_CALL_MAP_MAX = 500;
const toolCallNames = new Map<string, string>();

function recordToolCall(id: unknown, name: unknown): void {
  if (typeof id !== "string" || typeof name !== "string") return;
  if (toolCallNames.has(id)) {
    toolCallNames.delete(id);
  }
  toolCallNames.set(id, name);
  while (toolCallNames.size > TOOL_CALL_MAP_MAX) {
    const oldest = toolCallNames.keys().next();
    if (oldest.done) break;
    toolCallNames.delete(oldest.value);
  }
}

export function resetToolCallMap(): void {
  toolCallNames.clear();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function firstStringResource(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const resource = getString(item);
    if (resource) return resource;
  }
  return undefined;
}

function buildPermissionMessage(
  action: string | undefined,
  resource: string | undefined,
): string {
  if (action && resource) return `${action}: ${resource}`;
  if (action) return action;
  return "Permission required";
}

function formFieldLabels(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((field) => {
      const record = asRecord(field);
      return getString(record?.title) ?? getString(record?.key) ?? "";
    })
    .filter(Boolean)
    .join(", ");
}

export function toAlertEvent(raw: unknown): AlertEvent | null {
  const event = asRecord(raw);
  if (!event || typeof event.type !== "string") return null;

  const data = asRecord(event.data);
  const formData = asRecord(data?.form);
  const sessionID =
    getString(formData?.sessionID) ?? getString(data?.sessionID) ?? "unknown";

  switch (event.type) {
    case "session.execution.succeeded":
      return {
        raw,
        type: "idle",
        sessionID,
        message: "Task completed",
        sessionTitle: "",
      };
    case "session.execution.failed": {
      const error = data?.error;
      const message =
        typeof error === "string"
          ? error
          : (getString(asRecord(error)?.message) ?? "Error occurred");
      return { raw, type: "error", sessionID, message, sessionTitle: "" };
    }
    case "session.execution.interrupted":
      if (data?.reason !== "user") return null;
      return {
        raw,
        type: "cancel",
        sessionID,
        message: "Message cancelled",
        sessionTitle: "",
      };
    case "permission.asked": {
      const message =
        getString(data?.message) ||
        buildPermissionMessage(
          getString(data?.action),
          firstStringResource(data?.resources),
        );
      return { raw, type: "permission", sessionID, message, sessionTitle: "" };
    }
    case "form.created": {
      const title = getString(formData?.title);
      const questionText = formFieldLabels(formData?.fields);
      const detail = questionText ? `: ${questionText}` : "";
      return {
        raw,
        type: "question",
        sessionID,
        message: `${title ?? "Question"}${detail}`,
        sessionTitle: "",
      };
    }
    case "session.tool.input.started": {
      recordToolCall(data?.id, data?.name);
      return null;
    }
    case "session.tool.success": {
      const callID = getString(data?.id);
      if (!callID) return null;
      const toolName = toolCallNames.get(callID);
      toolCallNames.delete(callID);
      if (toolName !== "task") return null;
      const content = getString(data?.content);
      return {
        raw,
        type: "subagent",
        sessionID,
        message: content || "Subagent completed",
        sessionTitle: "",
      };
    }
    default:
      return null;
  }
}

interface SessionInfoLike {
  parentID?: string;
  title?: string;
}

interface PluginContext {
  location?: {
    directory?: string;
    workspaceID?: string;
  };
  session?: {
    get(args: { sessionID: string }): Promise<SessionInfoLike>;
  };
}

function isOwnLocation(
  rawEvent: unknown,
  location: PluginContext["location"],
): boolean {
  if (!location) return true;
  const envelope = asRecord(rawEvent);
  const eventLocation = asRecord(envelope?.location);
  if (!eventLocation) return true;
  const eventDirectory = getString(eventLocation.directory);
  const ownDirectory = getString(location.directory);
  if (
    eventDirectory !== undefined &&
    ownDirectory !== undefined &&
    eventDirectory !== ownDirectory
  ) {
    return false;
  }
  const eventWorkspace = getString(eventLocation.workspaceID);
  const ownWorkspace = getString(location.workspaceID);
  if (eventWorkspace !== undefined || ownWorkspace !== undefined) {
    return eventWorkspace === ownWorkspace;
  }
  return true;
}

export async function dispatch(
  rawEvent: unknown,
  config: AlertConfig,
  ctx: PluginContext,
  terminal: TerminalInfo | null,
): Promise<void> {
  if (!isOwnLocation(rawEvent, ctx.location)) {
    return;
  }
  const alertEvent = toAlertEvent(rawEvent);
  if (!alertEvent) {
    return;
  }
  if (
    (alertEvent.type === "idle" ||
      alertEvent.type === "permission" ||
      alertEvent.type === "question") &&
    ctx.session
  ) {
    const shouldNotify = await enrichFromSession(alertEvent, ctx.session);
    if (!shouldNotify) {
      return;
    }
  }

  if (alertEvent.type === "subagent") {
    if (!config.notifyChildSessions) {
      return;
    }
    if (ctx.session) {
      const isChild = await checkIsChildSession(
        alertEvent.sessionID,
        ctx.session,
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

    if (process.platform === "win32") {
      sendWindowsToast(title, message);
    } else if (config.desktop.enabled && config.desktop.events.includes(type)) {
      promises.push(sendDesktopNotification(title, message));
    }

    if (config.sound.enabled) {
      promises.push(playSound(type, config.sound, config.soundCommand));
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
  session: NonNullable<PluginContext["session"]>,
): Promise<boolean> {
  try {
    const info = await session.get({ sessionID });
    return !!info?.parentID;
  } catch {
    return false;
  }
}

async function enrichFromSession(
  alertEvent: AlertEvent,
  session: NonNullable<PluginContext["session"]>,
): Promise<boolean> {
  try {
    const info = await session.get({ sessionID: alertEvent.sessionID });
    if (info?.parentID && alertEvent.type === "idle") {
      return false;
    }
    if (info?.title) {
      const title = String(info.title);
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
