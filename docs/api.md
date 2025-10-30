# Tandem Slack Bot API Documentation

**Version**: 1.0.0  
**Base URL**: `http://localhost:3000/api` (development) | `https://api.tandem.com/api` (production)  
**Date**: October 29, 2025

## Overview

The Tandem Slack Bot API provides workspace-aware endpoints for AI-powered task detection, calendar scheduling, and preference management. All API endpoints require workspace context and proper authentication.

## Authentication

All API endpoints (except webhooks) require Bearer token authentication:

```
Authorization: Bearer <your-jwt-token>
```

### Getting Started

1. **Workspace Installation**: Install Tandem app in your Slack workspace
2. **User Authentication**: Authenticate with Slack and Google Calendar  
3. **API Access**: Use JWT tokens for API requests

## Workspace Context

All requests must include workspace context. The API automatically extracts workspace information from the authenticated user's profile.

### Workspace Headers

The API client automatically includes workspace context:

```
X-Workspace-ID: <workspace-uuid>
```

## Core Endpoints

### Health Check

#### GET /health
Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T10:00:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "slack": "healthy",
    "google": "healthy"
  }
}
```

## Authentication Endpoints

### Slack Authentication

#### GET /auth/slack
Initiate Slack OAuth flow for user authentication.

**Query Parameters:**
- `workspace` (optional): Workspace ID for context

**Response:**
```json
{
  "success": true,
  "authUrl": "https://slack.com/oauth/v2/authorize?..."
}
```

#### GET /auth/slack/callback
Handle Slack OAuth callback (automatic redirect).

#### POST /auth/slack/revoke
Revoke Slack authentication.

**Response:**
```json
{
  "success": true,
  "message": "Slack authentication revoked"
}
```

#### GET /auth/slack/status
Get Slack authentication status.

**Response:**
```json
{
  "connected": true,
  "isValid": true,
  "lastUpdated": "2025-10-29T09:00:00Z"
}
```

### Google Authentication

#### GET /auth/google
Initiate Google OAuth flow for calendar access.

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/oauth/authorize?..."
}
```

#### GET /auth/google/callback
Handle Google OAuth callback (automatic redirect).

#### POST /auth/google/revoke
Revoke Google authentication.

#### GET /auth/google/status
Get Google authentication status.

**Response:**
```json
{
  "connected": true,
  "isValid": true,
  "isExpired": false,
  "expiresIn": 3600,
  "lastUpdated": "2025-10-29T09:00:00Z"
}
```

### Authentication Status

#### GET /auth/status
Get overall authentication status.

**Response:**
```json
{
  "slack": {
    "connected": true,
    "isValid": true,
    "lastUpdated": "2025-10-29T09:00:00Z"
  },
  "google": {
    "connected": true,
    "isValid": true,
    "isExpired": false,
    "expiresIn": 3600,
    "lastUpdated": "2025-10-29T09:00:00Z"
  }
}
```

## Task Management

### Get Tasks

#### GET /tasks
Retrieve user's tasks with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by task status (`PENDING`, `CONFIRMED`, `SCHEDULED`, `COMPLETED`, `DISMISSED`)
- `limit` (optional): Number of tasks per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "tasks": [
    {
      "id": "uuid",
      "title": "Review quarterly reports",
      "description": "Analyze Q3 performance metrics",
      "dueDate": "2025-11-01T17:00:00Z",
      "estimatedDuration": 60,
      "importance": "HIGH",
      "derivedUrgency": "MEDIUM",
      "status": "CONFIRMED",
      "createdAt": "2025-10-29T10:00:00Z",
      "updatedAt": "2025-10-29T10:30:00Z",
      "slackMessageId": "uuid",
      "calendarEvent": {
        "id": "uuid",
        "googleEventId": "google-event-id",
        "startTime": "2025-10-30T14:00:00Z",
        "endTime": "2025-10-30T15:00:00Z",
        "isActive": true
      }
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasNext": false
  }
}
```

### Get Task

#### GET /tasks/{taskId}
Get specific task by ID.

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "title": "Review quarterly reports",
    "description": "Analyze Q3 performance metrics",
    "dueDate": "2025-11-01T17:00:00Z",
    "estimatedDuration": 60,
    "importance": "HIGH",
    "derivedUrgency": "MEDIUM",
    "status": "CONFIRMED",
    "createdAt": "2025-10-29T10:00:00Z",
    "updatedAt": "2025-10-29T10:30:00Z"
  }
}
```

### Update Task Status

#### PATCH /tasks/{taskId}/status
Update task status.

