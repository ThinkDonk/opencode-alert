import { execFile, spawn } from "node:child_process";
import { ensureAumidRegistered } from "./win-aumid.js";

function appleScriptEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function psEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\n/g, " ");
}

function runPowerShell(script: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { timeout: 10000, windowsHide: true, ...(signal ? { signal } : {}) },
        (error) => resolve(!error),
      );
    } catch {
      resolve(false);
    }
  });
}

export async function sendDesktopNotification(
  title: string,
  message: string,
): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const escapedMsg = appleScriptEscape(message);
      const escapedTitle = appleScriptEscape(title);
      const child = spawn(
        "osascript",
        [
          "-e",
          `display notification "${escapedMsg}" with title "${escapedTitle}"`,
        ],
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      child.on("error", () => {});
      child.unref();
    } else if (platform === "linux") {
      const child = spawn("notify-send", [title, message], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => {});
      child.unref();
    } else if (platform === "win32") {
      const escapedTitle = psEscape(title);
      const escapedBody = psEscape(message);
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = '<toast><visual><binding template="ToastText02"><text id="1">${escapedTitle}</text><text id="2">${escapedBody}</text></binding></visual></toast>'
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode').Show($toast)
`.trim();
      const child = spawn("powershell", ["-NoProfile", "-Command", psScript], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => {});
      child.unref();
    }
  } catch {}
}

export async function sendWindowsToast(
  title: string,
  body: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  await ensureAumidRegistered();
  if (signal?.aborted) return;
  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body
    .replace(/'/g, "''")
    .replace(/</g, "")
    .replace(/>/g, "");

  const toastScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AppId { [DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appID); }' -Language CSharp
[AppId]::SetCurrentProcessExplicitAppUserModelID('OpenCode')
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$template = '<toast><visual><binding template="ToastText02"><text id="1">${escapedTitle}</text><text id="2">${escapedBody}</text></binding></visual></toast>'
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode').Show($toast)
`.trim();
  if (await runPowerShell(toastScript, signal)) return;
  if (signal?.aborted) return;

  const balloonScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AppId { [DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appID); }' -Language CSharp
[AppId]::SetCurrentProcessExplicitAppUserModelID('OpenCode')
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
  await runPowerShell(balloonScript, signal);
}
