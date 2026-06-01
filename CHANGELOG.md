# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-05-28

### Added

- Desktop notifications via node-notifier with OS shell fallbacks (macOS, Linux, Windows)
- Sound notifications via platform-native commands (afplay, ffplay, PowerShell)
- JSONC config file support with global/project/env priority resolution
- Quiet hours, focus detection, and throttle filters
- JSON Schema for config validation (`alert.schema.json`)
- Built-in sound files (ding.wav, alert.wav, ping.wav)
- Auto-detection of question-type messages from assistant responses
- Skip notifications for child/sub-agent sessions (multi-agent mode)
- MIT License

### Fixed

- Correct OpenCode SDK client API call format (`{ path: { id } }` instead of `{ id }`)
- Access message role via `info.role` instead of top-level `role` in SDK response
- Replace naive JSONC comment stripping regex with state machine parser to preserve URLs containing `//`
- Include `icon.png` in npm publish files list
