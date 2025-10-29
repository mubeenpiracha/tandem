# tandem Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-28

## Active Technologies

- Node.js 20 LTS (JavaScript/TypeScript for maximum developer accessibility) + Express.js, Prisma ORM, OpenAI SDK, Slack Web API, Google Calendar API (001-tandem-slack-bot)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Node.js 20 LTS (JavaScript/TypeScript for maximum developer accessibility): Follow standard conventions

## Recent Changes

- 001-tandem-slack-bot: Added Node.js 20 LTS (JavaScript/TypeScript for maximum developer accessibility) + Express.js, Prisma ORM, OpenAI SDK, Slack Web API, Google Calendar API

<!-- MANUAL ADDITIONS START -->

## Terminal Usage Guidelines

- Always use `isBackground: true` when running long-running processes like:
  - `npm run dev` or `npm start`
  - Development servers
  - Watch mode commands
  - `ngrok` tunnels
  - Any process that doesn't naturally exit
- This prevents interrupting running services when executing subsequent commands


<!-- MANUAL ADDITIONS END -->
