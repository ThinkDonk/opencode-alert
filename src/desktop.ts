import type { AlertEventType } from "./events.js";

const TITLES: Record<AlertEventType, string> = {
  idle: "Task Completed",
  error: "Error Occurred",
  permission: "Permission Required",
};

type ShellRunner = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{
  quiet(): Promise<void>;
}>;

export async function sendDesktopNotification(
  type: AlertEventType,
  message: string,
  $?: ShellRunner,
): Promise<void> {
  const platform = process.platform;

  try {
    const { default: notifier } = await import("node-notifier");
    await new Promise<void>((resolve) => {
      notifier.notify(
        {
          title: `OpenCode — ${TITLES[type]}`,
          message,
          sound: false,
          wait: false,
        },
        () => resolve(),
      );
    });
  } catch {
    if (!$) return;
    try {
      if (platform === "darwin") {
        const escapedMsg = message.replace(/'/g, "'\"'\"'");
        const escapedTitle = TITLES[type].replace(/'/g, "'\"'\"'");
        await $`osascript -e 'display notification "${escapedMsg}" with title "${escapedTitle}"'`.quiet();
      } else if (platform === "linux") {
        await $`notify-send "OpenCode — ${TITLES[type]}" "${message}"`.quiet();
      }
    } catch {
      // Notification is best-effort, never block the plugin
    }
  }
}
