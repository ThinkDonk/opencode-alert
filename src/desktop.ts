import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AlertEventType } from "./events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_PATH = join(__dirname, "..", "icon.png");

function shellEscape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

const TITLES: Record<AlertEventType, string> = {
  idle: "Task Completed",
  error: "Error Occurred",
  permission: "Permission Required",
  question: "Question",
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
          title: `OpenCode ${TITLES[type]}`,
          message,
          sound: false,
          wait: false,
          appIcon: ICON_PATH,
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
        const escapedMsg = shellEscape(message);
        const escapedTitle = shellEscape(`OpenCode ${TITLES[type]}`);
        await $`notify-send "${escapedTitle}" "${escapedMsg}"`.quiet();
      }
    } catch {
      // Notification is best-effort, never block the plugin
    }
  }
}
