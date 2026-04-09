---
name: pre-deploy
description: Run the full pre-deployment checklist before shipping to production
---

Run the full pre-deployment checklist for Tandem. Do not skip any step.

**1. Code Quality**
- Run `pnpm test` — report any failures. Stop if any test fails.
- Run `pnpm lint` — report any errors. Stop if any error found.
- Run `pnpm type-check` — report any TypeScript errors. Stop if any found.

**2. Environment**
- Check that `.env.example` documents every environment variable used in the codebase
- Check that no environment variable has a hardcoded default value that looks like a real secret
- Verify no `.env` file (with real values) is tracked by git: run `git ls-files | grep .env`

**3. Database**
- Verify all Prisma migrations are committed: run `pnpm prisma migrate status`
- Check that migrations run cleanly on a fresh database (no drift)
- Confirm there are no pending schema changes: `pnpm prisma db pull` should show no changes

**4. Security**
- Check git log for accidental secret commits: `git log --all -p | grep -i "xoxb-\|xoxp-\|sk-\|AIza\|AKIA"` — report any matches
- Verify the /api/health endpoint is reachable and returns 200

**5. Slack**
- Confirm the production Slack app's Event Subscriptions URL is pointing to production (not staging or ngrok)
- Confirm the Interactivity URL is pointing to production

**6. Application Behavior**
- Confirm task state machine only allows valid transitions (no code allows jumping states)
- Confirm deduplication cache is configured in the Slack event handler
- Confirm all Slack handlers call ack() before processing

Report all findings with PASS / FAIL status for each item.
Only give a final "Ready to deploy" if every item is PASS.
