# Development Setup

## Prerequisites

Install these before anything else:

- **Node.js 20+** — `node --version` to check
- **pnpm** — `npm install -g pnpm`
- **Docker Desktop** — for local PostgreSQL and Redis
- **ngrok** — for receiving Slack webhooks locally (`brew install ngrok` on Mac)
- **Git**

---

## First-Time Setup

### 1. Clone and install
```bash
git clone <your-repo-url> tandem
cd tandem
pnpm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```

Open `.env` and fill in the values. See the sections below for where to get each one.

### 3. Start the local database and Redis
```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 4. Run database migrations
```bash
pnpm db:migrate
```

### 5. Start the dev server
```bash
pnpm dev
```

Backend runs on `http://localhost:3000`.
Frontend runs on `http://localhost:5173`.

---

## Getting External API Credentials

### Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" → name it "Tandem (Dev)" → select your development workspace
3. Under "OAuth & Permissions" → add Bot Token Scopes:
   - `chat:write` — send DMs
   - `im:write` — open DMs with users
   - `app_mentions:read` — receive @mention events
   - `users:read` — look up user info
   - `users:read.email` — get user emails
4. Under "OAuth & Permissions" → add User Token Scopes:
   - `channels:history` — read public channel messages
   - `groups:history` — read private channel messages
   - `im:history` — read DMs
   - `mpim:history` — read group DMs
5. Under "Event Subscriptions":
   - Enable Events
   - Request URL: `https://<your-ngrok-url>/slack/events` (set after starting ngrok)
   - Subscribe to bot events: `app_mention`, `app_home_opened`
   - Subscribe to user events: `message.channels`, `message.groups`, `message.im`
6. Under "Interactivity & Shortcuts":
   - Enable Interactivity
   - Request URL: `https://<your-ngrok-url>/slack/interactions`
7. Install the app to your workspace
8. Copy these values to `.env`:
   - `SLACK_CLIENT_ID` — from "Basic Information" → "App Credentials"
   - `SLACK_CLIENT_SECRET` — same location
   - `SLACK_SIGNING_SECRET` — same location
   - `SLACK_BOT_TOKEN` — from "OAuth & Permissions" → "Bot User OAuth Token" (starts with `xoxb-`)

### Google Calendar API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project named "Tandem Dev"
3. Enable the Google Calendar API: APIs & Services → Enable APIs → search "Google Calendar API"
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/connect/google/callback`
5. Copy to `.env`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### OpenAI
1. Go to [platform.openai.com](https://platform.openai.com) → API Keys → Create new key
2. Copy to `.env`: `OPENAI_API_KEY`

---

## Running ngrok (for Slack webhooks)

Slack needs a public URL to send events to your local server. ngrok creates a tunnel.

```bash
ngrok http 3000
```

This gives you a URL like `https://abc123.ngrok.io`. Use that as your Slack app's Request URL.

**Important:** ngrok URLs change every time you restart it (free plan). Update your Slack app's Event Subscriptions and Interactivity URLs each time.

---

## Running Tests

```bash
pnpm test                           # run all tests
pnpm test packages/backend          # backend tests only
pnpm test --watch                   # watch mode
pnpm test --coverage                # with coverage report
```

Tests mock all external APIs (Slack, Google, OpenAI). They never call real services.

---

## Common Issues

**Port 5432 already in use**
Another PostgreSQL instance is running. Either stop it or change `POSTGRES_PORT` in docker-compose.yml and `DATABASE_URL` in `.env`.

**Slack events not arriving**
- Is ngrok running? `ngrok http 3000`
- Did you update the Request URL in the Slack app settings?
- Is the backend running? `pnpm dev`
- Check the ngrok inspector at `http://localhost:4040` to see incoming requests

**Google Calendar OAuth redirect mismatch**
The redirect URI in Google Cloud Console must exactly match what your server sends. Check `GOOGLE_REDIRECT_URI` in `.env` matches what's in Google Cloud Console.

**Prisma schema out of sync**
```bash
pnpm db:migrate
pnpm prisma generate
```

**Redis connection refused**
```bash
docker-compose up -d   # make sure Docker containers are running
docker ps              # verify redis container is listed
```
