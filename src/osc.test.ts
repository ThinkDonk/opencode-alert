import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatOSC9,
  formatOSC99,
  formatOSC777,
  sanitizeOSC,
  wrapForTmux,
} from "./osc.js";

describe("sanitizeOSC", () => {
  it("normal text passes through", () => {
    expect(sanitizeOSC("Hello World")).toBe("Hello World");
  });

  it("C0 control chars (0x00-0x1F) are stripped", () => {
    expect(sanitizeOSC("Hello\x00World\x1F!")).toBe("HelloWorld!");
  });

  it("DEL (0x7F) is stripped", () => {
    expect(sanitizeOSC("Hello\x7FWorld")).toBe("HelloWorld");
  });

  it("C1 control chars (0x80-0x9F) are stripped", () => {
    expect(sanitizeOSC("Hello\x80World\x9F!")).toBe("HelloWorld!");
  });

  it("printable ASCII and Unicode are preserved", () => {
    expect(sanitizeOSC("abc123!@#")).toBe("abc123!@#");
    expect(sanitizeOSC("你好世界")).toBe("你好世界");
  });

  it("empty string returns empty", () => {
    expect(sanitizeOSC("")).toBe("");
  });

  it("whitespace (space) is preserved", () => {
    expect(sanitizeOSC("hello world test")).toBe("hello world test");
  });
});

describe("formatOSC777", () => {
  it("correct format with title and body", () => {
    const result = formatOSC777("Title", "Body text");
    expect(result).toBe("\x1b]777;notify;Title;Body text\x07");
  });

  it("content is sanitized", () => {
    const result = formatOSC777("Title\x00", "Body\x1F");
    expect(result).toBe("\x1b]777;notify;Title;Body\x07");
  });
});

describe("formatOSC9", () => {
  it("correct format with title and body", () => {
    const result = formatOSC9("Title", "Body text");
    expect(result).toBe("\x1b]9;Title: Body text\x07");
  });

  it("content is sanitized", () => {
    const result = formatOSC9("Title\x00", "Body\x1F");
    expect(result).toBe("\x1b]9;Title: Body\x07");
  });
});

describe("formatOSC99", () => {
  it("two parts with matching IDs", () => {
    const result = formatOSC99("Title", "Body text");
    const esc = "\x1b";
    expect(result).toContain(`${esc}]99;i=`);
    expect(result).toContain(":d=0;Title");
    expect(result).toContain(":p=body;Body text");
  });

  it("monotonic counter increments", () => {
    const first = formatOSC99("First", "First body");
    const second = formatOSC99("Second", "Second body");
    const match1 = first.match(/i=(\d+)/);
    const match2 = second.match(/i=(\d+)/);
    if (!match1 || !match2) {
      throw new Error("formatOSC99 did not produce expected counter IDs");
    }
    expect(Number(match2[1])).toBeGreaterThan(Number(match1[1]));
  });
});

describe("wrapForTmux", () => {
  it("wraps in DCS passthrough", () => {
    const sequence = "\x1b]777;notify;Test\x07";
    const wrapped = wrapForTmux(sequence);
    expect(wrapped).toBe("\x1bPtmux;\x1b\x1b]777;notify;Test\x07\x1b\\");
  });

  it("ESC bytes are doubled inside", () => {
    const sequence = "abc\x1bdef";
    const wrapped = wrapForTmux(sequence);
    expect(wrapped).toBe("\x1bPtmux;abc\x1b\x1bdef\x1b\\");
  });

  it("returns sequence unchanged if no ESC bytes", () => {
    const sequence = "plain text";
    const wrapped = wrapForTmux(sequence);
    expect(wrapped).toBe("\x1bPtmux;plain text\x1b\\");
  });
});
