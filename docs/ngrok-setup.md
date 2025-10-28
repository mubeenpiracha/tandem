# Ngrok Development Guide

This guide explains how to set up ngrok for local webhook development with the Tandem Slack Bot.

## Why Ngrok?

Slack webhooks require a publicly accessible HTTPS endpoint. Ngrok creates a secure tunnel from your local development server to a public URL, allowing Slack to send webhooks to your local machine.

## Setup

1. **Install ngrok** (if not already installed):
   ```bash
   # Ubuntu/Debian
   sudo snap install ngrok
   
   # macOS
   brew install ngrok/ngrok/ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Run the setup script**:
   ```bash
   ./backend/scripts/ngrok-setup.sh
   ```

3. **Configure your auth token**:
   - Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken
   - Edit `~/.ngrok2/ngrok.yml` 
   - Replace `YOUR_NGROK_AUTH_TOKEN_HERE` with your actual token

## Usage

### Start Backend Tunnel Only
```bash
./backend/scripts/start-backend-tunnel.sh
```

This creates a tunnel for your backend server on port 3000.

### Start Both Backend and Frontend Tunnels
```bash
./backend/scripts/start-all-tunnels.sh
```

This creates tunnels for both backend (3000) and frontend (3001).

## Configure Slack App

1. Copy the ngrok URL from the terminal output (e.g., `https://abc123.ngrok.io`)
2. Go to your Slack app settings at https://api.slack.com/apps
3. Navigate to "Event Subscriptions"
4. Set Request URL to: `https://YOUR_SUBDOMAIN.ngrok.io/webhooks/slack/events`
5. Navigate to "Interactivity & Shortcuts"  
6. Set Request URL to: `https://YOUR_SUBDOMAIN.ngrok.io/webhooks/slack/interactions`

## Development Workflow

1. Start Docker services: `docker-compose up -d`
2. Start backend: `cd backend && npm run dev`
3. Start ngrok tunnel: `./backend/scripts/start-backend-tunnel.sh`
4. Copy ngrok URL to Slack app settings
5. Test webhooks by sending messages in Slack

## Tips

- **Free ngrok URLs change** every time you restart ngrok. You'll need to update your Slack app settings each time.
- **Paid ngrok plans** allow custom domains that don't change.
- **Keep ngrok running** while developing to maintain the webhook connection.
- **Check ngrok web interface** at http://localhost:4040 to see incoming requests.

## Troubleshooting

### "tunnel session failed: only paid plans may use custom domains"
Remove or comment out the `hostname` line in your ngrok config.

### "authentication failed: invalid token"
Check your auth token in `~/.ngrok2/ngrok.yml`.

### Slack says "URL verification failed"
Make sure your backend server is running and the ngrok tunnel is active.