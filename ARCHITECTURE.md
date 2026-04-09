# Tandem Architecture

## System Overview

Tandem has three main flows:

**1. Detection Flow** (Slack → AI → User)
- Slack sends a message event to our webhook
- We check if the mentioned user is registered
- If yes: OpenAI classifies the message
- If it's a task: we create a DB record and send a confirmation DM

**2. Scheduling Flow** (User confirms → Google Calendar)
- User clicks Confirm in the DM
- We find a free slot in Google Calendar
- We create the calendar event
- We update the task state to `scheduled`

**3. Completion Flow** (User marks done)
- User clicks Complete in Slack or web dashboard
- We delete the Google Calendar event
- We update the task state to `completed`

---

## Monorepo Structure

```
tandem/
├── packages/
│   ├── backend/          Node.js + TypeScript API + Slack bot
│   ├── frontend/         React + Tailwind web dashboard
│   └── shared/           Shared TypeScript types
├── pnpm-workspace.yaml
├── docker-compose.yml    Local PostgreSQL + Redis
└── .env.example          Required environment variables (no values)
```

---

## Source of Truth

| Data | Source of Truth |
|------|----------------|
| Task metadata (title, importance, state) | Tandem PostgreSQL database |
| Calendar availability | Google Calendar API |
| Event timing (start, end) | Google Calendar (synced to DB) |

If there is a conflict between our DB and Google Calendar, Google Calendar wins. The end-of-day reconciliation job syncs the DB to match.

---

## Key Design Decisions

### Why per-user advisory locks for scheduling?
Two Slack events arriving simultaneously for the same user could both find a free slot and double-book it. PostgreSQL advisory locks (`pg_advisory_xact_lock`) prevent concurrent scheduling for the same user without needing a complex distributed lock.

### Why BullMQ + Redis for the scheduling queue?
Scheduling is async — we don't want the Slack event handler to wait for Google Calendar. BullMQ gives us a reliable queue with retries. One queue per user ensures tasks for the same user are processed in order.

### Why encrypt tokens in the database?
Slack and Google tokens are permanent access credentials — if the DB is leaked, unencrypted tokens would give attackers full access to users' Slack and Google accounts. AES-256-GCM encryption at rest means a DB leak alone is not sufficient.

### Why httpOnly cookies for refresh tokens?
JavaScript cannot read httpOnly cookies, so XSS attacks cannot steal refresh tokens. The access token lives in memory (not localStorage), so it's also XSS-safe. The tradeoff is that sessions don't persist across page refreshes by default — we handle this by calling `/api/auth/refresh` on page load.

### Why Google Calendar is the source of truth for timing?
Users may move or delete Tandem calendar events directly in Google Calendar. If we treated our DB as the source of truth, we'd have stale data. Instead, we reconcile at end-of-day and trust Google for what's actually on the calendar.

### Why not store Slack message text?
Privacy and GDPR compliance. Users' Slack messages may contain sensitive information. We only store the message ID (ts) for linking back, and pass the text directly to OpenAI for classification without persisting it.

---

## Data Flow: Task Detection

```
Slack message event
       ↓
POST /slack/events (Bolt SDK)
       ↓
ack() immediately (respond 200 to Slack)
       ↓
Check deduplication cache (Redis, event_id, 5min TTL)
       ↓ (not a duplicate)
Look up mentioned user in slack_user_tokens
       ↓ (user found / registered)
Call OpenAI classify(messageText, context)
       ↓ (is_task=true, confidence>=0.6)
Create task in DB (state: detected)
Write to task_state_log
       ↓
Send confirmation DM (Block Kit with Confirm/Edit/Dismiss buttons)
```

---

## Data Flow: Scheduling

```
User clicks Confirm button in DM
       ↓
POST /slack/interactions (Bolt SDK)
       ↓
ack() immediately
       ↓
Update task state: detected → confirmed
Write to task_state_log
       ↓
Enqueue scheduling job in BullMQ
       ↓
[async] scheduleTask(taskId) runs
       ↓
Acquire pg_advisory_xact_lock(userId)
       ↓
getValidGoogleAccessToken(userId) — refresh if needed
       ↓
Fetch Google Calendar free/busy
Find first available slot (respect work hours, breaks, buffer)
       ↓
Re-fetch availability (race condition check)
       ↓
Create Google Calendar event
       ↓
Update task: state → scheduled, google_calendar_event_id, scheduled_start, scheduled_end
Write to task_state_log
```

---

## External Dependencies

| Service | What We Use It For | Risk If Down |
|---------|-------------------|-------------|
| Slack Events API | Receive message events | Task detection pauses |
| Slack Web API (bot token) | Send DMs, update Home Tab | Cannot notify users |
| Google Calendar API | Create/delete events, check availability | Scheduling pauses |
| OpenAI API | Task classification | Task detection pauses |
| PostgreSQL | All persistent data | System down |
| Redis | BullMQ queue + deduplication cache | Queue pauses, possible duplicates |

Graceful degradation: if OpenAI is down, tasks cannot be detected but existing scheduled tasks, the dashboard, and calendar sync still work. If Google Calendar is down, detection and confirmation still work — only scheduling is delayed (tasks stay in `confirmed`).

---

## Environment Variables

All secrets live in environment variables, never in code. See `.env.example` for the full list.

Critical variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `ENCRYPTION_KEY_CURRENT` — 32-byte hex key for token encryption
- `ENCRYPTION_KEY_PREVIOUS` — previous key (for rotation), nullable
- `JWT_SECRET` — used to sign access tokens
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
