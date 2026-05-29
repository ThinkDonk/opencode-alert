import { execSync } from "node:child_process";
import { close, open, write } from "node:fs";

let counter = 0;

export function formatOSC777(title: string, body: string): string {
  return `\x1b]777;notify;${sanitizeOSC(title)};${sanitizeOSC(body)}\x07`;
}

export function formatOSC9(title: string, body: string): string {
  return `\x1b]9;${sanitizeOSC(title)}: ${sanitizeOSC(body)}\x07`;
}

export function formatOSC99(title: string, body: string): string {
  const id = counter++;
  const part1 = `\x1b]99;i=${id}:d=0;${sanitizeOSC(title)}\x1b\\`;
  const part2 = `\x1b]99;i=${id}:p=body;${sanitizeOSC(body)}\x1b\\`;
  return part1 + part2;
}

export function wrapForTmux(sequence: string): string {
  const esc = "\x1b";
  const escaped = sequence.split(esc).join(esc + esc);
  return `\x1bPtmux;${escaped}\x1b\\`;
}

export function sanitizeOSC(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x20 && c < 0x7f) || c >= 0xa0) {
      result += text[i];
    }
  }
  return result;
}

let cachedTTY: string | null = null;

export function resolveTTY(): string | null {
  if (process.env.TMUX) {
    try {
      const tty = execSync("tmux display-message -p '#{client_tty}'", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (tty) return tty;
    } catch {
      // Fall through
    }
  }

  if (cachedTTY !== null) return cachedTTY;

  if (process.env.TTY) {
    cachedTTY = process.env.TTY;
    return cachedTTY;
  }

  try {
    const tty = execSync("tty", {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (tty && tty !== "not a tty") {
      cachedTTY = tty;
      return cachedTTY;
    }
  } catch {
    // Fall through
  }

  cachedTTY = null;
  return null;
}

function formatForProtocol(
  title: string,
  body: string,
  protocol: string,
): string {
  switch (protocol) {
    case "osc9":
      return formatOSC9(title, body);
    case "osc99":
      return formatOSC99(title, body);
    default:
      return formatOSC777(title, body);
  }
}

export function sendOSCNotification(
  title: string,
  body: string,
  protocol: string,
): void {
  const tty = resolveTTY();
  if (!tty) return;

  let sequence = formatForProtocol(title, body, protocol);
  if (process.env.TMUX) {
    sequence = wrapForTmux(sequence);
  }

  open(tty, "w", (err, fd) => {
    if (err) return;
    write(fd, Buffer.from(sequence), (writeErr) => {
      close(fd, (_closeErr) => {});
    });
  });
}

export function sendWindowsToast(title: string, body: string): void {
  console.error("[opencode-alert-debug] sendWindowsToast called:", {
    title,
    body,
  });

  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body
    .replace(/'/g, "''")
    .replace(/</g, "")
    .replace(/>/g, "");

  console.error(
    "[opencode-alert-debug] About to try WinRT Toast via execSync...",
  );

  try {
    const toastScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = '<toast><visual><binding template="ToastText02"><text id="1">${escapedTitle}</text><text id="2">${escapedBody}</text></binding></visual></toast>'
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode').Show($toast)
`.trim();
    execSync(toastScript, {
      shell: "powershell",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.error("[opencode-alert-debug] Windows Toast succeeded");
    return;
  } catch (e: any) {
    console.error(
      "[opencode-alert-debug] Windows Toast failed, trying BalloonTip:",
      e.message,
    );
  }

  try {
    const balloonScript = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = '${escapedTitle}'
$n.BalloonTipText = '${escapedBody}'
$n.Visible = $true
$n.ShowBalloonTip(5000)
Start-Sleep -Milliseconds 6000
$n.Dispose()
`.trim();
    execSync(balloonScript, {
      shell: "powershell",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.error("[opencode-alert-debug] BalloonTip succeeded");
  } catch (e: any) {
    console.error("[opencode-alert-debug] BalloonTip also failed:", e.message);
  }
}
