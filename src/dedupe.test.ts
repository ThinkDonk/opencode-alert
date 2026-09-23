import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ModuleKind, transpileModule } from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const home = mkdtempSync(
    join(actual.tmpdir(), "opencode-alert-dedupe-test-"),
  );
  return { ...actual, homedir: () => home };
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("node:fs");
  vi.resetModules();
});

describe("event claims", () => {
  it("atomically claims an event across independent Node processes", async () => {
    const source = readFileSync(
      new URL("./dedupe.ts", import.meta.url),
      "utf-8",
    );
    const { outputText } = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext },
    });
    const moduleURL = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
    const script = `import { claimEvent } from ${JSON.stringify(moduleURL)}; process.stdout.write(String(claimEvent("evt_process_shared")));`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        promisify(execFile)(
          process.execPath,
          ["--input-type=module", "-e", script],
          {
            env: { ...process.env, HOME: homedir(), USERPROFILE: homedir() },
            windowsHide: true,
          },
        ),
      ),
    );
    expect(results.filter(({ stdout }) => stdout === "true")).toHaveLength(1);
    expect(results.filter(({ stdout }) => stdout === "false")).toHaveLength(5);
  });

  it("cleans claims older than 24 hours without removing recent claims", async () => {
    const { claimEvent } = await import("./dedupe.js");
    expect(claimEvent("evt_expired")).toBe(true);
    const directory = join(homedir(), ".config", "opencode", "alert-events");
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const name of readdirSync(directory)) {
      utimesSync(join(directory, name), expired, expired);
    }
    vi.resetModules();
    const fresh = await import("./dedupe.js");
    expect(fresh.claimEvent("evt_recent")).toBe(true);
    expect(readdirSync(directory)).toHaveLength(1);
    expect(fresh.claimEvent("evt_expired")).toBe(true);
    expect(readdirSync(directory)).toHaveLength(2);
    expect(fresh.claimEvent("evt_recent")).toBe(false);
  });

  it("falls back to memory when persistence is unavailable", async () => {
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        writeFileSync: () => {
          throw Object.assign(new Error("unavailable"), { code: "EACCES" });
        },
      };
    });
    const { claimEvent } = await import("./dedupe.js");
    expect(claimEvent("evt_fallback")).toBe(true);
    expect(claimEvent("evt_fallback")).toBe(false);
    expect(claimEvent("evt_fallback_next")).toBe(true);
  });
});
