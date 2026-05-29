import { existsSync, readFileSync } from "node:fs";
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
  notifyChildSessions: boolean;
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
  notifyChildSessions: true,
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

  return merged as AlertConfig;
}
