#!/bin/bash

# Ngrok setup script for Tandem Slack Bot development
# This script helps set up ngrok for local webhook development

set -e

NGROK_CONFIG_DIR="$HOME/.ngrok2"
NGROK_CONFIG_FILE="$NGROK_CONFIG_DIR/ngrok.yml"

echo "🚀 Setting up ngrok for Tandem Slack Bot development..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed. Please install ngrok first:"
    echo "   Visit: https://ngrok.com/download"
    echo "   Or use: snap install ngrok (on Ubuntu)"
    exit 1
fi

# Create ngrok config directory if it doesn't exist
mkdir -p "$NGROK_CONFIG_DIR"

# Check if config file exists
if [ ! -f "$NGROK_CONFIG_FILE" ]; then
    echo "📝 Creating ngrok configuration file..."
    cat > "$NGROK_CONFIG_FILE" << EOF
version: "2"
authtoken: YOUR_NGROK_AUTH_TOKEN_HERE
tunnels:
  tandem-backend:
    addr: 3000
    proto: http
    hostname: your-custom-domain.ngrok.io  # Optional: requires paid plan
    bind_tls: true
  tandem-frontend:
    addr: 3001
    proto: http
    bind_tls: true
EOF
    echo "✅ Created ngrok config at: $NGROK_CONFIG_FILE"
    echo "📝 Please edit the config file and add your ngrok auth token"
else
    echo "ℹ️  ngrok config already exists at: $NGROK_CONFIG_FILE"
fi

# Create helper scripts
echo "📝 Creating ngrok helper scripts..."

# Start backend tunnel script
cat > "$(dirname "$0")/start-backend-tunnel.sh" << 'EOF'
#!/bin/bash
echo "🌐 Starting ngrok tunnel for backend (port 3000)..."
ngrok start tandem-backend
EOF

# Start frontend tunnel script  
cat > "$(dirname "$0")/start-frontend-tunnel.sh" << 'EOF'
#!/bin/bash
echo "🌐 Starting ngrok tunnel for frontend (port 3001)..."
ngrok start tandem-frontend
EOF

# Start both tunnels script
cat > "$(dirname "$0")/start-all-tunnels.sh" << 'EOF'
#!/bin/bash
echo "🌐 Starting ngrok tunnels for both backend and frontend..."
ngrok start tandem-backend tandem-frontend
EOF

# Make scripts executable
chmod +x "$(dirname "$0")/start-backend-tunnel.sh"
chmod +x "$(dirname "$0")/start-frontend-tunnel.sh"
chmod +x "$(dirname "$0")/start-all-tunnels.sh"

echo "✅ Ngrok setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Get your ngrok auth token from: https://dashboard.ngrok.com/get-started/your-authtoken"
echo "   2. Edit the config file: $NGROK_CONFIG_FILE"
echo "   3. Replace 'YOUR_NGROK_AUTH_TOKEN_HERE' with your actual token"
echo "   4. Start your backend server on port 3000"
echo "   5. Run: ./start-backend-tunnel.sh"
echo ""
echo "🔧 Available scripts:"
echo "   - start-backend-tunnel.sh: Start tunnel for backend only"
echo "   - start-frontend-tunnel.sh: Start tunnel for frontend only"  
echo "   - start-all-tunnels.sh: Start tunnels for both"
echo ""
echo "🌐 Your webhook URL will be: https://YOUR_SUBDOMAIN.ngrok.io/webhooks/slack"
echo "   Configure this URL in your Slack app settings"