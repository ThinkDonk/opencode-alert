import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AUMID = "OpenCode";
const REG_KEY = `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`;

let __dirname: string;
try {
  __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
  __dirname = ".";
}

let registration: Promise<void> | undefined;

function runReg(args: string[], timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile("reg", args, { timeout, windowsHide: true }, (error) => {
        resolve(!error);
      });
    } catch {
      resolve(false);
    }
  });
}

async function registerAumid(): Promise<void> {
  try {
    if (await runReg(["query", REG_KEY, "/v", "DisplayName"], 3000)) return;
    if (!(await runReg(["add", REG_KEY, "/ve", "/d", AUMID, "/f"], 5000))) {
      return;
    }
    if (
      !(await runReg(
        [
          "add",
          REG_KEY,
          "/v",
          "DisplayName",
          "/t",
          "REG_EXPAND_SZ",
          "/d",
          AUMID,
          "/f",
        ],
        5000,
      ))
    ) {
      return;
    }
    const iconPath = join(__dirname, "..", "icon.png");
    if (existsSync(iconPath)) {
      await runReg(
        [
          "add",
          REG_KEY,
          "/v",
          "IconUri",
          "/t",
          "REG_EXPAND_SZ",
          "/d",
          iconPath,
          "/f",
        ],
        5000,
      );
    }
  } catch {}
}

export async function ensureAumidRegistered(): Promise<void> {
  if (process.platform !== "win32") return;
  registration ??= registerAumid();
  await registration;
}
