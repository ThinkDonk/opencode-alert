[中文文档](README-zh.md)

# opencode-alert

TUI notification plugin for [OpenCode](https://opencode.ai) v2 — desktop and sound alerts for sessions open in each window, with project-level configuration.

## Features

- Desktop notifications (Windows Toast, macOS Notification Center, Linux notify-send)
- Sound alerts with custom audio file support
- Window-local session filtering, including inactive open tabs
- Smart filtering: quiet hours, throttle
- Project-level configuration with deep merge
- Zero context pollution (no tools or prompts injected)

## Tech Stack

- **Runtime**: TypeScript (strict ESM), Node.js ≥18
- **Plugin format**: OpenCode v2 plugin (`{ id, setup }` default export, loaded as TS source — no build step)
- **Test**: Vitest
- **Lint**: Biome
- **Desktop notifications**: OS shell commands (osascript / notify-send / PowerShell toast with AUMID)
- **Sound**: Platform-native commands (afplay / ffplay / PowerShell)
- **Config**: JSONC with deep merge and JSON Schema validation

## Installation

The TUI migration described here is **Unreleased**. Use a local checkout containing these changes; the published 2.0.0 package does not include this migration.

### Configure the TUI

Add the local plugin directory to `plugins` in `tui.json` (for example, `~/.config/opencode/tui.json`):

```json
{
  "plugins": ["file:///path/to/opencode-alert"]
}
```

On Windows, use a URL such as `file:///D:/projects/opencode-alert`. Reload the plugin or restart the TUI after updating the checkout.

Existing `opencode.json` plugin references can remain: the server entry only registers the plugin so the TUI can discover its TUI feature; it does not subscribe to events or send notifications. Avoid adding duplicate references through several installation methods.

### Project discovery and entry points

Alternatively, copy this checkout into `.opencode/plugins/opencode-alert/` (plural `plugins`). Local discovery requires a plugin directory. The physical `tui.ts` file is the TUI entry; `index.ts` is the inactive server compatibility entry. Package exports provide `./tui` plus `.` and `./server`.

## Configuration

Create `~/.config/opencode/alert.jsonc` (global) or `.opencode/alert.jsonc` (project):

```jsonc
{
  // Global toggle
  "enabled": true,

  // Desktop notifications
  "desktop": {
    "enabled": true,
    "events": ["idle", "error", "permission"]
  },

  // Sound notifications
  "sound": {
    "enabled": true,
    "events": {
      "idle": "ding.wav",
      "error": "alert.wav",
      "permission": "ping.wav"
    },
    "default": "ding.wav",
    "customDir": "~/.config/opencode/alert-sounds/"
  },

  // Smart filtering
  "filter": {
    "quietHours": {
      "enabled": false,
      "start": "22:00",
      "end": "08:00"
    },
    "minInterval": 5
  }
}
```

### Config Search Order

1. `OPENCODE_ALERT_CONFIG` environment variable
2. `.opencode/alert.jsonc` (project)
3. `alert.jsonc` (project root)
4. `~/.config/opencode/alert.jsonc` (global)

Project config overrides global config (deep merge). The TUI loads configuration on this machine using the event session's directory. If session metadata is unavailable, it uses the TUI location or its default location. Configurations are cached per directory until plugin reload, so open tabs from different projects retain their own settings.

With `suppressWhenFocused: true`, focus is tracked from this TUI renderer's `focus` and `blur` events. Before either event has arrived, focus is unknown and notifications are allowed as a best-effort fallback. The plugin does not inspect other terminal processes to infer this window's focus.

### Minimal Config

```jsonc
{ "enabled": true }
```

## Events

The plugin subscribes to OpenCode v2 events and maps them to internal alert types:

| v2 Event | Internal Alert | Trigger | Data Used |
|----------|----------------|---------|-----------|
| `session.execution.succeeded` | `idle` — Task Completed | AI turn finished | `sessionID` |
| `session.execution.failed` | `error` — Error Occurred | Execution error | `sessionID`, `error` |
| `session.execution.interrupted` | `cancel` — Cancelled | User interruption only (`reason === "user"`) | `sessionID`, `reason` |
| `permission.asked` | `permission` — Permission Required | Permission request | `message`, or `action` + `resources` |
| `form.created` | `question` — Question | Form prompt raised | `form.title`, `form.fields` |
| `session.tool.input.started` | — (recorded) | Tool call started; name recorded by call ID | `id`, `name` |
| `session.tool.success` | `subagent` — Subagent Done | `task` tool completion, matched via call ID | `id`, `content` |

Only sessions open in this TUI window are eligible. With tabs enabled, all open root-session tabs are included, even when inactive. Without tabs, only the current session page and its family are included; home and plugin pages receive no session alerts. Permissions and questions from child sessions can notify through their open parent tab. Child-session completion events remain excluded from the parent task's completion alert.

The plugin deduplicates envelope event IDs for 24 hours using atomic claims in `~/.config/opencode/alert-events`. A writable shared directory prevents duplicate delivery by separate plugin modules or processes, independently of `filter.minInterval`; a new event ID can still notify subject to the configured filters. Expired claims are removed during subsequent notification activity. If storage is unavailable, deduplication falls back to bounded, best-effort memory state. Events without IDs retain the existing throttle behavior.

Closing the TUI or unloading the plugin cancels pending notifications. Delayed notifications recheck the open tabs, current route, renderer lifetime, and focus before sending, so closing a tab or leaving the session page also suppresses its pending alert. Notifications already displayed by the operating system are not withdrawn. On all platforms, including Windows, `desktop.enabled` and `desktop.events` control desktop popups; sound is configured independently. Windows registration and notification processes run asynchronously so they do not block the TUI.

## Relationship with TUI Notifications

OpenCode v2's TUI ships built-in notifications (configurable via the `attention` settings in `tui.json`). This plugin runs inside the TUI and sends OS desktop notifications and sounds for its open sessions. It does not intercept or replace the renderer's `triggerNotification`, and it does not notify after the TUI closes.

If you have explicitly enabled TUI notifications or sounds, they can overlap with this plugin's alerts. To use this plugin for those channels, set the following in `tui.json`. The plugin does not change this configuration automatically.

```json
{ "attention": { "notifications": false, "sound": false } }
```

## Requirements

- **OpenCode**: v2 or later. OpenCode v1 users should stay on 0.2.x — 2.0.0 is a breaking major release targeting the v2 plugin API.

### Desktop Notifications

- **Windows**: No additional setup (PowerShell toast, AUMID auto-registered)
- **macOS**: No additional setup (uses Notification Center)
- **Linux**: Requires `notify-send` (install: `sudo apt install libnotify-bin`)

### Sound

- **macOS**: No additional setup (uses `afplay`)
- **Linux**: Requires `ffmpeg` (install: `sudo apt install ffmpeg`)
- **Windows**: No additional setup (uses PowerShell SoundPlayer/MediaPlayer)

## Comparison

| Feature | @chousyn/opencode-alert | opencode-notify | opencode-notificator |
|---------|---------------|-----------------|---------------------|
| Windows | Yes | Yes | No |
| Custom sounds | All platforms | macOS only | All platforms |
| Project config | Yes | No | No |
| Quiet hours | Yes | Yes | No |
| Toggle enabled | Yes | No (uninstall) | Yes |
| npm published | Yes | No (OCX) | No (manual) |

## Development

```bash
npm install
npm test
npm run lint
npx tsc --noEmit
```

When running OpenCode v2 from source (e.g. `bun run packages/cli`), use bun >= 1.4 — older bun versions fail to load `file://` directory plugins due to an upstream host resolution issue.

## License

MIT
