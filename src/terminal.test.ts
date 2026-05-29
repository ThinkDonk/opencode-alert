import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectTerminal, isTerminalFocused } from "./terminal.js";
import type { TerminalInfo } from "./terminal.js";

const savedEnv = { ...process.env };

function clearTerminalEnv() {
  process.env.TERM_PROGRAM = undefined;
  process.env.GHOSTTY_RESOURCES_DIR = undefined;
  process.env.LC_TERMINAL = undefined;
  process.env.KITTY_WINDOW_ID = undefined;
  process.env.TERM = undefined;
  process.env.WT_SESSION = undefined;
}

function setTerminalEnv() {
  process.env = { ...savedEnv };
  clearTerminalEnv();
}

describe("detectTerminal", () => {
  beforeEach(() => {
    setTerminalEnv();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("config override: valid key returns matching terminal", () => {
    const result = detectTerminal("ghostty");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("ghostty");
  });

  it("config override: unknown key returns null", () => {
    const result = detectTerminal("nonexistent-terminal");
    expect(result).toBeNull();
  });

  it("TERM_PROGRAM: Ghostty", () => {
    process.env.TERM_PROGRAM = "ghostty";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("ghostty");
  });

  it("TERM_PROGRAM: iTerm2", () => {
    process.env.TERM_PROGRAM = "iTerm.app";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("iterm2");
  });

  it("TERM_PROGRAM: WezTerm", () => {
    process.env.TERM_PROGRAM = "WezTerm";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("wezterm");
  });

  it("TERM_PROGRAM: Apple Terminal", () => {
    process.env.TERM_PROGRAM = "Apple_Terminal";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("apple-terminal");
  });

  it("TERM_PROGRAM: Hyper", () => {
    process.env.TERM_PROGRAM = "Hyper";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("hyper");
  });

  it("GHOSTTY_RESOURCES_DIR fallback", () => {
    process.env.GHOSTTY_RESOURCES_DIR = "/path/to/ghostty";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("ghostty");
  });

  it("LC_TERMINAL for iTerm2", () => {
    process.env.LC_TERMINAL = "iTerm2";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("iterm2");
  });

  it("KITTY_WINDOW_ID for Kitty", () => {
    process.env.KITTY_WINDOW_ID = "12345";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("kitty");
  });

  it("TERM for Alacritty", () => {
    process.env.TERM = "alacritty";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("alacritty");
  });

  it("WT_SESSION for Windows Terminal", () => {
    process.env.WT_SESSION = "abc-123";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("windows-terminal");
  });

  it("no env vars returns null", () => {
    const result = detectTerminal();
    expect(result).toBeNull();
  });

  it("TERM_PROGRAM takes precedence over other env vars", () => {
    process.env.TERM_PROGRAM = "ghostty";
    process.env.GHOSTTY_RESOURCES_DIR = "/ghostty";
    process.env.KITTY_WINDOW_ID = "12345";
    const result = detectTerminal();
    expect(result).not.toBeNull();
    expect(result?.key).toBe("ghostty");
  });
});

describe("isTerminalFocused", () => {
  it("returns false for null terminal", () => {
    expect(isTerminalFocused(null)).toBe(false);
  });

  it("returns false for terminal without processName or bundleID (apple-terminal)", () => {
    const appleTerm: TerminalInfo = {
      key: "apple-terminal",
      name: "Terminal",
      bundleID: "com.apple.Terminal",
      processName: null,
      protocol: null,
    };
    expect(isTerminalFocused(appleTerm)).toBe(false);
  });
});
