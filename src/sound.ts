import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SoundConfig } from "./config.js";
import type { AlertEventType } from "./notify.js";

let __dirname: string;
try {
  __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
  __dirname = ".";
}

const PLATFORM = process.platform;

function psEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\$/g, "`$").replace(/`/g, "``");
}

function resolveSoundPath(soundFile: string, customDir: string): string | null {
  if (customDir) {
    const customPath = join(customDir, soundFile);
    if (existsSync(customPath)) return customPath;
  }

  if (__dirname.includes("dist")) {
    const builtinPath = join(__dirname, "..", "sounds", soundFile);
    if (existsSync(builtinPath)) return builtinPath;
  }

  const srcBuiltinPath = join(__dirname, "..", "sounds", soundFile);
  if (existsSync(srcBuiltinPath)) return srcBuiltinPath;

  return null;
}

export async function playSound(
  type: AlertEventType,
  config: SoundConfig,
  soundCommand?: string | null,
): Promise<void> {
  if (!config.enabled) return;

  const soundFile = config.events[type] || config.default;
  if (!soundFile) return;

  const soundPath = resolveSoundPath(soundFile, config.customDir);
  if (!soundPath) return;

  try {
    if (soundCommand) {
      const cmd = soundCommand.replace(/\{sound\}/g, soundPath);
      const child = spawn(cmd, [], {
        shell: true,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return;
    }

    switch (PLATFORM) {
      case "darwin": {
        const child = spawn("afplay", [soundPath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        break;
      }
      case "linux": {
        const child = spawn(
          "ffplay",
          ["-nodisp", "-autoexit", "-loglevel", "quiet", soundPath],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        child.unref();
        break;
      }
      case "win32": {
        const escaped = psEscape(soundPath);
        if (soundFile.endsWith(".wav")) {
          const child = spawn(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `(New-Object Media.SoundPlayer '${escaped}').PlaySync()`,
            ],
            { detached: true, stdio: "ignore", windowsHide: true },
          );
          child.unref();
        } else {
          const child = spawn(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `Add-Type -AssemblyName presentationCore; (New-Object System.Windows.Media.MediaPlayer).Open('${escaped}'); Start-Sleep -Seconds 2`,
            ],
            { detached: true, stdio: "ignore", windowsHide: true },
          );
          child.unref();
        }
        break;
      }
    }
  } catch {
    // Sound is best-effort, never block the plugin
  }
}
