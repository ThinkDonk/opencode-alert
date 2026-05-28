import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AlertEventType } from "./events.js";

export interface QuietHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
}

export interface FilterConfig {
  skipOnFocus: boolean;
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
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  desktop: {
    enabled: true,
    events: ["idle", "error", "permission"],
  },
  sound: {
    enabled: true,
    events: {
      idle: "ding.wav",
      error: "alert.wav",
      permission: "ping.wav",
    },
    default: "ding.wav",
    customDir: "",
  },
  filter: {
    skipOnFocus: true,
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00",
    },
    minInterval: 5,
  },
};

function stripJsonComments(str: string): string {
  return str
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
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
      sv && typeof sv === "object" && !Array.isArray(sv) &&
      tv && typeof tv === "object" && !Array.isArray(tv)
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
  const envConfig = envPath ? readJsonc(envPath) ?? {} : {};

  const merged = deepMerge(
    deepMerge(DEFAULT_CONFIG, globalConfig),
    deepMerge(projectConfig, envConfig),
  );

  return merged as AlertConfig;
}
