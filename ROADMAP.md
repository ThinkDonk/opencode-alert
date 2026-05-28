# opencode-alert Roadmap

## Phase 1 — MVP (v0.1.0) ✅

- [x] Project scaffolding (package.json, tsconfig, .gitignore, LICENSE)
- [x] Desktop notification via node-notifier (Windows / macOS / Linux)
- [x] Sound notification (afplay / ffplay / PowerShell)
- [x] Config loading & deep merge (global + project, JSONC support)
- [x] Smart filtering (quiet hours, throttle)
- [x] Zero context pollution (no tools or prompts injected)
- [x] alert.schema.json (JSON Schema for config validation)
- [x] README & installation guide
- [x] Publish to npm as `@chousyn/opencode-alert`

## Phase 2 — Webhook & Multi-channel (v0.2.0)

- [ ] Webhook notification (HTTP POST)
  - Configurable URL, headers, payload template
  - JSON payload with event details
  - Retry on failure (3 attempts, exponential backoff)
- [ ] Telegram Bot notification
- [ ] Slack incoming webhook
- [ ] Discord webhook
- [ ] Email notification (SMTP)
- [ ] Channel enable/disable per event type

Planned config addition:
```jsonc
{
  "webhook": {
    "enabled": true,
    "url": "https://hooks.slack.com/services/...",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "payload": {
      "text": "[opencode-alert] {{event}}: {{message}}",
      "project": "{{projectName}}"
    },
    "events": ["idle", "error"],
    "retry": { "attempts": 3, "backoff": "exponential" }
  }
}
```

## Phase 3 — Advanced Features (v0.3.0)

- [ ] Project-level notification profiles
  - Different channels per project
  - Project-specific quiet hours
  - Override global settings per project
- [ ] Notification history log (`~/.config/opencode/alerts.log`)
- [ ] Click-to-focus (click notification → bring opencode TUI to front)
- [ ] Smart focus-based notification skipping (detect if TUI is visible to user)
- [ ] Sub-session / background agent notification toggle
- [ ] Custom event subscription via plugin API
- [ ] Notification templates (user-customizable message format)

Planned project-level config (`.opencode/alert.jsonc`):
```jsonc
{
  "profile": "intensive",  // "minimal" | "normal" | "intensive"
  "desktop": {
    "events": ["error", "permission"]  // Only critical events
  },
  "webhook": {
    "url": "https://my-team.example.com/opencode-hook",
    "events": ["idle"]  // Notify team when long tasks finish
  },
  "filter": {
    "quietHours": { "enabled": true, "start": "20:00", "end": "09:00" }
  }
}
```

## Phase 4 — Polish & Ecosystem (v1.0.0)

- [ ] JSON Schema for IDE autocomplete (alert.schema.json already exists, enhance with descriptions)
- [ ] `/alert` slash command (status, test notification, toggle on/off)
- [ ] Test suite (unit + integration with vitest)
- [ ] CI/CD (GitHub Actions: build, lint, test, publish)
- [ ] CONTRIBUTING.md
- [ ] Integration with opencode-workspace / OCX
- [ ] i18n support for notification messages
- [ ] Terminal focus detection — skip notifications when user is actively watching the TUI (removed from v0.1.0 due to unreliable detection on Windows; needs new approach, possibly using OpenCode SDK session state or TUI event hooks)

