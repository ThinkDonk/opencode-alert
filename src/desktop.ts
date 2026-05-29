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
    if (!$) return;

    if (platform === "darwin") {
      const escapedMsg = message.replace(/'/g, "'\"'\"'");
      const escapedTitle = title.replace(/'/g, "'\"'\"'");
      await $`osascript -e 'display notification "${escapedMsg}" with title "${escapedTitle}"'`.quiet();
    } else if (platform === "linux") {
      const escapedMsg = shellEscape(message);
      const escapedTitle = shellEscape(`OpenCode ${title}`);
      await $`notify-send "${escapedTitle}" "${escapedMsg}"`.quiet();
    } else if (platform === "win32") {
      const escapedMsg = psEscape(message);
      const toastBody = `OpenCode ${title}: ${escapedMsg}`;
      await $`powershell -NoProfile -Command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null; $template = '<toast><visual><binding template=\"ToastText01\"><text id=\"1\">${toastBody}</text></binding></visual></toast>'; $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml($template); $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode').Show($toast)"`.quiet();
    }
  } catch {}
}
