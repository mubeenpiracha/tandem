---
paths:
  - "packages/backend/src/routes/**/*.ts"
---

# API Design Rules

## Response Format
All API routes return JSON. Success responses:
```json
{ "data": { ... } }
```
Error responses:
```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "Task not found" } }
```

Never return naked objects or arrays at the top level.

## HTTP Status Codes
- 200: success with body
- 201: resource created
- 204: success with no body (e.g., DELETE)
- 400: validation error (bad input)
- 401: not authenticated
- 403: authenticated but not authorized for this resource
- 404: resource not found
- 429: rate limited
- 500: server error (never expose details to client)

## Authentication
- Protected routes use `requireAuth` middleware which extracts `userId` from JWT
- The middleware attaches `req.userId` — route handlers must use this, never a client-provided userId
- Slack interactions are authenticated via Slack signing secret (Bolt handles this)

## Validation
- Define a Zod schema for every request body, named after the route: `CreateTaskSchema`, `UpdatePreferencesSchema`
- Validate at the route handler entry point before any business logic
- Return 400 with specific field errors if validation fails

## Task State Machine
- State transitions happen through dedicated endpoints (`/api/tasks/:id/confirm`, `/api/tasks/:id/complete`, etc.)
- Direct `state` field updates via `PATCH /api/tasks/:id` are NOT allowed
- Each state-transition endpoint must validate that the transition is legal before executing

## Pagination
For list endpoints that could return many rows:
- Default limit: 20
- Maximum limit: 100
- Use cursor-based pagination (not offset) for large tables
- Response includes `{ data: [...], nextCursor: "..." }`

## Idempotency
- POST endpoints for Slack interactions must be idempotent — clicking a button twice should not create duplicate state
- Check current task state before transitioning (e.g., if task is already `completed`, ignore a second complete request)