**Request Body:**
```json
{
  "status": "COMPLETED"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "status": "COMPLETED",
    "updatedAt": "2025-10-29T10:45:00Z"
  }
}
```

### Complete Task

#### POST /tasks/{taskId}/complete
Mark task as complete and handle calendar cleanup.

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "status": "COMPLETED",
    "completedAt": "2025-10-29T10:45:00Z"
  },
  "calendarEvent": {
    "removed": true,
    "googleEventId": "google-event-id"
  }
}
```

### Schedule Task

#### POST /tasks/{taskId}/schedule
Schedule task in calendar with optional preferred time.

**Request Body (optional):**
```json
{
  "preferredStartTime": "2025-10-30T14:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "status": "SCHEDULED"
  },
  "calendarEvent": {
    "id": "uuid",
    "googleEventId": "google-event-id",
    "startTime": "2025-10-30T14:00:00Z",
    "endTime": "2025-10-30T15:00:00Z",
    "calendarLink": "https://calendar.google.com/calendar/event?eid=..."
  }
}
```

### Reschedule Task

#### PUT /tasks/{taskId}/schedule
Reschedule existing task to new time.

**Request Body:**
```json
{
  "newStartTime": "2025-10-30T16:00:00Z",
  "reason": "Conflict with meeting"
}
```

### Find Alternative Times

#### GET /tasks/{taskId}/alternatives
Get alternative scheduling options for a task.

**Query Parameters:**
- `count` (optional): Number of alternatives (default: 3, max: 10)

**Response:**
```json
{
  "success": true,
  "taskId": "uuid",
  "alternatives": [
    {
      "start": "2025-10-30T14:00:00Z",
      "end": "2025-10-30T15:00:00Z",
      "confidence": 0.95
    },
    {
      "start": "2025-10-30T16:00:00Z", 
      "end": "2025-10-30T17:00:00Z",
      "confidence": 0.87
    }
  ],
  "count": 2
}
```

## Work Preferences

### Get Preferences

#### GET /preferences
Get user's work preferences.

**Response:**
```json
{
  "success": true,
  "preferences": {
    "weeklyHours": {
      "monday": { "start": "09:00", "end": "17:00" },
      "tuesday": { "start": "09:00", "end": "17:00" },
      "wednesday": { "start": "09:00", "end": "17:00" },
      "thursday": { "start": "09:00", "end": "17:00" },
      "friday": { "start": "09:00", "end": "17:00" },
      "saturday": null,
      "sunday": null
    },
    "breakTimes": {
      "lunch": { "start": "12:00", "end": "13:00" }
    },
    "timezone": "UTC",
    "hasCustomPreferences": true,
    "lastUpdated": "2025-10-29T10:00:00Z"
  }
}
```

### Create Preferences

#### POST /preferences
Create user's work preferences.

**Request Body:**
```json
{
  "weeklyHours": {
    "monday": { "start": "09:00", "end": "17:00" },
    "tuesday": { "start": "09:00", "end": "17:00" },
    "wednesday": { "start": "09:00", "end": "17:00" },
    "thursday": { "start": "09:00", "end": "17:00" },
    "friday": { "start": "09:00", "end": "17:00" },
    "saturday": null,
    "sunday": null
  },
  "breakTimes": {
    "lunch": { "start": "12:00", "end": "13:00" },
    "morning": { "start": "10:30", "end": "10:45" }
  },
  "timezone": "America/New_York"
}
```

### Update Preferences

#### PUT /preferences
Update user's work preferences (partial updates supported).

**Request Body:**
```json
{
  "timezone": "America/Los_Angeles",
  "breakTimes": {
    "lunch": { "start": "12:30", "end": "13:30" }
  }
}
```

### Reset Preferences

#### POST /preferences/reset
Reset preferences to workspace defaults.

**Request Body (optional):**
```json
{
  "timezone": "UTC"
}
```

### Validate Preferences

#### POST /preferences/validate
Validate preferences without saving.

**Request Body:**
```json
{
  "weeklyHours": {
    "monday": { "start": "09:00", "end": "17:00" }
  },
  "breakTimes": {
    "lunch": { "start": "12:00", "end": "13:00" }
  },
  "timezone": "UTC"
}
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "isValid": true,
    "validationErrors": []
  }
}
```

### Preference Templates

#### GET /preferences/templates
Get available preference templates.

**Response:**
```json
{
  "success": true,
  "templates": [
    {
      "name": "Standard Business Hours",
      "description": "9 AM to 5 PM, Monday through Friday with 1-hour lunch",
      "weeklyHours": {
        "monday": { "start": "09:00", "end": "17:00" }
      },
      "breakTimes": {
        "lunch": { "start": "12:00", "end": "13:00" }
      },
      "timezone": "UTC"
    }
  ],
  "count": 4
}
```

#### POST /preferences/templates/apply
Apply a preference template.

**Request Body:**
```json
{
  "templateName": "Standard Business Hours",
  "timezone": "America/New_York"
}
```

## Workspace Management

### Get Workspace

#### GET /workspace/{workspaceId}
Get workspace information.

**Response:**
```json
{
  "success": true,
  "workspace": {
    "id": "uuid",
    "slackTeamId": "T1234567",
    "slackTeamName": "Acme Corp",
    "isActive": true,
    "installedAt": "2025-10-28T10:00:00Z",
    "updatedAt": "2025-10-29T10:00:00Z"
  }
}
```

### Workspace Installation

#### GET /workspace/install
Generate Slack app installation URL.

**Query Parameters:**
- `redirect_to` (optional): URL to redirect after installation

**Response:**
```json
{
  "success": true,
  "installUrl": "https://slack.com/oauth/v2/authorize?...",
  "message": "Click the URL to install Tandem in your Slack workspace"
}
```

## Webhooks

### Slack Events

#### POST /webhooks/slack/events
Handle incoming Slack events (public endpoint).

**Security**: Verified via Slack signing secret

**Request Types:**
- `url_verification`: Initial setup verification
- `event_callback`: Message events for task detection

### Slack Interactions

#### POST /webhooks/slack/interactions
Handle Slack interactive components (public endpoint).

**Security**: Verified via Slack signing secret

**Interaction Types:**
- Button clicks (task confirmations)
- Modal submissions
- Shortcut commands

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Human readable error message",
  "details": "Additional error details",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

- `200`: Success
- `201`: Created successfully  
- `400`: Bad request (validation errors)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found
- `429`: Rate limited
- `500`: Internal server error

### Error Types

- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_ERROR`: Authentication required or failed
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `WORKSPACE_ERROR`: Workspace context issues
- `INTEGRATION_ERROR`: External service errors (Slack/Google)
- `SCHEDULING_ERROR`: Calendar scheduling failures
- `RATE_LIMIT_ERROR`: Too many requests

