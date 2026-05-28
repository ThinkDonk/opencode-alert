# AGENTS.md

## Build & Test Commands

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`

## Project Structure

- `index.ts` — Plugin entry point, exports default function with OpenCode hooks
- `src/events.ts` — Event type definitions and normalization
- `src/config.ts` — Config loading and deep merge (global + project)
- `src/desktop.ts` — Desktop notification via node-notifier
- `src/sound.ts` — Sound notification via platform-native commands
- `src/notify.ts` — Central dispatch to notification channels
- `src/utils.ts` — Quiet hours, throttle, focus detection utilities
- `alert.schema.json` — JSON Schema for config validation

## Code Style

- TypeScript, strict mode, ESM
- No comments in production code
- Use `node:` prefix for Node.js built-in imports
- Error handling: always catch, never throw from notification paths
- All notification functions are best-effort (silently fail)
