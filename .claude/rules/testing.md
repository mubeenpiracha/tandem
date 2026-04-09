---
paths:
  - "packages/**/*.test.ts"
  - "packages/**/*.spec.ts"
---

# Testing Rules

## Test-First Approach
- Write a failing test before implementing any feature
- The test must fail for the right reason (not a setup error)
- Only then write the implementation to pass it

## What to Test
- Happy path: the expected successful case
- Auth boundary: what happens if the request has no JWT, or a JWT for the wrong user
- Invalid input: what happens with missing fields, wrong types, out-of-range values
- External API failure: what happens if Slack, Google, or OpenAI returns an error

## Mocking External APIs
- NEVER call real Slack, Google, or OpenAI APIs in tests
- Mock the SDK clients at the module level using Vitest's `vi.mock()`
- Mock data must be realistic — use actual field names and structures from the real APIs

## Test Structure
```typescript
describe('scheduleTask', () => {
  describe('when a free slot is available', () => {
    it('creates a Google Calendar event', async () => { ... })
    it('updates task state to scheduled', async () => { ... })
    it('writes to task_state_log', async () => { ... })
  })

  describe('when no free slot is available', () => {
    it('finds lower-priority Tandem tasks to push', async () => { ... })
    it('sends a conflict resolution DM', async () => { ... })
  })
})
```

## Database in Tests
- Use a separate test database (or in-memory SQLite if Prisma supports it)
- Reset state between tests (beforeEach cleanup)
- Never run tests against the development or production database

## Coverage
- Scheduling engine: 80%+ line coverage (it is complex and critical)
- Auth routes: test every route including edge cases
- State machine transitions: test every valid transition and at least 3 invalid ones
