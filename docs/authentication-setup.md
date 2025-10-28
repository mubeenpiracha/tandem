# Authentication Setup Guide

This guide walks through setting up the complete authentication flow for User Story 3.

## Prerequisites

Before testing authentication, you need:

1. **Database running** (PostgreSQL)
2. **Redis running** 
3. **Ngrok account** (for webhook tunneling)
4. **Slack App** created and configured
5. **Google OAuth App** created and configured

## Step 1: Start Ngrok Tunnel

First, you need a stable ngrok tunnel for OAuth callbacks:

```bash
# Install ngrok if not already installed
# Sign up at https://ngrok.com and get your auth token

# Set your ngrok auth token
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start a tunnel on port 3000 (where our backend runs)
ngrok http 3000
```

Note your ngrok URL (e.g., `https://abc123.ngrok.io`)

## Step 2: Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "Tandem" (or your preferred name)
4. Select your development workspace

### Configure OAuth & Permissions:
- **Redirect URLs**: Add `https://YOUR_NGROK_URL.ngrok.io/api/auth/slack/callback`
- **Bot Token Scopes**:
  - `chat:write`
  - `channels:read`
  - `groups:read`
  - `im:read`
  - `im:write`
  - `users:read`
  - `app_mentions:read`

- **User Token Scopes**:
  - `channels:history`
  - `groups:history`
  - `im:history`
  - `mpim:history`

### Configure Event Subscriptions:
- **Request URL**: `https://YOUR_NGROK_URL.ngrok.io/webhooks/slack/events`
- **Subscribe to bot events**:
  - `app_mention`
  - `message.channels`
  - `message.groups`
  - `message.im`
  - `message.mpim`

### Configure Interactive Components:
- **Request URL**: `https://YOUR_NGROK_URL.ngrok.io/webhooks/slack/interactions`

### Install App:
- Go to "Install App" tab
- Click "Install to Workspace"
- Copy the credentials

## Step 3: Create Google OAuth App

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing one
3. Enable Google Calendar API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Application type: "Web application"
6. **Authorized redirect URIs**: Add `https://YOUR_NGROK_URL.ngrok.io/api/auth/google/callback`
7. Copy the Client ID and Client Secret

## Step 4: Create Environment File

Copy the example and fill in your credentials:

```bash
cd backend
cp .env.example .env
```

Update `.env` with your values:

```bash
# Database
DATABASE_URL="postgresql://tandem:tandem123@localhost:5435/tandem_dev"

# Redis  
REDIS_URL="redis://localhost:6381"

# Server
PORT=3000
NODE_ENV="development"

# JWT & Security (generate strong secrets)
JWT_SECRET="your-super-secure-jwt-secret-at-least-32-characters-long"
TOKEN_ENCRYPTION_KEY="your-super-secure-encryption-key-at-least-32-characters-long"

# OpenAI
OPENAI_API_KEY="your-openai-api-key-here"

# Slack OAuth
SLACK_CLIENT_ID="your-slack-client-id-from-step-2"
SLACK_CLIENT_SECRET="your-slack-client-secret-from-step-2"
SLACK_SIGNING_SECRET="your-slack-signing-secret-from-step-2"
SLACK_REDIRECT_URI="https://YOUR_NGROK_URL.ngrok.io/api/auth/slack/callback"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id-from-step-3"
GOOGLE_CLIENT_SECRET="your-google-client-secret-from-step-3"  
GOOGLE_REDIRECT_URI="https://YOUR_NGROK_URL.ngrok.io/api/auth/google/callback"

# Ngrok configuration
NGROK_DOMAIN="YOUR_NGROK_URL.ngrok.io"
WEBHOOK_BASE_URL="https://YOUR_NGROK_URL.ngrok.io"

# CORS (frontend URL)
CORS_ORIGIN="http://localhost:3001"

# Logging
LOG_LEVEL="debug"
```

## Step 5: Start Services

Make sure all services are running:

```bash
# Start database (if using Docker)
docker-compose up -d postgres redis

# Run database migrations
npm run prisma:migrate

# Start the backend server
npm run dev
```

## Step 6: Test Authentication Flow

### Manual Testing:

1. **Start Onboarding**:
   ```bash
   curl http://localhost:3000/api/auth/onboarding
   ```

2. **Slack OAuth**:
   - Open: `http://localhost:3000/api/auth/slack`
   - Should redirect to Slack for authorization
   - After approval, should redirect back with success

3. **Google OAuth** (requires Slack auth first):
   - First get a JWT token from Slack auth
   - Use token to access: `http://localhost:3000/api/auth/google`

4. **Check Status**:
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        http://localhost:3000/api/auth/status
   ```

### Automated Testing:

For automated tests, you can use mock credentials since we're testing the flow logic, not actual OAuth:

```bash
# Run unit tests (uses mock credentials)
npm test

# Run integration tests (requires real environment)
npm run test:integration
```

## Troubleshooting

### Common Issues:

1. **Ngrok URL changes**: Update all redirect URIs when ngrok restarts
2. **OAuth errors**: Check redirect URIs match exactly
3. **Database connection**: Ensure PostgreSQL is running on correct port
4. **Redis connection**: Ensure Redis is running for job queues
5. **CORS errors**: Check frontend/backend URL configuration

### Debug Endpoints:

- Health check: `http://localhost:3000/health`
- API info: `http://localhost:3000/api`
- Slack webhook health: `http://localhost:3000/webhooks/slack/health`

## Security Notes

- **Never commit real credentials** to version control
- Use strong, unique secrets for JWT and encryption
- OAuth apps should be configured for development domains only
- Rotate credentials regularly
- Use HTTPS (ngrok provides this) for all OAuth flows

## Next Steps

Once authentication is working:

1. Test the complete flow: Slack message → Task detection → User confirmation → Calendar scheduling
2. Implement User Story 2 (Calendar Scheduling)
3. Create frontend integration
4. Deploy to production environment

---

**Note**: This setup enables the complete OAuth flow for User Story 3. The authentication system will now work with User Story 1 (Task Detection) to provide a complete end-to-end experience.