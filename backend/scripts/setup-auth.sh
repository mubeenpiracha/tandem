#!/bin/bash

# Authentication Setup Helper Script
# This script helps set up the development environment for OAuth testing

echo "🔐 Tandem Authentication Setup Helper"
echo "====================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from example..."
    cp .env.example .env
    echo "✅ Created .env file"
else
    echo "⚠️  .env file already exists"
fi

echo ""
echo "🔧 Configuration Checklist:"
echo ""

# Check ngrok
if command -v ngrok &> /dev/null; then
    echo "✅ Ngrok is installed"
    echo "   Run: ngrok http 3000"
    echo "   Then update .env with your ngrok URL"
else
    echo "❌ Ngrok not found. Install from: https://ngrok.com/"
fi

echo ""
echo "📋 Manual Steps Required:"
echo ""
echo "1. 🚇 Start ngrok tunnel:"
echo "   ngrok http 3000"
echo ""
echo "2. 📱 Create Slack App:"
echo "   https://api.slack.com/apps"
echo "   - Set redirect URI: https://YOUR_NGROK_URL.ngrok.io/api/auth/slack/callback"
echo "   - Set webhook URL: https://YOUR_NGROK_URL.ngrok.io/webhooks/slack/events"
echo "   - Set interactions URL: https://YOUR_NGROK_URL.ngrok.io/webhooks/slack/interactions"
echo ""
echo "3. 🗓️  Create Google OAuth App:"
echo "   https://console.cloud.google.com/"
echo "   - Enable Google Calendar API"
echo "   - Set redirect URI: https://YOUR_NGROK_URL.ngrok.io/api/auth/google/callback"
echo ""
echo "4. ✏️  Update .env file with your credentials:"
echo "   - SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET"
echo "   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
echo "   - NGROK_DOMAIN, WEBHOOK_BASE_URL"
echo "   - Strong JWT_SECRET and TOKEN_ENCRYPTION_KEY (32+ chars)"
echo ""
echo "5. 🗄️  Start services:"
echo "   docker-compose up -d postgres redis"
echo "   npm run prisma:migrate"
echo "   npm run dev"
echo ""
echo "6. 🧪 Test authentication:"
echo "   curl http://localhost:3000/api/auth/onboarding"
echo "   Open: http://localhost:3000/api/auth/slack"
echo ""

# Check if important env vars are set
echo "🔍 Environment Check:"
echo ""

if [ -f .env ]; then
    source .env
    
    if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
        echo "❌ JWT_SECRET missing or too short (need 32+ chars)"
    else
        echo "✅ JWT_SECRET configured"
    fi
    
    if [ -z "$TOKEN_ENCRYPTION_KEY" ] || [ ${#TOKEN_ENCRYPTION_KEY} -lt 32 ]; then
        echo "❌ TOKEN_ENCRYPTION_KEY missing or too short (need 32+ chars)"
    else
        echo "✅ TOKEN_ENCRYPTION_KEY configured"
    fi
    
    if [ -z "$SLACK_CLIENT_ID" ] || [ "$SLACK_CLIENT_ID" = "your-slack-client-id" ]; then
        echo "❌ SLACK_CLIENT_ID not configured"
    else
        echo "✅ SLACK_CLIENT_ID configured"
    fi
    
    if [ -z "$GOOGLE_CLIENT_ID" ] || [ "$GOOGLE_CLIENT_ID" = "your-google-client-id" ]; then
        echo "❌ GOOGLE_CLIENT_ID not configured"
    else
        echo "✅ GOOGLE_CLIENT_ID configured"
    fi
    
    if [ -z "$NGROK_DOMAIN" ] || [ "$NGROK_DOMAIN" = "your-ngrok-subdomain.ngrok.io" ]; then
        echo "❌ NGROK_DOMAIN not configured"
    else
        echo "✅ NGROK_DOMAIN configured: $NGROK_DOMAIN"
    fi
fi

echo ""
echo "📖 For detailed instructions, see: docs/authentication-setup.md"
echo ""
echo "🚀 Once configured, User Story 3 (Authentication) will be fully functional!"
echo "   This enables User Story 1 (Task Detection) to work with real user tokens."