---
name: security-review
description: Perform a security review of backend code for auth bypass, data leakage, missing validation, and token mishandling
---

Perform a security review of $ARGUMENTS (if no argument given, review all of packages/backend/src/).

Check for these issues in order of severity:

**CRITICAL**
1. Auth bypass: routes that should require JWT but have no auth middleware
2. Authorization bypass: database queries that don't filter by userId (could expose another user's data)
3. Token leakage: OAuth tokens, passwords, or refresh tokens logged or returned in API responses
4. Missing Slack signature verification on /slack/events or /slack/interactions

**HIGH**
5. Missing input validation: routes that accept user input without Zod validation
6. Unencrypted token storage: tokens written to DB without using encryptToken()
7. Hardcoded secrets or credentials anywhere in the code
8. SQL injection: raw SQL queries that interpolate user input

**MEDIUM**
9. Missing rate limiting on public auth endpoints
10. Generic error handling that could leak stack traces or internal details
11. Missing idempotency checks on Slack interaction handlers

For each issue found, report:
| File | Line | Severity | Issue | Recommended Fix |

After listing issues:
- Fix all CRITICAL issues immediately
- Fix all HIGH issues immediately
- Summarize MEDIUM issues and ask me which to address

Run pnpm lint after fixes.
