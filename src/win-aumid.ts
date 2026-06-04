import { execSync } from "node:child_process";
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

function isAumidRegistered(): boolean {
  try {
    execSync(`reg query "${REG_KEY}" /v DisplayName`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

function registerAumid(iconPath: string): void {
  try {
    execSync(`reg add "${REG_KEY}" /ve /d "${AUMID}" /f`, {
      stdio: "ignore",
      timeout: 5000,
    });
    execSync(
      `reg add "${REG_KEY}" /v DisplayName /t REG_EXPAND_SZ /d "OpenCode" /f`,
      { stdio: "ignore", timeout: 5000 },
    );
    if (existsSync(iconPath)) {
      execSync(
        `reg add "${REG_KEY}" /v IconUri /t REG_EXPAND_SZ /d "${iconPath}" /f`,
        { stdio: "ignore", timeout: 5000 },
      );
    }
  } catch {
    // Registration is best-effort
  }
}

export function ensureAumidRegistered(): void {
  if (process.platform !== "win32") return;
  if (isAumidRegistered()) return;

  const iconPath = join(__dirname, "..", "icon.png");
  registerAumid(iconPath);
}
