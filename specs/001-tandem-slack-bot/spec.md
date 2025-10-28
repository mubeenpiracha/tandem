# Feature Specification: Tandem Slack Bot

**Feature Branch**: `001-tandem-slack-bot`  
**Created**: October 27, 2025  
**Status**: Draft  
**Input**: User description: "tandem a slack bot that streamlines people's calendars"

## Clarifications

### Session 2025-10-27

- Q: What happens when AI task detection accuracy falls below 80% threshold in production? → A: Continue operating but log accuracy metrics for monitoring
- Q: How should the system behave when no lower-priority Tandem-created tasks exist to reschedule during conflicts? → A: Schedule at next available time after due date with user notification
- Q: What happens when AI cannot determine a reasonable duration estimate for a task? → A: Require user to manually specify duration before task can be scheduled, with all fields shown to user with edit options
- Q: What default work hours should be used for new users before they set preferences? → A: Standard business hours (9 AM - 5 PM, Monday-Friday, user's timezone)
- Q: How should dismissed tasks be handled for data retention? → A: Store Message ID and task status as ignored, but do not retain message content
- Q: How should Slack tokens be scoped for bot vs user operations? → A: Bot token for DMs/status updates, user token for reading user's messages in all contexts
- Q: What local development setup should be supported for webhook testing? → A: ngrok tunneling for local development only, system must be ready for dev and prod deployment
- Q: How should thread message analysis work for task detection? → A: Analyze individual triggering messages only with thread context for disambiguation

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Task Detection and Confirmation (Priority: P1)

A professional receives a message in Slack that contains an action item or task assignment. Tandem automatically detects this task, extracts relevant details, and sends a direct message to confirm the task before scheduling it on their Google Calendar.

**Why this priority**: This is the core value proposition - automatically capturing tasks from conversations without manual effort or context switching. Without this, there is no product.

**Independent Test**: Can be fully tested by sending a message with a task in Slack, receiving the DM confirmation, and verifying task details are correctly extracted. Delivers immediate value by preventing lost action items.

**Acceptance Scenarios**:

1. **Given** a user is mentioned in a Slack channel with a task, **When** the message is posted, **Then** Tandem sends a DM with extracted task details for confirmation
2. **Given** a user receives a direct message containing an action item, **When** the message is sent, **Then** Tandem detects the task and sends a confirmation DM
3. **Given** a user receives a task confirmation DM, **When** they click "Confirm", **Then** the task is created and queued for scheduling
4. **Given** a user receives a task confirmation DM, **When** they click "Edit", **Then** a modal opens showing all extracted fields (title, description, due date, duration, importance) with ability to modify any field before confirmation
5. **Given** a user receives a task confirmation DM, **When** they click "Dismiss", **Then** the task is discarded and no calendar event is created

---

### User Story 2 - Intelligent Calendar Scheduling (Priority: P1)

Once a task is confirmed, Tandem automatically finds the best available time slot in the user's Google Calendar based on their work hours, the task's due date, and estimated duration.

**Why this priority**: Essential for the core promise of automatic scheduling. Without this, users would still need to manually schedule confirmed tasks.

**Independent Test**: Can be tested by confirming a task and verifying it appears in Google Calendar at an appropriate time slot within work hours and before the due date.

**Acceptance Scenarios**:

1. **Given** a confirmed task with a due date, **When** the user has available slots in their calendar, **Then** Tandem schedules the task in the best available slot
2. **Given** a confirmed task, **When** the user's calendar is full before the due date, **Then** Tandem suggests moving lower-priority Tandem-created tasks
3. **Given** multiple scheduling conflicts, **When** the user selects which tasks to reschedule, **Then** Tandem moves the selected tasks and schedules the new task
4. **Given** a scheduled task, **When** the user marks it complete in Slack, **Then** the corresponding calendar event is removed

---

### User Story 3 - Account Setup and Authorization (Priority: P2)

A new user connects their Slack and Google Calendar accounts to enable Tandem to work on their behalf, with clear understanding of required permissions.

**Why this priority**: Required for the system to function, but can be developed after core detection logic is proven. Users can't benefit from the product without proper authorization.

**Independent Test**: Can be tested by completing the full onboarding flow and verifying both Slack and Google Calendar permissions are properly granted.

**Acceptance Scenarios**:

1. **Given** an unregistered user is mentioned in Slack, **When** Tandem detects this, **Then** it sends a private DM with a signup link
2. **Given** a user clicks the signup link, **When** they complete registration, **Then** they are prompted to connect both Slack and Google Calendar
3. **Given** a user has connected both accounts, **When** setup is complete, **Then** Tandem confirms via DM that the bot is ready to work
4. **Given** a user has not connected required accounts, **When** Tandem detects a task, **Then** it prompts for missing connections instead of processing the task

---

### User Story 4 - Task Management Dashboard (Priority: P3)

Users can view, manage, and track all their pending, scheduled, and completed tasks through both a web dashboard and Slack App Home Tab.

**Why this priority**: Provides valuable visibility and control but is not essential for the core automated workflow. Can be added after proving the automation value.

**Independent Test**: Can be tested by accessing the dashboard, viewing tasks in various states, and performing management actions like marking tasks complete.

**Acceptance Scenarios**:

1. **Given** a user has scheduled tasks, **When** they visit the web dashboard, **Then** they see all pending, scheduled, and completed tasks
2. **Given** a user opens the Slack App Home Tab, **When** they view upcoming tasks, **Then** they see the top 5 upcoming tasks with completion buttons
3. **Given** a user clicks "Mark Complete" on a task, **When** they confirm completion, **Then** the task status updates and the calendar event is removed
4. **Given** a user views the priority matrix, **When** they click on a quadrant, **Then** tasks are filtered by that urgency/importance combination

---

### User Story 5 - Work Preferences Configuration (Priority: P3)

Users can define their daily work hours, break times, and scheduling preferences so Tandem respects their availability when automatically scheduling tasks.

**Why this priority**: Improves scheduling quality but system can function with default work hours initially. Can be enhanced after core functionality is proven.

**Independent Test**: Can be tested by setting custom work hours and verifying tasks are only scheduled within those timeframes.

**Acceptance Scenarios**:

1. **Given** a user accesses settings, **When** they define work hours for each weekday, **Then** Tandem only schedules tasks within those hours
2. **Given** a user sets break times, **When** Tandem schedules tasks, **Then** break periods are respected and left unscheduled
3. **Given** a user modifies their preferences, **When** new tasks are confirmed, **Then** scheduling reflects the updated preferences

---

### Edge Cases

- What happens when AI fails to extract task details correctly or returns malformed responses?
- How does the system handle Google Calendar API rate limits or temporary outages?
- What occurs when a user's calendar becomes unavailable or permissions are revoked?
- How does Tandem behave when Slack webhooks are delayed or fail to deliver?
- What happens when a user tries to schedule a task with a due date in the past?
- How does the system handle tasks with no specified due date or duration?
- What occurs when no lower-priority Tandem tasks exist to reschedule during conflicts?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST monitor Slack messages where the user is mentioned or receives direct messages
- **FR-002**: System MUST use AI to detect and extract task details (title, description, due date, importance, estimated time) from Slack messages
- **FR-003**: System MUST send direct message confirmations for detected tasks with options to confirm, edit, or dismiss
- **FR-004**: System MUST allow users to modify task details through Slack modals before confirmation, with all extracted fields (title, description, due date, duration, importance) shown and editable
- **FR-005**: System MUST require user to manually specify duration when AI cannot determine reasonable estimate before task can be scheduled
- **FR-006**: System MUST integrate with Google Calendar API to check availability and create calendar events
- **FR-007**: System MUST schedule confirmed tasks within user-defined work hours and before due dates
- **FR-008**: System MUST identify scheduling conflicts and suggest rescheduling only Tandem-created tasks of lower priority
- **FR-009**: System MUST schedule tasks at next available time after due date with user notification when no lower-priority tasks exist to reschedule
- **FR-010**: System MUST allow users to mark tasks complete and automatically remove corresponding calendar events
- **FR-011**: System MUST require user authorization for both Slack and Google Calendar access before processing tasks
- **FR-012**: System MUST prevent processing tasks for unregistered users and prompt them to sign up instead
- **FR-013**: System MUST provide web dashboard and Slack App Home Tab views for task management
- **FR-014**: System MUST allow users to configure work hours and scheduling preferences
- **FR-015**: System MUST use default work hours of 9 AM - 5 PM, Monday-Friday in user's timezone for new users until preferences are configured
- **FR-016**: System MUST derive task urgency from due dates (High: 0-2 days, Medium: 3-7 days, Low: 7+ days)
- **FR-017**: System MUST prioritize scheduling based on both user-defined importance and system-derived urgency
- **FR-018**: System MUST implement proper error handling for AI API failures with exponential backoff
- **FR-019**: System MUST continue operating when AI detection accuracy falls below 80% threshold while logging accuracy metrics for monitoring and alerting
- **FR-020**: System MUST store Message ID and task status as ignored for dismissed tasks without retaining message content
- **FR-021**: System MUST use bot token for sending DMs, status updates, and task confirmation messages to users
- **FR-022**: System MUST use per-user OAuth tokens for reading messages from DMs, private channels, and threads visible to each authorized user
- **FR-023**: System MUST support ngrok tunneling for local development webhook testing while maintaining separate environment configurations for dev and prod deployments
- **FR-024**: System MUST maintain environment-specific API keys, secrets, and webhook URLs for local, dev, and prod environments
- **FR-025**: System MUST analyze individual triggering messages for task detection while using thread context only for disambiguation when needed

### Key Entities

- **Task**: Represents an action item with title, description, due date, estimated duration, importance level, derived urgency, current status, and source Slack message reference
- **User**: Represents a person with Slack User ID, connected OAuth tokens for Slack and Google Calendar, work preferences, and timezone information
- **Calendar Event**: Represents scheduled time blocks with start/end times, associated task reference, and Google Calendar event ID
- **Work Preferences**: Represents user-defined availability including daily work hours, break times, and scheduling preferences, with defaults of 9 AM - 5 PM, Monday-Friday in user's timezone

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full onboarding process (signup + connect Slack + connect Google Calendar) in under 5 minutes
- **SC-002**: AI correctly identifies real tasks with 80% accuracy during testing with minimal false positives
- **SC-003**: Task detection and confirmation DM delivery occurs within 10 seconds of the original Slack message
- **SC-004**: 90% of confirmed tasks are successfully scheduled in Google Calendar without conflicts
- **SC-005**: Users can mark tasks complete and see calendar events removed within 30 seconds
- **SC-006**: System maintains 99% uptime for critical webhook processing and task scheduling functions
- **SC-007**: At least 70% of detected tasks are confirmed by users rather than dismissed, indicating valuable task detection
- **SC-008**: Users actively use the system for at least 30 days after initial setup, demonstrating product stickiness
