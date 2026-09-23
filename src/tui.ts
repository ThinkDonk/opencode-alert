import { type AlertConfig, loadConfig } from "./config.js";
import { dispatch } from "./notify.js";

interface SessionInfo {
  parentID?: string;
  title?: string;
  location?: { directory: string; workspaceID?: string };
}

interface Event {
  id: string;
  type: string;
  data: unknown;
}

interface TuiContext {
  location?: { directory: string; workspaceID?: string };
  data: {
    on(type: string, handler: (event: Event) => void): () => void;
    session: {
      get(sessionID: string): SessionInfo | undefined;
      root(sessionID: string): string;
    };
    location: { default(): { directory: string } };
  };
  ui: {
    tabs: {
      enabled(): boolean;
      list(): readonly { sessionID: string }[];
    };
    router: {
      current(): { type: string; sessionID?: string };
    };
  };
  renderer: {
    readonly isDestroyed: boolean;
    on(event: "focus" | "blur", listener: () => void): unknown;
    off(event: "focus" | "blur", listener: () => void): unknown;
  };
}

const EVENTS = [
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "permission.asked",
  "form.created",
  "session.tool.input.started",
  "session.tool.success",
] as const;

function sessionIDOf(event: Event): string | undefined {
  if (!event.data || typeof event.data !== "object") return;
  const data = event.data as Record<string, unknown>;
  const form = data.form;
  const value =
    form && typeof form === "object"
      ? (form as Record<string, unknown>).sessionID
      : data.sessionID;
  return typeof value === "string" ? value : undefined;
}

function isOpen(ctx: TuiContext, sessionID: string): boolean {
  try {
    if (ctx.renderer.isDestroyed) return false;
    const root = ctx.data.session.root(sessionID);
    if (ctx.ui.tabs.enabled()) {
      return ctx.ui.tabs.list().some((tab) => tab.sessionID === root);
    }
    const route = ctx.ui.router.current();
    return (
      route.type === "session" &&
      !!route.sessionID &&
      ctx.data.session.root(route.sessionID) === root
    );
  } catch {
    return false;
  }
}

export default {
  id: "@chousyn/opencode-alert",
  setup(ctx: TuiContext) {
    const controller = new AbortController();
    const configs = new Map<string, AlertConfig>();
    const toolCallNames = new Map<string, string>();
    const subscriptions: (() => void)[] = [];
    let focused: boolean | undefined;
    const onFocus = () => {
      focused = true;
    };
    const onBlur = () => {
      focused = false;
    };
    const cleanup = () => {
      controller.abort();
      for (const unsubscribe of subscriptions.splice(0)) {
        try {
          unsubscribe();
        } catch {}
      }
      try {
        ctx.renderer.off("focus", onFocus);
      } catch {}
      try {
        ctx.renderer.off("blur", onBlur);
      } catch {}
      configs.clear();
      toolCallNames.clear();
    };
    const handle = (event: Event) => {
      try {
        const sessionID = sessionIDOf(event);
        if (controller.signal.aborted || !sessionID || !isOpen(ctx, sessionID))
          return;
        const info = ctx.data.session.get(sessionID);
        const directory =
          info?.location?.directory ??
          ctx.location?.directory ??
          ctx.data.location.default().directory;
        let config = configs.get(directory);
        if (!config) {
          config = loadConfig(directory);
          configs.set(directory, config);
        }
        if (!config.enabled) return;
        void dispatch(
          event,
          config,
          {
            session: {
              get: async ({ sessionID }) => ctx.data.session.get(sessionID),
            },
            shouldNotify: () => isOpen(ctx, sessionID),
            isFocused: () => focused === true,
            toolCallNames,
          },
          null,
          controller.signal,
        ).catch(() => {});
      } catch {}
    };
    try {
      ctx.renderer.on("focus", onFocus);
      ctx.renderer.on("blur", onBlur);
      for (const type of EVENTS) subscriptions.push(ctx.data.on(type, handle));
    } catch {
      cleanup();
    }
    return cleanup;
  },
};
