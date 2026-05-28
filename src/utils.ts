import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { QuietHoursConfig } from "./config.js";

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
