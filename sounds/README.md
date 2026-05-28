# Built-in Sounds

Place your notification sound files here. Supported formats: `.mp3`, `.wav`, `.ogg`.

## Default Sounds

| File | Event |
|------|-------|
| `ding.wav` | Task completed (idle) |
| `alert.wav` | Error occurred |
| `ping.wav` | Permission required |

## Adding Custom Sounds

You can also add custom sounds to `~/.config/opencode/alert-sounds/` and reference them in your config:

```jsonc
{
  "sound": {
    "events": {
      "idle": "my-custom-sound.wav"
    },
    "customDir": "~/.config/opencode/alert-sounds/"
  }
}
```

## Platform Notes

- **macOS**: All formats supported via `afplay`
- **Linux**: All formats supported via `ffplay` (requires ffmpeg)
- **Windows**: `.wav` files via PowerShell SoundPlayer; `.mp3` via MediaPlayer COM
