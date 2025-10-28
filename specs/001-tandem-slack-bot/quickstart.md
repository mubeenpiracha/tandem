# Quickstart Guide: Tandem Slack Bot

**Date**: October 28, 2025  
**Branch**: `001-tandem-slack-bot`

## Prerequisites

- Node.js 20 LTS or higher
- PostgreSQL 14 or higher
- Redis 6 or higher
- Docker and Docker Compose (recommended)
- ngrok account (for local development)
- Slack workspace admin access
- Google Cloud Console access

## Quick Start (Docker)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd tandem
git checkout 001-tandem-slack-bot
cp .env.example .env
```

### 2. Configure Environment
Edit `.env` file with your credentials:
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/tandem_dev"
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key"

# Slack App Configuration
SLACK_BOT_TOKEN="xoxb-your-bot-token"
SLACK_SIGNING_SECRET="your-signing-secret"
SLACK_CLIENT_ID="your-client-id"
SLACK_CLIENT_SECRET="your-client-secret"

# Google OAuth Configuration
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# OpenAI Configuration
OPENAI_API_KEY="sk-your-openai-api-key"

# Development
NODE_ENV="development"
PORT="3000"
FRONTEND_URL="http://localhost:3001"
WEBHOOK_URL="https://your-ngrok-url.ngrok.io"
```

### 3. Start Development Environment
```bash
# Start all services
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
```

### 4. Setup ngrok Tunneling
```bash
# Install ngrok (if not already installed)
npm install -g ngrok

# Start tunnel (in separate terminal)
ngrok http 3000

# Update WEBHOOK_URL in .env with ngrok URL
# Restart development server
```

## Manual Setup (Local Development)

### 1. Install Dependencies
```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 2. Setup Database
```bash
# Start PostgreSQL and Redis
brew services start postgresql
brew services start redis

# Create database
createdb tandem_dev

# Run migrations
cd backend
npx prisma migrate dev
npx prisma generate
```

### 3. Start Development Servers
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Worker processes
cd backend
npm run worker

# Terminal 4: ngrok tunnel
ngrok http 3000
```

## Slack App Setup

### 1. Create Slack App
1. Go to [Slack API](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name: "Tandem" 
4. Select your development workspace

### 2. Configure Bot Token Scopes
Navigate to "OAuth & Permissions" and add these scopes:
```
Bot Token Scopes:
- chat:write (Send messages as bot)
- channels:history (Read public channel messages)
- groups:history (Read private channel messages)
- im:history (Read DM messages)
- mpim:history (Read group DM messages)
- users:read (Get user information)
- app_mentions:read (Detect @mentions)

User Token Scopes:
- channels:history (Read user's channel messages)
- groups:history (Read user's private channels)
- im:history (Read user's DMs)
- mpim:history (Read user's group DMs)
```

### 3. Configure Event Subscriptions
1. Enable Events: ON
2. Request URL: `https://your-ngrok-url.ngrok.io/api/webhooks/slack/events`
3. Subscribe to bot events:
   - `app_mention`
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`

### 4. Configure Interactive Components
1. Enable Interactivity: ON
2. Request URL: `https://your-ngrok-url.ngrok.io/api/webhooks/slack/interactions`

### 5. Install App to Workspace
1. Go to "Install App"
2. Click "Install to Workspace"
3. Authorize the app
4. Copy Bot User OAuth Token to `.env` as `SLACK_BOT_TOKEN`

## Google Cloud Setup

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "tandem-dev"
3. Enable Google Calendar API

### 2. Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" user type
3. Fill required fields:
   - App name: "Tandem"
   - User support email: your email
   - Developer contact: your email

### 3. Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://your-ngrok-url.ngrok.io/api/auth/google/callback`
5. Copy Client ID and Secret to `.env`

## OpenAI Setup

### 1. Get API Key
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Navigate to "API Keys"
3. Create new secret key
4. Copy to `.env` as `OPENAI_API_KEY`

### 2. Configure Usage Limits
1. Set monthly budget limit ($10-50 recommended for development)
2. Enable usage notifications

## Testing the Setup

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```
Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-28T10:00:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "slack": "healthy",
    "google": "healthy"
  }
}
```

### 2. Test Slack Integration
1. Invite bot to a test channel: `/invite @Tandem`
2. Send message: `@Tandem Can you schedule a meeting for tomorrow?`
3. Check bot responds with task confirmation DM

### 3. Test OAuth Flow
1. Visit: `http://localhost:3001`
2. Click "Connect Slack" → should redirect to Slack OAuth
3. Click "Connect Google Calendar" → should redirect to Google OAuth
4. Verify both connections show as active

## Common Issues

### ngrok Connection Issues
```bash
# If webhook URL is unreachable
# 1. Check ngrok is running
curl https://your-ngrok-url.ngrok.io/api/health

# 2. Update Slack app webhook URLs
# 3. Restart ngrok if needed
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Reset database if needed
npx prisma migrate reset
npx prisma generate
```

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### Slack Token Issues
```bash
# Test Slack API connection
curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  https://slack.com/api/auth.test
```

### Google API Issues
```bash
# Check Google Calendar API is enabled
# Verify OAuth redirect URIs match exactly
# Check quota limits in Google Cloud Console
```

## Development Workflow

### 1. Making Changes
```bash
# Backend changes auto-reload with nodemon
# Frontend changes auto-reload with Vite
# Database changes require migration:
npx prisma migrate dev --name feature_name
```

### 2. Testing
```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e
```

### 3. Debugging
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f worker

# Debug with VS Code
# Use provided launch.json configurations
```

## Next Steps

1. **User Onboarding**: Test complete OAuth flow
2. **Task Detection**: Send test messages and verify AI detection
3. **Calendar Integration**: Confirm tasks and check Google Calendar
4. **Dashboard**: Use web interface to manage tasks
5. **Preferences**: Configure work hours and test scheduling

## Production Deployment

When ready for production:

1. **Environment Setup**:
   - Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
   - Use managed Redis (AWS ElastiCache, Google Cloud Memorystore)
   - Deploy to container platform (AWS ECS, Google Cloud Run)

2. **Security**:
   - Use proper SSL certificates
   - Rotate all secrets and API keys
   - Enable audit logging
   - Configure monitoring and alerting

3. **Slack App**:
   - Create production Slack app
   - Submit for Slack App Directory (optional)
   - Configure proper app metadata and icons

For detailed production deployment guide, see `docs/deployment.md`.