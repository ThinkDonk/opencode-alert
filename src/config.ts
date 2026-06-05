import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AlertEventType } from "./notify.js";

export interface QuietHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
}

export interface FilterConfig {
  quietHours: QuietHoursConfig;
  minInterval: number;
}

export interface DesktopConfig {
  enabled: boolean;
  events: AlertEventType[];
}

export interface SoundConfig {
  enabled: boolean;
  events: Partial<Record<AlertEventType, string>>;
  default: string;
  customDir: string;
}

export interface AlertConfig {
  enabled: boolean;
  desktop: DesktopConfig;
  sound: SoundConfig;
  filter: FilterConfig;
  suppressWhenFocused: boolean;
  notifyOnIdle: boolean;
  delayMs: Record<string, number>;
  notifyChildSessions: boolean;
  soundCommand: string | null;
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  desktop: {
    enabled: true,
    events: ["idle", "error", "permission", "question"],
  },
  sound: {
    enabled: true,
    events: {
      idle: "ding.wav",
      error: "alert.wav",
      permission: "ping.wav",
      question: "ping.wav",
      cancel: "alert.wav",
      subagent: "ding.wav",
    },
    default: "ding.wav",
    customDir: "",
  },
  filter: {
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00",
    },
    minInterval: 5,
  },
  suppressWhenFocused: true,
  notifyOnIdle: true,
  delayMs: {
    idle: 1500,
    error: 500,
    permission: 800,
    question: 800,
    cancel: 0,
    subagent: 1000,
  },
  notifyChildSessions: true,
  soundCommand: null,
};

export function stripJsonComments(str: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < str.length) {
    if (inString) {
      if (str[i] === "\\" && i + 1 < str.length) {
        result += str[i] + str[i + 1];
        i += 2;
        continue;
      }
      if (str[i] === '"') {
        inString = false;
      }
      result += str[i];
      i++;
    } else {
      if (str[i] === '"') {
        inString = true;
        result += str[i];
        i++;
      } else if (str[i] === "/" && i + 1 < str.length && str[i + 1] === "/") {
        while (i < str.length && str[i] !== "\n") {
          i++;
        }
      } else if (str[i] === "/" && i + 1 < str.length && str[i + 1] === "*") {
        i += 2;
        while (
          i < str.length &&
          !(str[i] === "*" && i + 1 < str.length && str[i + 1] === "/")
        ) {
          i++;
        }
        i += 2;
      } else {
        result += str[i];
        i++;
      }
    }
  }
  return result;
}

function readJsonc(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(stripJsonComments(content));
  } catch {
    return null;
  }
}

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>,
      );
    } else {
      result[key] = sv;
    }
  }
  return result as T;
}

export function loadConfig(
  projectDir: string,
  _worktree?: string,
): AlertConfig {
  const envPath = process.env.OPENCODE_ALERT_CONFIG;
  const globalPath = join(homedir(), ".config", "opencode", "alert.jsonc");
  const projectPath1 = join(projectDir, ".opencode", "alert.jsonc");
  const projectPath2 = join(projectDir, "alert.jsonc");

  const globalConfig = readJsonc(globalPath) ?? {};
  const projectConfig =
    readJsonc(projectPath1) ?? readJsonc(projectPath2) ?? {};
  const envConfig = envPath ? (readJsonc(envPath) ?? {}) : {};

  const merged = deepMerge(
    deepMerge(DEFAULT_CONFIG, globalConfig),
    deepMerge(projectConfig, envConfig),
  );

  const soundCmdEnv = process.env.OPENCODE_ALERT_SOUND_CMD;
  if (soundCmdEnv !== undefined) {
    const trimmed = soundCmdEnv.trim();
    (merged as Record<string, unknown>).soundCommand =
      trimmed.length > 0 ? trimmed : null;
  } else if (
    typeof (merged as Record<string, unknown>).soundCommand === "string"
  ) {
    const trimmed = (
      (merged as Record<string, unknown>).soundCommand as string
    ).trim();
    (merged as Record<string, unknown>).soundCommand =
      trimmed.length > 0 ? trimmed : null;
  }

  if (!existsSync(globalPath)) {
    try {
      mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
      writeFileSync(globalPath, GENERATED_CONFIG_JSONC, "utf-8");
    } catch {
      // Auto-generation is best-effort
    }
  }

  return merged as AlertConfig;
}

const GENERATED_CONFIG_JSONC = `{
  // Global toggle for the plugin
  "enabled": true,
  // Desktop notification settings
  "desktop": {
    "enabled": true,
    // Which events trigger desktop notifications: idle, error, permission, question, cancel, subagent
    "events": ["idle", "error", "permission", "question"]
  },
  // Sound notification settings
  "sound": {
    "enabled": true,
    // Sound file per event type (built-in: ding.wav, alert.wav, ping.wav)
    "events": {
      "idle": "ding.wav",
      "error": "alert.wav",
      "permission": "ping.wav",
      "question": "ping.wav",
      "cancel": "alert.wav",
      "subagent": "ding.wav"
    },
    "default": "ding.wav",
    // Directory for custom sound files (leave empty for built-in sounds only)
    "customDir": ""
  },
  // Filter settings
  "filter": {
    "quietHours": {
      "enabled": false,
      "start": "22:00",
      "end": "08:00"
    },
    // Minimum seconds between same-type notifications
    "minInterval": 5
  },
  // Suppress notifications when terminal is focused
  "suppressWhenFocused": true,
  // Send notification on session idle
  "notifyOnIdle": true,
  // Send notification when child sessions (subagents) complete
  "notifyChildSessions": true,
  // Delay in milliseconds before sending notifications per event type (0 = no delay)
  // Useful when notifications arrive before the TUI finishes rendering results
  "delayMs": {
    "idle": 1500,
    "error": 500,
    "permission": 800,
    "question": 800,
    "cancel": 0,
    "subagent": 1000
  },
  // Custom shell command for sound playback (overrides platform-native). Use {sound} placeholder for the resolved sound file path
  "soundCommand": null
}
`;
