import { execSync } from "node:child_process";

export interface TerminalInfo {
  key: string;
  name: string;
  bundleID: string | null;
  processName: string | null;
  protocol: "osc777" | "osc9" | "osc99" | "windows-toast" | null;
}

const TERMINALS: TerminalInfo[] = [
  {
    key: "ghostty",
    name: "Ghostty",
    bundleID: "com.mitchellh.ghostty",
    processName: "ghostty",
    protocol: "osc777",
  },
  {
    key: "iterm2",
    name: "iTerm2",
    bundleID: "com.googlecode.iterm2",
    processName: "iTerm2",
    protocol: "osc9",
  },
  {
    key: "wezterm",
    name: "WezTerm",
    bundleID: "com.github.wez.wezterm",
    processName: "wezterm-gui",
    protocol: "osc777",
  },
  {
    key: "apple-terminal",
    name: "Terminal",
    bundleID: "com.apple.Terminal",
    processName: null,
    protocol: null,
  },
  {
    key: "kitty",
    name: "Kitty",
    bundleID: "net.kovidgoyal.kitty",
    processName: "kitty",
    protocol: "osc99",
  },
  {
    key: "alacritty",
    name: "Alacritty",
    bundleID: "org.alacritty",
    processName: "alacritty",
    protocol: null,
  },
  {
    key: "hyper",
    name: "Hyper",
    bundleID: "co.zeit.hyper",
    processName: "hyper",
    protocol: null,
  },
  {
    key: "windows-terminal",
    name: "Windows Terminal",
    bundleID: null,
    processName: "WindowsTerminal",
    protocol: "windows-toast",
  },
];

const TERM_PROGRAM_MAP: Record<string, string> = {
  ghostty: "ghostty",
  "iTerm.app": "iterm2",
  WezTerm: "wezterm",
  Apple_Terminal: "apple-terminal",
  Hyper: "hyper",
};

export function detectTerminal(
  configOverride?: string | null,
): TerminalInfo | null {
  if (configOverride) {
    const normalized = configOverride
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const found = TERMINALS.find((t) => t.key === normalized);
    if (found) return found;
  }

  const env = process.env;

  if (env.TERM_PROGRAM) {
    const mapped = TERM_PROGRAM_MAP[env.TERM_PROGRAM];
    if (mapped) {
      const found = TERMINALS.find((t) => t.key === mapped);
      if (found) return found;
    }
  }

  if (env.GHOSTTY_RESOURCES_DIR) {
    const found = TERMINALS.find((t) => t.key === "ghostty");
    if (found) return found;
  }

  if (env.LC_TERMINAL === "iTerm2") {
    const found = TERMINALS.find((t) => t.key === "iterm2");
    if (found) return found;
  }

  if (env.KITTY_WINDOW_ID) {
    const found = TERMINALS.find((t) => t.key === "kitty");
    if (found) return found;
  }

  if (env.TERM === "alacritty") {
    const found = TERMINALS.find((t) => t.key === "alacritty");
    if (found) return found;
  }

  if (env.WT_SESSION) {
    const found = TERMINALS.find((t) => t.key === "windows-terminal");
    if (found) return found;
  }

  return null;
}

const FOCUS_CACHE_TTL_MS = 1500;
let focusCache = { focused: false, ts: 0 };

export function isTerminalFocused(terminal: TerminalInfo | null): boolean {
  if (!terminal) return false;
  if (!terminal.processName && !terminal.bundleID) return false;

  const now = Date.now();
  if (now - focusCache.ts < FOCUS_CACHE_TTL_MS) return focusCache.focused;

  const focused = checkFocus(terminal);
  focusCache = { focused, ts: now };
  return focused;
}

function checkFocus(terminal: TerminalInfo): boolean {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const result = execSync(
        `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
        { encoding: "utf-8", timeout: 2000, stdio: ["ignore", "pipe", "pipe"] },
      );
      const frontApp = result.trim().toLowerCase();
      return frontApp === terminal.name.toLowerCase();
    }
    if (platform === "linux") {
      const windowId = execSync("xdotool getactivewindow", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (!/^\d+$/.test(windowId)) return false;
      const pid = execSync(`xdotool getwindowpid "${windowId}"`, {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (!/^\d+$/.test(pid)) return false;
      const comm = execSync(`cat /proc/${pid}/comm`, {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      return comm === terminal.processName;
    }
  } catch {
    // Detection failed — return false (notification sends)
  }
  return false;
}

let cachedProtocol: string | null = null;

export function detectProtocol(): string | null {
  if (cachedProtocol !== null) return cachedProtocol;

  let result: string | null = null;

  if (process.env.WT_SESSION) {
    result = "windows-toast";
  } else if (process.env.KITTY_WINDOW_ID) {
    result = "osc99";
  } else if (
    process.env.TERM_PROGRAM === "iTerm.app" ||
    process.env.ITERM_SESSION_ID
  ) {
    result = "osc9";
  } else {
    result = "osc777";
  }

  cachedProtocol = result;
  return result;
}
