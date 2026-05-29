import { spawn } from "node:child_process";

function shellEscape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function psEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\n/g, " ");
}

type ShellRunner = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{
  quiet(): Promise<void>;
}>;

export async function sendDesktopNotification(
  title: string,
  message: string,
  $?: ShellRunner,
): Promise<void> {
  const platform = process.platform;

  try {
    if (platform !== "win32" && !$) return;

    if (platform === "darwin") {
      const escapedMsg = message.replace(/'/g, "'\"'\"'");
      const escapedTitle = title.replace(/'/g, "'\"'\"'");
      await $`osascript -e 'display notification "${escapedMsg}" with title "${escapedTitle}"'`.quiet();
    } else if (platform === "linux") {
      const escapedMsg = shellEscape(message);
      const escapedTitle = shellEscape(`OpenCode ${title}`);
      await $`notify-send "${escapedTitle}" "${escapedMsg}"`.quiet();
    } else if (platform === "win32") {
      const escapedTitle = psEscape(`OpenCode ${title}`);
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
      });
      child.unref();
    }
  } catch {
    // Silently fail — notifications are best-effort
  }
}
