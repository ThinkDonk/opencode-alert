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

function shellEscape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

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
  $?: TaggedShellRunner,
): Promise<void> {
  if (!config.enabled) return;
  if (!$) return;

  const soundFile = config.events[type] || config.default;
  if (!soundFile) return;

  const soundPath = resolveSoundPath(soundFile, config.customDir);
  if (!soundPath) return;

  try {
    switch (PLATFORM) {
      case "darwin":
        await $`afplay "${shellEscape(soundPath)}"`.quiet();
        break;
      case "linux":
        await $`ffplay -nodisp -autoexit -loglevel quiet "${shellEscape(soundPath)}"`.quiet();
        break;
      case "win32": {
        const escaped = psEscape(soundPath);
        if (soundFile.endsWith(".wav")) {
          await $`powershell -NoProfile -Command "(New-Object Media.SoundPlayer '${escaped}').PlaySync()"`.quiet();
        } else {
          await $`powershell -NoProfile -Command "Add-Type -AssemblyName presentationCore; (New-Object System.Windows.Media.MediaPlayer).Open('${escaped}'); Start-Sleep -Seconds 2"`.quiet();
        }
        break;
      }
    }
  } catch {
    // Sound is best-effort, never block the plugin
  }
}

type TaggedShellRunner = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<{
  quiet(): Promise<void>;
}>;
