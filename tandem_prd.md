# 🧭 Tandem - Product Requirements Document {#tandem---product-requirements-document}

**Status:** Draft v1.0 (Finalized) **Author:** Product Team **Last
Updated:** October 27, 2025

## 1. Problem Statement {#problem-statement}

Professionals using Slack as a primary coordination tool are inundated
with messages, leading to action items and commitments being lost in
conversation threads. Manually tracking these tasks by context-switching
to a calendar or to-do list is inefficient, error-prone, and breaks
workflow. This \"context tax\" results in missed deadlines, reduced
productivity, and a calendar that doesn\'t reflect a user\'s true
priorities.

## 2. Product Vision {#product-vision}

Tandem is an AI assistant that transforms Slack conversations into
actionable, automatically scheduled tasks --- seamlessly connecting
Slack and Google Calendar. By detecting, confirming, and scheduling
tasks intelligently, Tandem helps busy professionals stay organized
without manual effort or context switching.

> "Tandem turns your Slack chatter into structured, prioritized calendar
> time --- automatically."

## 3. Business Objectives (MVP) {#business-objectives-mvp}

- **Objective 1 (Validation):** Validate the core hypothesis that users
  > will trust an AI to manage their professional schedule.

- **Objective 2 (Adoption):** Prove that automated task capture from
  > Slack provides enough value for users to complete onboarding
  > (connect Slack + Google Calendar).

- **Objective 3 (Engagement):** Achieve a \"sticky\" product where users
  > rely on Tandem daily for task management, establishing a foundation
  > for future premium features.

## 4. Target Audience & User Goals {#target-audience-user-goals}

### Primary Users

- Founders, executives, project managers, and freelancers who rely on
  > Slack for coordination.

- Professionals managing their day through time-blocking in Google
  > Calendar.

- Remote and distributed team members working across time zones.

### User Goals

- Capture tasks without switching context.

- Keep a clean, complete calendar that reflects real work priorities.

- Avoid losing action items in conversations.

## 5. Core Capabilities (High-Level) {#core-capabilities-high-level}

- **Automatic Task Discovery:** AI-powered detection of tasks,
  > deadlines, and action items from Slack DMs, mentions, and threads.

- **DM Confirmation Flow:** A simple, in-Slack bot message to confirm,
  > edit, or dismiss a detected task before it\'s scheduled.

- **Intelligent Calendar Scheduling:** Integration with Google Calendar
  > to find the best available slot based on due date, importance, and
  > user preferences.

- **Smart \"Push\" Logic:** When no slots are free, Tandem intelligently
  > suggests moving other *Tandem-created tasks* of lower priority.

- **Unified Dashboard:** A web and Slack Home Tab view of all pending,
  > scheduled, and completed tasks.

## 7. Core Features & Scenarios {#core-features-scenarios}

### Feature 1: Automatic Task Discovery

- **Overview:** Tandem monitors Slack messages visible to the user. When
  > a message likely contains an action item, the AI analyzes it and
  > sends a confirmation DM for review.

- **User Story 1.1 --- Detect Task in Slack**

  - **As a user,** I want Tandem to automatically detect when someone
    > assigns me a task in a message **so that** I never miss action
    > items buried in conversation threads.

  - **Triggers:** A message appears in:

    - A Direct Message to the user.

    - A channel where the user is @mentioned.

    - A thread where the user is @mentioned or directly replied to.

  - **System Behavior:**

    - Tandem listens to relevant message events via the Slack Events
      > API.

    - The message text is sent to the OpenAI Completions API for
      > classification and extraction.

    - **AI Extraction:** The model extracts: task_title, description,
      > due_date, importance (Low/Medium/High), and estimated_time.

    - If the model predicts "task = true," Tandem creates a pending task
      > and sends a DM confirmation.

  - **Acceptance Criteria:**

    - AI correctly identifies 80%+ of real tasks during testing.

    - False positives can be dismissed easily in the DM.

    - Detection-to-DM latency is under 10 seconds.

- **User Story 1.2 --- Confirm Task via DM**

  - **As a user,** I want Tandem to confirm extracted task details with
    > me **so that** I can correct or complete any missing information
    > before it's scheduled.

  - **System Behavior:**

    - When a task is detected, Tandem sends a Slack DM:

>   
> 🔍 Tandem detected a new task for you:
>
> "Prepare project update for Monday meeting"
>
> 📅 Due: Select date and time
>
> ⏱️ Estimated Time: Select duration
>
> 🎯 Importance: High
>
> Would you like to create this task?
>
> \[Confirm ✅\] \[Edit ✏️\] \[Dismiss ❌\]

- If the user clicks Edit, a Slack modal opens with mandatory fields:

  - Task title

  - Due date and time (required)

  - Duration / Time to completion (required)

  - Importance (Low/Medium/High)

