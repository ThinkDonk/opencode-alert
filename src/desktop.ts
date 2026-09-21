import { execSync, spawn } from "node:child_process";

function appleScriptEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function psEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\n/g, " ");
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
      child.unref();
    } else if (platform === "linux") {
      const child = spawn("notify-send", [title, message], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
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
      child.unref();
    }
  } catch {
    // Silently fail — notifications are best-effort
  }
}

export function sendWindowsToast(title: string, body: string): void {
  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body
    .replace(/'/g, "''")
    .replace(/</g, "")
    .replace(/>/g, "");

  try {
    const toastScript = `
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
    execSync(toastScript, {
      shell: "powershell",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return;
  } catch {
    // Toast failed, fall through to BalloonTip
  }

  try {
    const balloonScript = `
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
    execSync(balloonScript, {
      shell: "powershell",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    // Silently fail — notifications are best-effort
  }
}
