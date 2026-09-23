import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EVENT_DIRECTORY = join(homedir(), ".config", "opencode", "alert-events");
const RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_MEMORY_ENTRIES = 2000;
const claimedEvents = new Map<string, number>();
let lastCleanup = 0;

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  try {
    for (const name of readdirSync(EVENT_DIRECTORY)) {
      if (!/^[a-f0-9]{64}\.claim$/.test(name)) continue;
      try {
        const path = join(EVENT_DIRECTORY, name);
        if (now - statSync(path).mtimeMs > RETENTION_MS) unlinkSync(path);
      } catch {}
    }
  } catch {}
}

export function claimEvent(eventID: string | undefined): boolean {
  if (!eventID) return true;
  const now = Date.now();
  const key = createHash("sha256").update(eventID).digest("hex");
  const claimedAt = claimedEvents.get(key);
  if (claimedAt !== undefined && now - claimedAt < RETENTION_MS) return false;

  cleanup(now);
  let claimed = true;
  try {
    mkdirSync(EVENT_DIRECTORY, { recursive: true });
    writeFileSync(join(EVENT_DIRECTORY, `${key}.claim`), "", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") claimed = false;
  }
  claimedEvents.delete(key);
  claimedEvents.set(key, now);
  while (claimedEvents.size > MAX_MEMORY_ENTRIES) {
    const oldest = claimedEvents.keys().next();
    if (oldest.done) break;
    claimedEvents.delete(oldest.value);
  }
  return claimed;
}
