import type { AlertConfig } from "./config.js";
import { sendDesktopNotification } from "./desktop.js";
import type { AlertEvent, AlertEventType } from "./events.js";
import { toAlertEvent } from "./events.js";
import { playSound } from "./sound.js";
import { isInQuietHours, shouldThrottle } from "./utils.js";

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
