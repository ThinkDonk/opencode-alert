[中文文档](README-zh.md)

# opencode-alert

Cross-platform notification plugin for [OpenCode](https://opencode.ai) v2 — desktop alerts and sound alerts with project-level configuration.

## Features

- Desktop notifications (Windows Toast, macOS Notification Center, Linux notify-send)
- Sound alerts with custom audio file support
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

OpenCode v2 resolves plugin entries in `pkg/server` → `pkg` order. This package's `exports` field provides both `.` and `./server` entry points pointing at the same TypeScript source.

### Copy into project

Copy or clone the plugin into your project's `.opencode/plugin/` directory (v2 requires the plugin target to be a directory):

```bash
git clone https://github.com/ThinkDonk/opencode-alert .opencode/plugin/opencode-alert
```

### npm package or local path

Reference the package in the `plugins` array of your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugins": ["@chousyn/opencode-alert"]
}
```

Or pin a version:

```json
{
  "plugins": ["@chousyn/opencode-alert@2.0.0"]
}
```

Or use a local path:

```json
{
  "plugins": ["file:///path/to/opencode-alert"]
}
```

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

Project config overrides global config (deep merge).

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

## Relationship with TUI Notifications

OpenCode v2's TUI ships built-in notifications (configurable via the `attention` settings in `tui.json`). This plugin is complementary: it runs in the server process and delivers system-level desktop notifications and sounds, so alerts still fire when the TUI is closed or unfocused.

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
