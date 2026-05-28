import { loadConfig } from "./src/config.js";
import { dispatch, updateCurrentSession } from "./src/notify.js";

interface PluginInitContext {
  project: unknown;
  client: unknown;
  $: any;
  directory: string;
  worktree?: string;
}

export default async function opencodeAlert(ctx: PluginInitContext) {
  const config = loadConfig(ctx.directory, ctx.worktree);

  if (!config.enabled) {
    return {};
  }

  return {
    event: async ({ event }: { event: unknown }) => {
      updateCurrentSession(event);
      await dispatch(event, config, ctx);
    },
    "permission.ask": async (_input: unknown, _output: unknown) => {
      await dispatch(
        { type: "permission.updated", properties: _input },
        config,
        ctx,
      );
    },
  };
}
