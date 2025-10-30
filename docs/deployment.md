# Tandem Slack Bot Deployment Guide

**Version**: 1.0.0  
**Date**: October 29, 2025  
**Target Environment**: Production deployment with multi-workspace support

## Overview

This guide covers deploying the Tandem Slack Bot to production with proper multi-workspace architecture, security, monitoring, and scalability considerations.

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │    │   Backend   │    │  Database   │
│   (React)   │───▶│  (Node.js)  │───▶│(PostgreSQL)│
└─────────────┘    └─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐    ┌─────────────┐
                   │    Redis    │    │   Webhooks  │
                   │ (Job Queue) │    │   (ngrok)   │
                   └─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Slack     │    │   Google    │
                   │     API     │    │  Calendar   │
                   └─────────────┘    └─────────────┘
```

## Prerequisites

### Infrastructure Requirements

- **Node.js**: v20 LTS or higher
- **PostgreSQL**: v13 or higher
- **Redis**: v6 or higher  
- **SSL Certificate**: Required for webhook endpoints
- **Domain**: For production webhook URLs

### External Services

- **Slack App**: Created and configured
- **Google Cloud Project**: With Calendar API enabled
- **OAuth Applications**: Slack and Google configured

### Minimum System Requirements

- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: 100 Mbps
- **OS**: Ubuntu 20.04 LTS or equivalent

### Recommended Production Requirements

- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Network**: 1 Gbps
- **Load Balancer**: For high availability

## Pre-Deployment Setup

### 1. Slack App Configuration

Create a Slack app at https://api.slack.com/apps

#### App Manifest
```yaml
display_information:
  name: Tandem
  description: AI-powered task detection and calendar scheduling
  background_color: "#2c3e50"
features:
  bot_user:
    display_name: Tandem
    always_online: true
  shortcuts:
    - name: "View Tasks"
      type: "global"
      callback_id: "view_tasks"
      description: "View your detected tasks"
oauth_config:
  scopes:
    user:
      - chat:write
      - channels:read
      - groups:read
      - im:read
      - mpim:read
      - users:read
      - users:read.email
    bot:
      - app_mentions:read
      - chat:write
      - channels:read
      - groups:read
      - im:history
      - im:read
      - im:write
      - mpim:read
      - users:read
      - users:read.email
settings:
  event_subscriptions:
    request_url: https://your-domain.com/webhooks/slack/events
    bot_events:
      - app_mention
      - message.im
  interactivity:
    is_enabled: true
    request_url: https://your-domain.com/webhooks/slack/interactions
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

#### Required Scopes

**Bot Token Scopes:**
- `app_mentions:read`: Detect mentions in channels
- `chat:write`: Send DM confirmations
- `channels:read`: Access public channels
- `groups:read`: Access private channels
- `im:history`: Read DM history
- `im:read`: Access DMs
- `im:write`: Send DMs
- `users:read`: Get user information
- `users:read.email`: Get user emails

**User Token Scopes:**
- `chat:write`: Send messages as user
- `channels:read`: Read user's channels
- `users:read`: Read user profile

### 2. Google Cloud Setup

#### Enable APIs
```bash
gcloud services enable calendar.googleapis.com
gcloud services enable oauth2.googleapis.com
```

#### Create OAuth 2.0 Credentials
1. Go to Google Cloud Console
2. Navigate to APIs & Services > Credentials
3. Create OAuth 2.0 Client ID
4. Configure authorized redirect URIs:
   - `https://your-domain.com/api/auth/google/callback`

#### Service Account (Optional)
For enhanced calendar operations:
```bash
gcloud iam service-accounts create tandem-calendar \
    --description="Tandem Calendar Service" \
    --display-name="Tandem Calendar"

gcloud iam service-accounts keys create credentials.json \
    --iam-account=tandem-calendar@your-project.iam.gserviceaccount.com
```

### 3. Database Setup

#### PostgreSQL Installation
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE tandem_production;
CREATE USER tandem_user WITH ENCRYPTED PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE tandem_production TO tandem_user;
\q
```

#### Database Configuration
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create application role
CREATE ROLE tandem_app;
GRANT CONNECT ON DATABASE tandem_production TO tandem_app;
GRANT USAGE ON SCHEMA public TO tandem_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tandem_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tandem_app;
```

