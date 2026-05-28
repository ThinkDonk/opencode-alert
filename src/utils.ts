import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { QuietHoursConfig } from "./config.js";

const THROTTLE_FILE = join(homedir(), ".config", "opencode", "alert-throttle.json");

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
      const script = [
        "$ProgressPreference = 'SilentlyContinue'",
        "$ErrorActionPreference = 'SilentlyContinue'",
        'Add-Type @"',
        "using System;",
        "using System.Runtime.InteropServices;",
        "public class W {",
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();',
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);',
        "}",
        '"@',
        "$cw = [W]::GetConsoleWindow()",
        "if ($cw -ne [IntPtr]::Zero) {",
        "  if ($cw -eq [W]::GetForegroundWindow()) { '1'; exit }",
        "} else {",
        "  $p = 0",
        "  [W]::GetWindowThreadProcessId([W]::GetForegroundWindow(), [ref]$p) | Out-Null",
        `  $r = ${ppid}`,
        "  while ($r -gt 1) {",
        "    if ($r -eq $p) { '1'; exit }",
        "    try { $n = (Get-Process -Id $r -EA 0).ProcessName } catch { $n = '' }",
        "    try { $f = (Get-Process -Id $p -EA 0).ProcessName } catch { $f = '' }",
        "    if ($n -and $f -and $n -eq $f) { '1'; exit }",
        '    $par = (Get-CimInstance Win32_Process -Filter "ProcessId=$r" -EA 0).ParentProcessId',
        "    if (-not $par -or $par -eq $r) { break }",
        "    $r = $par",
        "  }",
        "}",
        "'0'",
      ].join("\n");
      const encoded = Buffer.from(script, "utf-16le").toString("base64");
      const out = execSync(
        `powershell -NoProfile -NonInteractive -NoLogo -EncodedCommand ${encoded}`,
        { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      return out === "1";
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
    saveThrottleState();
  return false;
}
