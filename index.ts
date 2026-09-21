import { type AlertConfig, loadConfig } from "./src/config.js";
import { dispatch } from "./src/notify.js";
import { type TerminalInfo, detectTerminal } from "./src/terminal.js";
import { ensureAumidRegistered } from "./src/win-aumid.js";

interface V2Event {
  id: string;
  type: string;
  created?: number;
  data: unknown;
}

interface SessionInfoLike {
  parentID?: string;
  title?: string;
}

interface PluginContext {
  location: { directory: string };
  event: {
    subscribe(opts?: { signal?: AbortSignal }): AsyncIterable<V2Event>;
  };
  session?: {
    get(args: { sessionID: string }): Promise<SessionInfoLike>;
  };
}

const RESUBSCRIBE_DELAY_MS = 500;

export default {
  id: "@chousyn/opencode-alert",
  async setup(ctx: PluginContext) {
    const config = loadConfig(ctx.location.directory);
    ensureAumidRegistered();
    const terminal = detectTerminal();

    if (!config.enabled) {
      return;
    }

    const controller = new AbortController();
    void runLoop(ctx, config, terminal, controller.signal);

    return () => {
      controller.abort();
    };
  },
};

async function runLoop(
  ctx: PluginContext,
  config: AlertConfig,
  terminal: TerminalInfo | null,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      for await (const event of ctx.event.subscribe({ signal })) {
        try {
          await dispatch(event, config, ctx, terminal);
        } catch (e) {
          console.error("[opencode-alert] event handling failed:", e);
        }
      }
    } catch (e) {
      if (signal.aborted) break;
      console.error("[opencode-alert] event stream error:", e);
      await delay(RESUBSCRIBE_DELAY_MS, signal);
    }
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
