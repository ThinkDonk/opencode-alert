# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-09-21

Dedicated rewrite for OpenCode v2. This release drops support for OpenCode v1 — v1 users should stay on 0.2.x.

### Added

- Package `exports` field with `.` and `./server` entry points (opencode v2 resolves plugin entries in `pkg/server` → `pkg` order)
- Per-event-type notification delay (`delayMs`) to let the TUI finish rendering first
- Session-scoped throttle state persisted to `~/.config/opencode/alert-throttle.json`
- Windows toast notifications with explicit AppUserModelID registration (`src/win-aumid.ts`)
- Terminal detection and foreground focus suppression (`src/terminal.ts`)

### Changed

- Plugin definition migrated from the v1 hook-function export to the v2 contract: default export `{ id, setup(ctx) }` with duck-typed context validation, zero external dependencies
- Event mapping fully remapped to v2 events: `session.execution.succeeded` → idle, `session.execution.failed` → error, `session.execution.interrupted` (reason=user) → cancel, `permission.asked` → permission, `form.created` → question, `session.tool.success` (task tool) → subagent; `session.tool.input.started` is recorded by call ID to associate tool names (Map capped at 500 entries, FIFO)
- All shell invocations migrated from Bun's `$` API to `node:child_process` — the plugin no longer requires Bun
- Session enrichment now uses the unwrapped v2 `ctx.session.get({ sessionID })` (`.title` / `.parentID`)
- Metadata: version bumped to 2.0.0, description and README updated for v2 (webhook claims removed), README event table rewritten around v2 events

### Removed

- OSC escape-sequence terminal notifications — in-terminal alerts are handled by the opencode v2 TUI's built-in attention system

### Fixed

- Duplicate notifications when multiple opencode Locations (projects/worktrees) run in one server process: each plugin instance now self-filters subscribed events by the envelope `location` (directory + workspaceID) and ignores events belonging to other Locations
- Console window flash on Windows: all child process invocations (`spawn`/`execSync` for PowerShell, reg, and platform notification commands) pass `windowsHide: true` so no console window is opened when opencode runs without one

## [0.2.4] - 2026-05-28

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