## Rate Limiting

- **General API**: 100 requests per minute per user
- **Webhooks**: 1000 requests per minute per workspace
- **Authentication**: 10 requests per minute per IP

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635523200
```

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit`: Items per page (max 100)
- `offset`: Starting position

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Data Formats

### Timestamps
All timestamps use ISO 8601 format in UTC:
```
2025-10-29T14:30:00Z
```

### Time Values
Work hours and break times use HH:MM format:
```
"09:00", "17:30"
```

### Timezones
Valid IANA timezone strings:
```
"UTC", "America/New_York", "Europe/London"
```

### Task Status Values
- `PENDING`: Detected but not confirmed
- `CONFIRMED`: User confirmed the task
- `SCHEDULED`: Scheduled in calendar
- `COMPLETED`: Task finished
- `DISMISSED`: User dismissed the task

### Task Importance/Urgency
- `LOW`, `MEDIUM`, `HIGH`

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ApiClient } from '@tandem/sdk';

const client = new ApiClient({
  baseUrl: 'https://api.tandem.com/api',
  token: 'your-jwt-token'
});

// Get tasks
const tasks = await client.getTasks({
  status: 'CONFIRMED',
  limit: 20
});

// Schedule task
const result = await client.scheduleTask('task-id', {
  preferredStartTime: '2025-10-30T14:00:00Z'
});

// Update preferences
await client.updatePreferences({
  timezone: 'America/New_York',
  weeklyHours: {
    monday: { start: '08:00', end: '16:00' }
  }
});
```

### Python

```python
from tandem_sdk import TandemClient

client = TandemClient(
    base_url='https://api.tandem.com/api',
    token='your-jwt-token'
)

# Get tasks
tasks = client.get_tasks(status='CONFIRMED', limit=20)

# Schedule task
result = client.schedule_task('task-id', 
    preferred_start_time='2025-10-30T14:00:00Z')

# Update preferences
client.update_preferences(
    timezone='America/New_York',
    weekly_hours={'monday': {'start': '08:00', 'end': '16:00'}}
)
```

## Support

- **Documentation**: https://docs.tandem.com
- **API Support**: api-support@tandem.com
- **Status Page**: https://status.tandem.com
- **GitHub**: https://github.com/tandem/api

## Changelog

### v1.0.0 (2025-10-29)
- Initial API release
- Multi-workspace architecture
- Task detection and scheduling
- Work preferences management
- Slack and Google Calendar integrations