---
paths:
  - "packages/backend/**/*.ts"
---

# Security Rules for Backend Code

## Token Handling
- Every OAuth token, access token, refresh token, and bot token stored in the database MUST be encrypted using `encryptToken()` from `src/lib/crypto.ts`
- Never log token values — log only that a token was used/refreshed/revoked
- Never return token values in API responses — return status indicators only (e.g., `google_connected: true`)
- Never store tokens in plain environment variable logs

## Authorization
- Every Prisma query that accesses user data MUST include `where: { userId: currentUserId }` or equivalent
- There must be no code path where user A can access user B's tasks, tokens, or preferences
- Middleware that extracts `userId` from JWT must run before any data-access route handler
- Slack bot handlers must verify the `slack_user_id` maps to the correct Tandem user before acting

## Input Validation
- All API routes that accept request body, query params, or path params MUST validate with a Zod schema
- The Zod schema must be defined separately from the route handler, not inline
- Never trust client-provided `userId` — always derive it from the verified JWT

## Slack Signature Verification
- All requests to `/slack/events` and `/slack/interactions` must be verified using the Slack signing secret
- Bolt SDK handles this automatically — do not disable or bypass it

## Rate Limiting
- Public endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`): 5 requests per minute per IP
- `/api/auth/refresh`: 10 requests per minute per IP
- All authenticated routes: 60 requests per minute per user
- Do not apply rate limiting to `/slack/events` or `/slack/interactions` — Slack controls the flow

## Error Messages
- Never return stack traces in production API responses
- Auth errors should be generic: "Invalid credentials" — not "User not found" or "Wrong password"
- `POST /api/auth/forgot-password` always returns 200 regardless of whether the email exists
