import type { AlertConfig } from "./config.js";
import { sendDesktopNotification } from "./desktop.js";
import { toAlertEvent } from "./events.js";
import type { AlertEventType } from "./events.js";
import { playSound } from "./sound.js";
import { isInQuietHours, isTerminalFocused, shouldThrottle } from "./utils.js";

interface PluginContext {
  $: any;
  directory: string;
  worktree?: string;
}

export async function dispatch(
  rawEvent: unknown,
  config: AlertConfig,
  ctx: PluginContext,
): Promise<void> {
  const alertEvent = toAlertEvent(rawEvent);
  if (!alertEvent) return;

  const { type, message } = alertEvent;

  if (isInQuietHours(config.filter.quietHours)) return;
    if (config.filter.skipOnFocus && isTerminalFocused()) return;
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
