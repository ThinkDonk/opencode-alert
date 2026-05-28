import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deepMerge, loadConfig } from "./config.js";

vi.mock("node:os", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:os")>();
  const tmp = mod.tmpdir();
  return {
    ...mod,
    homedir: () => join(tmp, "mock-home-opencode-alert"),
  };
});

describe("deepMerge", () => {
  it("shallow merge: source overrides target keys", () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("deep merge: nested objects are merged recursively", () => {
    const result = deepMerge(
      { nested: { x: 1, y: 2 }, keep: "me" },
      { nested: { y: 3, z: 4 } },
    );
    expect(result).toEqual({ nested: { x: 1, y: 3, z: 4 }, keep: "me" });
  });

  it("arrays are replaced, not merged", () => {
    const result = deepMerge({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result).toEqual({ arr: [4, 5] });
  });

  it("null source values override target", () => {
    const result = deepMerge({ a: "hello", b: 2 }, { a: null });
    expect(result).toEqual({ a: null, b: 2 });
  });

  it("undefined source values override target", () => {
    const result = deepMerge({ a: "hello" }, { a: undefined });
    expect(result).toEqual({ a: undefined });
  });

  it("empty source returns target unchanged", () => {
    const target = { a: 1, b: { c: 2 } };
    const result = deepMerge(target, {});
    expect(result).toEqual({ a: 1, b: { c: 2 } });
    expect(result).not.toBe(target);
  });

  it("does not mutate the original target", () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
  });

  it("deeply nested objects merge correctly", () => {
    const result = deepMerge(
      { a: { b: { c: 1, d: 2 } } },
      { a: { b: { d: 3, e: 4 } } },
    );
    expect(result).toEqual({ a: { b: { c: 1, d: 3, e: 4 } } });
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `opencode-alert-test-${Date.now()}`);
    mkdirSync(join(tmpDir, ".opencode"), { recursive: true });
  });

  afterAll(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns default config when no config files exist", () => {
    const config = loadConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.desktop.enabled).toBe(true);
    expect(config.filter.quietHours.enabled).toBe(false);
    expect(config.filter.minInterval).toBe(5);
  });

  it("project config overrides defaults", () => {
    const configPath = join(tmpDir, ".opencode", "alert.jsonc");
    writeFileSync(
      configPath,
      JSON.stringify({ enabled: false, filter: { minInterval: 10 } }),
      "utf-8",
    );

    const config = loadConfig(tmpDir);
    expect(config.enabled).toBe(false);
    expect(config.desktop.enabled).toBe(true);
    expect(config.filter.minInterval).toBe(10);

    rmSync(configPath, { force: true });
  });

  it("parses JSONC with comments correctly", () => {
    const configPath = join(tmpDir, ".opencode", "alert.jsonc");
    writeFileSync(
      configPath,
      `{
  // This is a comment
  "enabled": false,
  "filter": {
    "skipOnFocus": true
    /*
      Multi-line comment
    */
  }
}`,
      "utf-8",
    );

    const config = loadConfig(tmpDir);
    expect(config.enabled).toBe(false);

    rmSync(configPath, { force: true });
  });

  it("project config deeply merges nested settings", () => {
    const configPath = join(tmpDir, ".opencode", "alert.jsonc");
    writeFileSync(
      configPath,
      JSON.stringify({
        desktop: { events: ["idle"] },
        sound: { default: "custom.wav" },
      }),
      "utf-8",
    );

    const config = loadConfig(tmpDir);
    expect(config.desktop.events).toEqual(["idle"]);
    expect(config.desktop.enabled).toBe(true);
    expect(config.sound.default).toBe("custom.wav");
    expect(config.sound.events).toBeDefined();

    rmSync(configPath, { force: true });
  });

  it("alert.jsonc at project root also works", () => {
    const configPath = join(tmpDir, "alert.jsonc");
    writeFileSync(
      configPath,
      JSON.stringify({ enabled: false }),
      "utf-8",
    );

    const config = loadConfig(tmpDir);
    expect(config.enabled).toBe(false);

    rmSync(configPath, { force: true });
  });
});