#### Redis Installation
```bash
# Ubuntu/Debian
sudo apt install redis-server

# Configure Redis
sudo vim /etc/redis/redis.conf
# Set: maxmemory 2gb
# Set: maxmemory-policy allkeys-lru

# Enable and start
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## Environment Configuration

### Production Environment Variables

Create `/opt/tandem/.env.production`:

```bash
# Environment
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://tandem_user:secure-password@localhost:5432/tandem_production
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-256-bits-minimum
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Slack Configuration
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_SIGNING_SECRET=your-slack-signing-secret

# Google Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Server Configuration
SERVER_BASE_URL=https://your-domain.com
FRONTEND_URL=https://app.your-domain.com

# Security
CORS_ORIGIN=https://app.your-domain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/tandem/app.log

# Calendar Configuration
CALENDAR_DEFAULT_DURATION=60
CALENDAR_BUFFER_BETWEEN_TASKS=15
CALENDAR_LOOKAHEAD_DAYS=14

# Job Queue Configuration
QUEUE_REDIS_URL=redis://localhost:6379
QUEUE_DEFAULT_JOB_OPTIONS='{"removeOnComplete":100,"removeOnFail":50}'

# Monitoring
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
METRICS_PORT=9090

# Email (for notifications)
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password
```

### Security Configuration

#### File Permissions
```bash
sudo chmod 600 /opt/tandem/.env.production
sudo chown tandem:tandem /opt/tandem/.env.production
```

#### Firewall Configuration
```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable

# Block direct access to application port
sudo ufw deny 3000/tcp
```

## Application Deployment

### 1. Server Setup

#### Create Application User
```bash
sudo adduser --system --group --shell /bin/bash tandem
sudo mkdir -p /opt/tandem
sudo chown -R tandem:tandem /opt/tandem
```

#### Install Node.js
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version
```

### 2. Application Build

#### Clone and Build
```bash
sudo -u tandem bash
cd /opt/tandem

# Clone repository
git clone https://github.com/your-org/tandem.git .

# Install dependencies
cd backend
npm ci --production

cd ../frontend  
npm ci
npm run build

# Set up production build
cp -r build /opt/tandem/backend/public
```

#### Database Migration
```bash
cd /opt/tandem/backend
npx prisma migrate deploy
npx prisma generate
```

### 3. Process Management

#### systemd Service Configuration

Create `/etc/systemd/system/tandem.service`:

```ini
[Unit]
Description=Tandem Slack Bot
Documentation=https://docs.tandem.com
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=tandem
Group=tandem
WorkingDirectory=/opt/tandem/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/tandem/.env.production
ExecStart=/usr/bin/node src/app.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
TimeoutStopSec=20
LimitNOFILE=65536

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/tandem /var/log/tandem

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tandem

[Install]
WantedBy=multi-user.target
```

#### Enable and Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable tandem
sudo systemctl start tandem

# Check status
sudo systemctl status tandem
```

### 4. Reverse Proxy Configuration

#### Nginx Configuration

Install Nginx:
```bash
sudo apt install nginx
```

Create `/etc/nginx/sites-available/tandem`:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=webhooks:10m rate=100r/s;

# Upstream backend
upstream tandem_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

# HTTPS redirect
server {
    listen 80;
    server_name your-domain.com app.your-domain.com;
    return 301 https://$server_name$request_uri;
}

# Main application
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/tandem.access.log;
    error_log /var/log/nginx/tandem.error.log;

    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://tandem_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Webhooks (higher rate limits)
    location /webhooks/ {
        limit_req zone=webhooks burst=200 nodelay;
        
        proxy_pass http://tandem_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
    }

    # Health check
    location /health {
        proxy_pass http://tandem_backend;
        access_log off;
    }

    # Default
    location / {
        return 404;
    }
}

# Frontend application
server {
    listen 443 ssl http2;
    server_name app.your-domain.com;

    # SSL configuration (same as above)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory
    root /opt/tandem/backend/public;
    index index.html;

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/tandem /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL Certificate

#### Using Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d app.your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Multi-Workspace Configuration

### Workspace Isolation

#### Database Isolation
All data is workspace-scoped using the `workspaceId` field:

```sql
-- Example workspace-scoped queries
SELECT * FROM tasks WHERE workspace_id = $1;
SELECT * FROM users WHERE workspace_id = $1;
```

#### API Route Protection
All API routes include workspace middleware:

```javascript
// Workspace validation middleware
app.use('/api', workspaceMiddleware);
```

#### Webhook Routing
Slack webhooks are routed by team ID:

```javascript
// Webhook workspace resolution
const workspace = await findWorkspaceBySlackTeamId(teamId);
```

### Scaling Considerations

#### Database Connection Pooling
```javascript
// Prisma configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'error', 'warn'],
  // Connection pooling
  __internal: {
    useQuery: true,
    connectionLimit: 20,
  },
});
```

#### Redis Clustering
```javascript
// Redis cluster configuration
const Redis = require('ioredis');
const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 7000 },
  { host: '127.0.0.1', port: 7001 },
  { host: '127.0.0.1', port: 7002 },
]);
```

## Monitoring and Observability

### 1. Application Logging

#### Log Configuration
```javascript
// Winston logger configuration
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tandem-api' },
  transports: [
    new winston.transports.File({ filename: '/var/log/tandem/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/var/log/tandem/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});
```

#### Log Rotation
```bash
# /etc/logrotate.d/tandem
/var/log/tandem/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        systemctl reload tandem
    endscript
}
```

### 2. Health Checks

#### Application Health Endpoint
```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      slack: await checkSlackAPI(),
      google: await checkGoogleAPI(),
    },
  };
  
  const isHealthy = Object.values(health.services).every(
    service => service === 'healthy'
  );
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