- Upon confirmation, the task is created and queued for scheduling.

<!-- -->

- **Acceptance Criteria:**

  - User must select a due date and duration before saving.

  - Dismissed tasks are not retained.

### Feature 2: Intelligent Scheduling & Conflict Management {#feature-2-intelligent-scheduling-conflict-management}

- **Overview:** Once a task is confirmed, Tandem finds the best
  > available slot in the user\'s Google Calendar.

- **Internal Logic: Derived Urgency Matrix**

  - To power prioritization, the system will *internally* derive a
    > task\'s urgency from its due date. This is **not** a user-editable
    > field.

  - **High:** Due today or tomorrow.

  - **Medium:** Due in the next 3--7 days.

  - **Low:** Due more than 7 days from now.

  - 

- **User Story 2.1 --- Schedule Confirmed Task**

  - **As a user,** I want Tandem to schedule confirmed tasks and, if no
    > free slot exists, show me *other tasks* that can be pushed **so
    > that** I can decide what gets rescheduled.

  - **System Behavior:**

    - On task confirmation, Tandem evaluates Google Calendar
      > availability within the user's working hours and before the
      > task's due date.

    - **Critical Check:** The scheduler *must* re-fetch calendar
      > availability *just before* creating the event to prevent
      > double-booking.

    - **If a suitable slot is available:** Schedule the task.

    - **If no slot is available:** a. Tandem fetches all *other events
      > in the user\'s calendar that were created by Tandem*. b. It
      > filters this list to find candidates with **Low Derived
      > Urgency** and **Low Importance**. c. The Slack bot DMs the user:

