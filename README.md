# opencode-alert

Cross-platform notification plugin for [OpenCode](https://opencode.ai) — desktop alerts, sound alerts, and webhook notifications with project-level configuration.

## Features

- Desktop notifications (Windows Toast, macOS Notification Center, Linux notify-send)
- Sound alerts with custom audio file support
- Smart filtering: quiet hours, throttle, terminal focus detection
- Project-level configuration with deep merge
- Zero context pollution (no tools or prompts injected)

## Installation

### npm (Recommended)

Add to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["opencode-alert"]
}
```

Or pin a version:

```json
{
  "plugin": ["opencode-alert@0.1.0"]
}
```

### Local Development

```json
{
  "plugin": ["file:///path/to/opencode-alert"]
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

| Event | Trigger | Default Notification |
|-------|---------|---------------------|
| `idle` | AI task completed | "Task Completed" |
| `error` | Session error | "Error Occurred" |
| `permission` | AI requests permission | "Permission Required" |

## Platform Requirements

### Desktop Notifications

- **Windows**: No additional setup (uses SnoreToast via node-notifier)
- **macOS**: No additional setup (uses Notification Center)
- **Linux**: Requires `notify-send` (install: `sudo apt install libnotify-bin`)

### Sound

- **macOS**: No additional setup (uses `afplay`)
- **Linux**: Requires `ffmpeg` (install: `sudo apt install ffmpeg`)
- **Windows**: No additional setup (uses PowerShell SoundPlayer/MediaPlayer)

### Custom Notification Icon (Windows)

To customize the small app icon shown in the top-left corner of Windows toast notifications:

1. Download [SnoreToast](https://github.com/KDE/snoretoast) and note its path
2. Run the following command to register an app shortcut with your icon:

```powershell
SnoreToast.exe -install "OpenCode" "com.opencode.alert" "C:\path\to\icon.png"
```

After installation, notifications from opencode-alert will display the custom icon. This step is optional — without it, Windows uses a default icon.

## Comparison

| Feature | opencode-alert | opencode-notify | opencode-notificator |
|---------|---------------|-----------------|---------------------|
| Windows | Yes | Yes | No |
| Custom sounds | All platforms | macOS only | All platforms |
| Webhook | Planned | No | No |
| Project config | Planned | No | No |
| Quiet hours | Yes | Yes | No |
| Toggle enabled | Yes | No (uninstall) | Yes |
| npm published | Yes | No (OCX) | No (manual) |

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