### 3. Metrics Collection

#### Prometheus Metrics
```javascript
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});

const taskDetectionCounter = new prometheus.Counter({
  name: 'task_detections_total',
  help: 'Total number of task detections',
  labelNames: ['workspace_id', 'status']
});

const activeWorkspaces = new prometheus.Gauge({
  name: 'active_workspaces',
  help: 'Number of active workspaces'
});
```

#### Metrics Endpoint
```javascript
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

### 4. External Monitoring

#### Uptime Monitoring
```bash
# Using curl for basic monitoring
#!/bin/bash
# /opt/tandem/scripts/health-check.sh

ENDPOINT="https://your-domain.com/health"
TIMEOUT=10

response=$(curl -s -w "%{http_code}" --max-time $TIMEOUT "$ENDPOINT")
http_code="${response: -3}"

if [ "$http_code" != "200" ]; then
    echo "Health check failed: HTTP $http_code"
    exit 1
fi

echo "Health check passed"
exit 0
```

#### Alerting (using external services)
- **Pingdom**: For uptime monitoring
- **DataDog**: For comprehensive monitoring
- **New Relic**: For application performance
- **Sentry**: For error tracking

## Backup and Recovery

### 1. Database Backup

#### Automated Backups
```bash
#!/bin/bash
# /opt/tandem/scripts/backup-db.sh

BACKUP_DIR="/var/backups/tandem"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tandem_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -h localhost -U tandem_user -d tandem_production > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

#### Cron Job
```bash
# Add to crontab
0 2 * * * /opt/tandem/scripts/backup-db.sh
```

### 2. File Backup

#### Application Backup
```bash
#!/bin/bash
# /opt/tandem/scripts/backup-app.sh

BACKUP_DIR="/var/backups/tandem"
DATE=$(date +%Y%m%d_%H%M%S)
APP_BACKUP="$BACKUP_DIR/app_backup_$DATE.tar.gz"

# Backup application files (excluding node_modules)
tar -czf $APP_BACKUP \
    --exclude='node_modules' \
    --exclude='*.log' \
    --exclude='tmp' \
    /opt/tandem

echo "Application backup completed: $APP_BACKUP"
```

### 3. Recovery Procedures

#### Database Recovery
```bash
# Stop application
sudo systemctl stop tandem

# Restore database
gunzip -c /var/backups/tandem/tandem_backup_YYYYMMDD_HHMMSS.sql.gz | \
    psql -h localhost -U tandem_user -d tandem_production

# Restart application
sudo systemctl start tandem
```

## Security Hardening

### 1. Application Security

#### Environment Variables
```bash
# Secure environment file permissions
sudo chmod 600 /opt/tandem/.env.production
sudo chown tandem:tandem /opt/tandem/.env.production
```

#### JWT Configuration
```javascript
// Strong JWT configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET, // 256-bit minimum
  expiresIn: '24h',
  algorithm: 'HS256',
  issuer: 'tandem-api',
  audience: 'tandem-app'
};
```

#### Input Validation
```javascript
// Comprehensive validation
const { body, validationResult } = require('express-validator');

app.post('/api/tasks', [
  body('title').isLength({ min: 1, max: 255 }).escape(),
  body('description').optional().isLength({ max: 2000 }).escape(),
  body('dueDate').optional().isISO8601(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Process request
});
```

### 2. System Security

#### Fail2Ban Configuration
```ini
# /etc/fail2ban/jail.local
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600
```

