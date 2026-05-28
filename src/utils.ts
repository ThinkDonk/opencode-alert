import { execSync } from "node:child_process";
import type { QuietHoursConfig } from "./config.js";

const lastNotification: Record<string, number> = {};

export function isTerminalFocused(): boolean {
  const platform = process.platform;
  const ppid = process.ppid;

  try {
    if (platform === "darwin") {
      const out = execSync(
        "osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true'",
        { encoding: "utf-8", timeout: 2000 },
      ).trim();
      const term = process.env.TERM_PROGRAM ?? "Terminal";
      return out.toLowerCase().includes(term.toLowerCase());
    }

    if (platform === "linux") {
      const out = execSync(
        "xdotool getactivewindow getwindowpid 2>/dev/null || echo 0",
        { encoding: "utf-8", timeout: 2000 },
      ).trim();
      const activePid = Number.parseInt(out, 10);
      if (!activePid) return false;
      let pid: number = ppid;
      while (pid > 1) {
        if (pid === activePid) return true;
        const stat = execSync(
          `cat /proc/${pid}/stat 2>/dev/null || echo ""`,
          { encoding: "utf-8", timeout: 1000 },
        ).trim();
        if (!stat) break;
        const ppidStr = stat.split(")")[1]?.trim().split(" ")[1];
        if (!ppidStr) break;
        pid = Number.parseInt(ppidStr, 10);
      }
      return false;
    }

    if (platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${ppid} -ErrorAction SilentlyContinue).MainWindowHandle"`,
        { encoding: "utf-8", timeout: 2000 },
      ).trim();
      return out !== "0" && out.length > 0;
    }
  } catch {
    // Detection is best-effort; assume not focused if we cannot determine
  }

  return false;
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
  return false;
}
