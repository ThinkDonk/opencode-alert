# Contributing to opencode-alert

Thanks for your interest in contributing!

## Development

1. Clone the repo
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test: `npm test`
5. Lint: `npm run lint`

## Pull Request Process

1. Create a feature branch from `master`
2. Make your changes with clear, focused commits
3. Ensure `npm run build` and `npm test` pass
4. Ensure `npm run lint` passes (use `npm run lint:fix` to auto-fix)
5. Open a PR with a clear description of the change and motivation

## Code Style

- TypeScript, strict mode, ESM (`"type": "module"`)
- No comments in production code
- Use `node:` prefix for Node.js built-in imports
- Error handling: always catch, never throw from notification paths
- All notification functions are best-effort (silently fail)

## Reporting Issues

- Use [GitHub Issues](https://github.com/opencode-alert/opencode-alert/issues)
- Include your OS, Node.js version, and opencode version
- For bugs, include steps to reproduce and expected vs actual behavior