#### File Permissions
```bash
# Secure application files
sudo chown -R tandem:tandem /opt/tandem
sudo find /opt/tandem -type f -exec chmod 644 {} \;
sudo find /opt/tandem -type d -exec chmod 755 {} \;
sudo chmod +x /opt/tandem/scripts/*.sh
```

## Performance Optimization

### 1. Database Optimization

#### Indexes
```sql
-- Performance indexes
CREATE INDEX CONCURRENTLY idx_tasks_workspace_status 
ON tasks(workspace_id, status);

CREATE INDEX CONCURRENTLY idx_tasks_user_created 
ON tasks(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_calendar_events_task 
ON calendar_events(task_id, is_active);
```

#### Connection Pooling
```javascript
// Database connection pooling
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 2. Caching Strategy

#### Redis Caching
```javascript
// Caching middleware
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl}`;
    
    try {
      const cached = await client.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      
      // Override res.json to cache response
      const originalJson = res.json;
      res.json = function(body) {
        client.setex(key, duration, JSON.stringify(body));
        originalJson.call(this, body);
      };
      
      next();
    } catch (error) {
      next();
    }
  };
};
```

### 3. Application Optimization

#### Compression
```javascript
const compression = require('compression');
app.use(compression());
```

#### Request Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', apiLimiter);
```

## Maintenance Procedures

### 1. Updates and Patches

#### Application Updates
```bash
#!/bin/bash
# /opt/tandem/scripts/update-app.sh

# Create backup
/opt/tandem/scripts/backup-app.sh
/opt/tandem/scripts/backup-db.sh

# Pull latest code
cd /opt/tandem
git fetch origin
git checkout main
git pull origin main

# Update dependencies
cd backend
npm ci --production

# Run migrations
npx prisma migrate deploy

# Rebuild frontend
cd ../frontend
npm ci
npm run build
cp -r build /opt/tandem/backend/public

# Restart application
sudo systemctl restart tandem

# Verify deployment
sleep 10
curl -f https://your-domain.com/health || echo "Health check failed"
```

#### System Updates
```bash
# Regular system maintenance
sudo apt update
sudo apt upgrade
sudo apt autoremove
sudo apt autoclean
```

### 2. Log Management

#### Log Analysis
```bash
# Check application logs
sudo journalctl -u tandem -f

# Check Nginx logs
sudo tail -f /var/log/nginx/tandem.access.log
sudo tail -f /var/log/nginx/tandem.error.log

# Check application-specific logs
sudo tail -f /var/log/tandem/app.log
```

### 3. Performance Monitoring

#### System Resources
```bash
# Monitor system resources
htop
iostat -x 1
free -h
df -h
```

#### Database Performance
```sql
-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check database size
SELECT pg_size_pretty(pg_database_size('tandem_production'));
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Restart PostgreSQL
sudo systemctl restart postgresql
```

#### 2. Redis Connection Issues
```bash
# Check Redis status
sudo systemctl status redis-server

# Test Redis connection
redis-cli ping

# Restart Redis
sudo systemctl restart redis-server
```

#### 3. Slack Webhook Issues
```bash
# Check webhook logs
sudo grep "webhook" /var/log/nginx/tandem.access.log
sudo journalctl -u tandem | grep -i slack

# Test webhook endpoint
curl -X POST https://your-domain.com/webhooks/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}'
```

#### 4. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout

# Renew certificate
sudo certbot renew --force-renewal -d your-domain.com
```

### Emergency Procedures

#### Service Recovery
```bash
# Quick service restart
sudo systemctl restart tandem nginx postgresql redis-server

# Check all services
sudo systemctl status tandem nginx postgresql redis-server
```

#### Database Recovery
```bash
# Emergency database restore
sudo systemctl stop tandem
# Restore from backup (see Recovery section)
sudo systemctl start tandem
```

## Support and Documentation

### Monitoring Dashboards
- **Application Health**: https://your-domain.com/health
- **Metrics**: https://your-domain.com/metrics
- **Server Status**: Custom monitoring dashboard

### Log Files
- **Application**: `/var/log/tandem/app.log`
- **Nginx Access**: `/var/log/nginx/tandem.access.log`
- **Nginx Error**: `/var/log/nginx/tandem.error.log`
- **System**: `sudo journalctl -u tandem`

### Support Contacts
- **Technical Lead**: tech-lead@your-org.com
- **DevOps Team**: devops@your-org.com
- **Emergency**: +1-XXX-XXX-XXXX

---

This deployment guide provides a comprehensive foundation for running Tandem in production with proper security, monitoring, and maintenance procedures.