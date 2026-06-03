import { loadConfig } from "./src/config.js";
import { dispatch } from "./src/notify.js";
import { detectTerminal } from "./src/terminal.js";

interface PluginInitContext {
  project: unknown;
  client: unknown;
  $: any;
  directory: string;
  worktree?: string;
}

export default async function opencodeAlert(ctx: PluginInitContext) {
  const config = loadConfig(ctx.directory, ctx.worktree);
  const terminal = detectTerminal();

  if (!config.enabled) {
    return {};
  }

  return {
    event: async ({ event }: { event: unknown }) => {
      await dispatch(event, config, ctx, terminal);
    },
  };
}
