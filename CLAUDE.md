# Tandem — Claude Instructions

## What This Product Does
Tandem is a Slack bot that detects action items in Slack messages, confirms them with users via DM, and automatically schedules them as Google Calendar events.

## Stack
- **Backend:** Node.js + TypeScript, Fastify, Bolt SDK (Slack), Prisma (ORM)
- **Frontend:** React + Vite + TypeScript + Tailwind + TanStack Query
- **Database:** PostgreSQL + Redis (job queue)
- **Queue:** BullMQ + Redis
- **AI:** OpenAI API (gpt-4o-mini) — task classification only
- **Shared types:** packages/shared/

## Commands
- `pnpm install` — install all workspace dependencies
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm lint` — run ESLint across all packages
- `pnpm type-check` — TypeScript compiler check (no emit)
- `pnpm dev` — start backend + frontend in watch mode
- `pnpm db:migrate` — run pending Prisma migrations
- `pnpm db:reset` — reset and reseed database (dev only)
- `pnpm db:studio` — open Prisma Studio

## Code Style
- TypeScript strict mode, no `any` without a comment explaining why
- 2-space indentation, ES modules (import/export)
- Zod for runtime validation at ALL API boundaries
- No raw SQL — use Prisma. Exception: pg_advisory_xact_lock for scheduling locks
- Destructure imports where possible

## Architecture
- API handlers: `packages/backend/src/routes/`
- Slack event handlers: `packages/backend/src/slack/handlers/`
- Slack DM/Block Kit builders: `packages/backend/src/slack/messages/`
- Scheduling engine: `packages/backend/src/scheduling/`
- AI classification: `packages/backend/src/ai/`
- DB helpers: `packages/backend/src/db/`
- Shared types: `packages/shared/src/types/`
- Frontend pages: `packages/frontend/src/pages/`
- Frontend components: `packages/frontend/src/components/`

## Security Rules — CRITICAL
- Never log OAuth tokens, passwords, refresh tokens, or encryption keys
- All tokens stored in DB must be encrypted using `encryptToken()` from `src/lib/crypto.ts`
- Never return token values in API responses — only masked indicators (e.g., `google_connected: true`)
- Every authenticated query MUST filter by `user_id` — no exceptions
- Input validation with Zod on every route that accepts user input
- Public auth endpoints have rate limiting applied (express-rate-limit or fastify-rate-limit)

## Task State Machine
Valid transitions only — throw an error if code attempts an invalid transition:
- `detected` → `confirmed` (user confirms)
- `detected` → `dismissed` (user dismisses)
- `confirmed` → `scheduled` (scheduler succeeds)
- `confirmed` → `failed` (no slot, user declines push)
- `scheduled` → `completed` (user marks done)
- `scheduled` → `scheduled` (rescheduled)
- `failed` → `scheduled` (user retries)
- `failed` → `dismissed` (user gives up)

Every state transition must write a row to `task_state_log`.

## Slack Rules
- Always call `ack()` BEFORE any async processing — Slack requires 200 within 3 seconds
- Check Redis deduplication cache for `event_id` before processing any Slack event
- Use bot token for sending DMs; use user token for reading messages
- Never store Slack message text in the database — only message ID (`ts`)
- Unregistered user detection: only send signup DM, do NOT analyze the message

## Google Calendar Rules
- Always call `getValidGoogleAccessToken(userId)` before any Calendar API call — it handles refresh
- If token refresh fails: mark user disconnected, send DM, return null (do not crash)
- Acquire per-user advisory lock before scheduling to prevent double-booking
- Re-fetch availability just before creating event (race condition prevention)
- Only modify events created by Tandem — never touch user's other events
- Push logic: only suggest pushing events with Low Derived Urgency AND Low Importance

## AI Classification Rules
- Prompt template lives in `src/ai/prompts/task-classification.txt` — never inline
- Only proceed if `confidence >= 0.6`
- If OpenAI response is invalid JSON or missing required fields: log raw response, return null, do not DM user
- Exponential backoff: 3 attempts at 1s, 4s, 16s for 5xx and 429 errors

## Testing
- Write failing tests first, then implement
- Use Vitest for unit and integration tests
- Mock OpenAI, Slack, and Google Calendar APIs in tests — never call real APIs in test suite
- Run `pnpm test` before marking any task complete

## Timezones
- All timestamps stored as UTC in PostgreSQL
- Convert to user's timezone (`users.timezone`) at presentation layer only
- Never store or process times in any timezone other than UTC internally