\`\`\` ⚠️ Your calendar is full before the deadline for: "Prepare
project update for Monday meeting"

>   
> I found a few lower-priority \*tasks\* that could be moved:
>
> 1️⃣ "Email recap to team" -- Tomorrow 3 PM (Low Importance)
>
> 2️⃣ "Review design draft" -- Friday 11 AM (Low Importance)
>
> Would you like to push any of these to make room?
>
> \[Push \#1\] \[Push \#2\] \[Schedule at Next Available Time\]
>
> \`\`\`

  
On user selection, Tandem reschedules the old task and places the new
task in its slot.

**Acceptance Criteria:**

- The \"push\" logic *never* suggests moving events that were not
  > created by Tandem.

- If no candidates are found, the bot only offers \"Schedule at Next
  > Available Time\".

### Feature 3: Preferences & Settings {#feature-3-preferences-settings}

- **User Story 3.1 --- Configure Work Preferences**

  - **As a user,** I want to define my daily work hours and break times
    > **so that** Tandem can schedule intelligently within my available
    > hours.

  - **System Behavior:**

    - Preferences are stored in Tandem's database and respected by the
      > scheduling engine.

    - Adjustable from the Web dashboard (Settings page) or a Slack
      > command (/tandem settings).

  - **Acceptance Criteria:**

    - Users can set unique start/end hours for each weekday.

    - Scheduler always respects these constraints.

### Feature 4: Real-Time Dashboard

- **User Story 4.1 --- View and Manage Tasks**

  - **As a user,** I want to view all my pending, scheduled, and
    > completed tasks in a single dashboard **so that** I can track my
    > workload visually.

  - **System Behavior:**

    - **Web Dashboard:** A full-view dashboard with:

      - Summary of upcoming and pending tasks.

      - Calendar view (synced with Google).

      - **Priority Matrix:** A \"Derived Urgency × Importance\"
        > quadrant.

      - History view of completed tasks.

    - **Slack App Home Tab:** A lightweight overview of the top 5
      > upcoming tasks.

    - Completion process for past events

  - **Acceptance Criteria:**

    - All tasks reflect consistent states across Slack, web, and Google
      > Calendar.

    - The Priority Matrix is interactive (click quadrant → filter view).

### Feature 5: Onboarding & Login Flow {#feature-5-onboarding-login-flow}

- **Overview:** Allow users to sign up and connect their accounts, even
  > if the Slack bot was installed company-wide.

- **Clarified Onboarding Logic:**

  - The Tandem bot is installed via an admin (company-wide) and uses its
    > **bot token** to listen for events in public channels it is
    > invited to.

  - When it detects a message that **@mentions** a user, it checks its
    > database for that Slack User ID.

  - **If the User ID is NOT found (unregistered):**

    - The bot\'s *only* action is to send that user a private DM:

>   
> 👋 Hi there! To get started with Tandem,
>
> please connect your account so I can create tasks for you.
>
> \[Sign Up & Connect 🔗\]

- The bot **must not** analyze the message for a task or store any part
  > of it.

<!-- -->

- **If the User ID IS found (registered):**

  - The bot proceeds with the normal AI task detection flow (Feature 1)
    > using that user\'s specific, authorized permissions.

<!-- -->

- **User Story 5.1 --- Sign Up and Connect**

  - **As a user,** I want to sign up for Tandem and securely connect my
    > Slack and Google accounts **so that** the bot can work on my
    > behalf.

  - **System Behavior:**

    - User clicks the \"Sign Up\" link from the Slack DM or visits the
      > web app.

    - User registers via Email + Password or Login with Google.

    - After login, they are prompted to connect Slack (OAuth) and Google
      > Calendar (OAuth).

    - Both connections are required before the bot can schedule tasks.

  - **Acceptance Criteria:**

    - Onboarding flow clearly explains what permissions are required and
      > why.

    - Bot confirms setup is complete via DM.

### Feature 6: Dashboard & Task Management {#feature-6-dashboard-task-management}

- **User Story 6.1 --- Complete a Task from Slack**

  - **As a user,** I want to mark a task as \'complete\' directly from
    > my Slack Home Tab **so that** my schedule is cleared and my
    > dashboard is up-to-date.

  - **System Behavior:**

    - The Slack App Home Tab displays upcoming tasks.

    - Each task has a \[✅ Mark Complete\] button next to it.

    - When a user clicks it, Tandem sends a confirmation DM: Did you
      > complete the task: \"Prepare Q3 report\"? \[Yes, Complete\]
      > \[Not Yet\]

    - If the user clicks \[Yes, Complete\], Tandem will: a. Update the
      > task status to \"Completed\" in its database. b. **Delete the
      > corresponding event from the user\'s Google Calendar** to keep
      > their schedule clean.

  - **Acceptance Criteria:**

    - Task status is updated in the database and web dashboard.

    - The event is successfully removed from the user\'s Google
      > Calendar.

## 8. Technical Architecture (MVP) {#technical-architecture-mvp}

- **Authentication:** Users register via Email + Password or Google
  > OAuth. They must then connect Slack (OAuth) and Google Calendar
  > (OAuth).

- **Slack Integration:**

  - Installed **company-wide** (admin).

  - **Bot Token:** Used to send DMs and listen for @mentions in public
    > channels.

  - **User Token (Per-User):** Used to read messages visible *only* to
    > the authorized user (DMs, private channels, threads) for task
    > detection.

- **AI Task Detection:**

  - Uses **OpenAI Completions API** (e.g., gpt-4o-mini) for task
    > classification and entity extraction.

  - AI prompt must be version-controlled.

  - **Error Handling:** Implement exponential backoff for API failures
    > (e.g., 5xx, 429). Gracefully handle malformed AI responses and log
    > them, but do not send a broken DM to the user.

- **Scheduling Engine:**

  - Uses Google Calendar API.

  - Logic for availability respects user work hours and breaks.

  - **Source of Truth:** Google Calendar is the source of truth for
    > time/availability. The Tandem DB is the source of truth for task
    > metadata (Importance, Slack message ID, etc.).

- **Database:** PostgreSQL (tasks, users, preferences, message IDs).

- **Backend:** FastAPI / Node.js

- **Frontend:** React + Tailwind (web), Slack UI Kit (modals, home tab).

## 9. Engineering Guidance & Development {#engineering-guidance-development}

- **Webhook Tunneling:** The local development environment **must** use
  > a tunneling service (e.g., ngrok) to receive live webhooks from the
  > Slack Events API and Google Calendar push notifications.

- **Environment-Specific Credentials:** The team **must** create and
  > maintain separate Slack App and Google OAuth projects for local,
  > dev, and prod environments, each with its own API keys, secrets, and
  > redirect URIs.

- **API Mocking:** For automated testing (unit, integration), the team
  > **must** mock the API responses from Slack, Google, and OpenAI to
  > ensure reliable, fast, and non-flakey test runs.

## 10. Security & Compliance {#security-compliance}

- **Data Retention:** No message *text* is retained; only message ID
  > references.

- **Token Management:** OAuth tokens are encrypted at rest and refreshed
  > automatically.

- **Data Isolation:** Multi-tenant architecture with strict per-user
  > data isolation. An admin cannot see a user\'s tasks.

- **Compliance:** GDPR-ready (no message storage, opt-in authorization).

## 11. Out of Scope (for MVP) {#out-of-scope-for-mvp}

- Multi-calendar support (Outlook, Apple Calendar)

- Delegation or task assignment between users

- Admin console or team billing

- Auto-scheduling *without* user confirmation

- Message backfill scanning

- Meeting-free day configuration

## 12. Success Metrics {#success-metrics}

- **Activation Rate:** % of users who start onboarding and successfully
  > connect both Slack and Google Calendar.

- **Adoption Rate:** % of detected tasks that are \"Confirmed\" by users
  > (vs. \"Dismissed\").

- **Engagement:** Daily Active Users (DAU) with at least one scheduled
  > task.

- **Retention:** % of users who are still active 30 days after signup.
