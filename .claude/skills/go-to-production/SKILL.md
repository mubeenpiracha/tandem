---
name: go-to-production
description: Interactive checklist to set up the production environment on Railway from scratch. Run this when staging is verified and you're ready for real users.
---

You are helping the user launch Tandem to production for the first time. Walk through each step interactively — do not proceed to the next step until the user confirms the previous one is done.

Start by saying:
"Before we begin: is staging fully working? Can you log in, detect a task from Slack, and see it scheduled in Google Calendar on staging? (yes/no)"

If the answer is no, stop and say: "Get staging working first. Production setup is pointless until staging is verified."

If yes, proceed through the steps below one at a time.

---

## Step 1: Create the Production Railway Project

Say:
"Go to your Railway dashboard and create a new project called 'tandem-production'.

Add the same services as staging:
- Deploy backend from GitHub (same repo, same branch as staging)
- Deploy frontend from GitHub (same repo)
- Add PostgreSQL plugin
- Add Redis plugin

Once created, Railway will give you two URLs — one for the backend, one for the frontend. Paste both here."

Wait for the user to paste the URLs. Save them as PROD_BACKEND_URL and PROD_FRONTEND_URL for use in later steps.

---

## Step 2: Create the Production Slack App

Say:
"Now create a SEPARATE Slack App for production. Do not reuse the staging/dev app.

Go to api.slack.com/apps → Create New App → 'Tandem' (no 'Dev' in the name).

In the new app:
1. OAuth & Permissions → Bot Token Scopes: chat:write, im:write, app_mentions:read, users:read, users:read.email
2. OAuth & Permissions → User Token Scopes: channels:history, groups:history, im:history, mpim:history
3. Event Subscriptions → Enable → Request URL: [PROD_BACKEND_URL]/slack/events
4. Event Subscriptions → Subscribe to bot events: app_mention, app_home_opened
5. Event Subscriptions → Subscribe to user events: message.channels, message.groups, message.im
6. Interactivity & Shortcuts → Enable → Request URL: [PROD_BACKEND_URL]/slack/interactions
7. OAuth & Permissions → Redirect URL: [PROD_BACKEND_URL]/api/connect/slack/callback

Once done, paste these three values:
- Client ID:
- Client Secret:
- Signing Secret:"

Wait for the user to paste all three.

---

## Step 3: Configure Google Cloud for Production

Say:
"You can use the same Google Cloud project as staging — just add the production redirect URI.

Go to console.cloud.google.com → your project → APIs & Services → Credentials → your OAuth client → Edit.

Under 'Authorized redirect URIs', add:
[PROD_BACKEND_URL]/api/connect/google/callback

Click Save.

Paste your Google Client ID and Client Secret (same as staging is fine):"

Wait for confirmation.

---

## Step 4: Generate Production Secrets

Say:
"Now generate fresh secrets for production. Run these commands in your terminal and paste the output:

```bash
# JWT Secret
openssl rand -hex 64

# Encryption Key
openssl rand -hex 32
```

IMPORTANT: These must be different from your staging secrets. Never share secrets between environments.

Paste both values here (I will use them in the next step but will not store them):"

Wait for confirmation.

---

## Step 5: Set Environment Variables in Railway Production

Say:
"In Railway → tandem-production → backend service → Variables, set ALL of these:

```
NODE_ENV=production
DATABASE_URL=<auto-filled by Railway — check the PostgreSQL plugin>
REDIS_URL=<auto-filled by Railway — check the Redis plugin>
JWT_SECRET=<the JWT secret you just generated>
ENCRYPTION_KEY_CURRENT=<the encryption key you just generated>
ENCRYPTION_KEY_PREVIOUS=<leave empty for now>
SLACK_CLIENT_ID=<from the production Slack App>
SLACK_CLIENT_SECRET=<from the production Slack App>
SLACK_SIGNING_SECRET=<from the production Slack App>
GOOGLE_CLIENT_ID=<from Google Cloud>
GOOGLE_CLIENT_SECRET=<from Google Cloud>
GOOGLE_REDIRECT_URI=[PROD_BACKEND_URL]/api/connect/google/callback
OPENAI_API_KEY=<your OpenAI key>
FRONTEND_URL=[PROD_FRONTEND_URL]
```

Tell me when all variables are set."

---

## Step 6: Run Database Migrations

Say:
"Trigger a deploy in Railway → tandem-production → backend → Deploy.

The start command should run migrations automatically (pnpm db:migrate && pnpm start).

If migrations don't run automatically, open the Railway shell and run:
```bash
cd packages/backend && pnpm prisma migrate deploy
```

Confirm: did migrations run without errors? Paste the migration output."

---

## Step 7: Verify Production Health

Say:
"Open this URL in your browser: [PROD_BACKEND_URL]/api/health

It should return something like:
{
  'status': 'ok',
  'db': 'connected',
  'redis': 'connected'
}

Paste what you see."

If the health check fails, diagnose the error from Railway logs before proceeding.

---

## Step 8: Set Up Uptime Monitoring

Say:
"Set up free uptime monitoring so you know immediately if production goes down.

Go to uptimerobot.com (free) → Add New Monitor:
- Monitor Type: HTTP(s)
- Friendly Name: Tandem Production
- URL: [PROD_BACKEND_URL]/api/health
- Monitoring Interval: 5 minutes
- Alert Contact: your email

Tell me when that's done."

---

## Step 9: Install the Production Slack App to Your Workspace

Say:
"Now install the production Slack App to your real workspace.

In the Slack App dashboard → OAuth & Permissions → Install to Workspace.

This gives you the production Bot Token. Add it to Railway production environment variables:
SLACK_BOT_TOKEN=<the xoxb- token>

Redeploy the backend after adding this variable."

---

## Step 10: Smoke Test Production

Say:
"Final check. In your real Slack workspace:

1. @mention a user who is NOT yet registered with Tandem
2. They should receive a DM: 'Hi there! To get started with Tandem...'
3. Click 'Sign Up & Connect' and complete onboarding
4. In a channel, @mention that user with a clear task: '@[user] can you review the pitch deck by Friday?'
5. Confirm the user receives a task confirmation DM
6. Click Confirm
7. Check Google Calendar — the event should appear

Did all 7 steps work? (yes/no)"

If yes:
"Production is live. A few things to do in the next 24 hours:
- Watch Railway logs for any errors
- Check your uptime monitor is receiving pings
- Keep staging running — always test changes there before deploying to production"

If no:
"Tell me which step failed and paste the error from Railway logs. We'll diagnose before considering this done."
