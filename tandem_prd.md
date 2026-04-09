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

## 6. User Personas & Journeys {#user-personas-journeys}

### Persona A: The Overloaded Founder

- **Who:** Early-stage startup founder, 3-15 person team. Uses Slack as the company's nervous system — every decision, request, and update flows through it.
- **Pain:** Gets 100+ Slack messages/day. Action items from investors, co-founders, and team members get buried. Calendar is a mess of meetings with no time blocked for actual work.
- **Goal:** Never miss a commitment. Have a calendar that reflects real priorities, not just meetings.

### Persona B: The Remote Project Manager

- **Who:** PM at a mid-size company, managing 2-3 projects across distributed teams in different time zones.
- **Pain:** Spends 30+ minutes/day manually copying action items from Slack threads into a task tracker and then into their calendar. Things still slip through.
- **Goal:** Automate the capture-to-calendar pipeline so they can focus on coordination, not bookkeeping.

### Persona C: The Freelancer / Consultant

- **Who:** Independent professional juggling multiple clients, each with their own Slack workspace.
- **Pain:** Context-switching between clients means tasks from one workspace get lost while working in another. No single view of all commitments.
- **Goal:** A unified task view across all work, auto-scheduled around existing client meetings.

### End-to-End User Journey (Persona A)

1. **Discovery:** Founder's company installs the Tandem Slack app. Tandem sends a welcome DM to each workspace member.
2. **Onboarding:** Founder clicks "Sign Up & Connect" in the DM. Signs up via Google, connects Slack OAuth and Google Calendar OAuth. Sets working hours (9 AM - 6 PM, Mon-Fri) and a lunch break (12 PM - 1 PM).
3. **Task Detection:** A team member posts in #engineering: "@founder Can you review the pitch deck by Wednesday?" Tandem detects this as a task and sends a confirmation DM.
4. **Confirmation:** Founder sees the DM, adjusts the estimated time from 30 min to 1 hour, confirms importance as High, and clicks Confirm.
5. **Scheduling:** Tandem finds a free 1-hour slot on Tuesday afternoon (before the Wednesday deadline) and creates a Google Calendar event: "Review pitch deck".
6. **Conflict:** Later, another task is confirmed but the calendar is full before its deadline. Tandem identifies a lower-priority Tandem-created task and offers to push it. Founder selects which task to move.
7. **Completion:** Founder finishes the review, opens the Slack Home Tab, and clicks "Mark Complete". The calendar event is removed and the task moves to the completed list.
8. **Dashboard:** At the end of the week, founder opens the web dashboard to review completed tasks and see what's queued for next week in the priority matrix.

## 7. Core Features & Scenarios {#core-features-scenarios}

### Task Lifecycle & State Machine {#task-lifecycle-state-machine}

All features in this section operate on tasks that follow a single, well-defined lifecycle. The valid states and transitions are:

**States:**

| State | Description |
|---|---|
| `detected` | AI has identified a potential task from a Slack message. A confirmation DM has been sent. Awaiting user action. |
| `confirmed` | User has confirmed the task (with or without edits). Queued for scheduling. |
| `scheduled` | Task has been placed on the user's Google Calendar. A corresponding calendar event exists. |
| `completed` | User has marked the task as done. The calendar event has been deleted. |
| `dismissed` | User chose to dismiss the detected task. No further action is taken. Task is not retained. |
| `failed` | Scheduling failed after confirmation (e.g., no available slots and user declined to push other tasks). Requires user action to reschedule. |

**Valid Transitions:**

```
detected  → confirmed    (user clicks Confirm or saves Edit modal)
detected  → dismissed    (user clicks Dismiss)
confirmed → scheduled    (scheduler places event on calendar)
confirmed → failed       (no slot available, user declines all options)
scheduled → completed    (user marks task complete)
scheduled → scheduled    (task is rescheduled due to a push or user edit)
failed    → scheduled    (user retries or accepts a new slot)
failed    → dismissed    (user gives up on the task)
```

**Rules:**

- A task can only exist in one state at a time.
- Only `scheduled` tasks have a corresponding Google Calendar event.
- `dismissed` tasks are soft-deleted (retained for analytics) but hidden from all user-facing views.
- The dashboard and Slack Home Tab filter by state: "Pending" = `detected` + `confirmed` + `failed`, "Scheduled" = `scheduled`, "Completed" = `completed`.
- All state transitions are logged with a timestamp for audit and debugging.

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

    - **Event Deduplication:** Slack may retry event deliveries (sends `x-slack-retry-num` and `x-slack-retry-reason` headers). The backend must: (a) Respond with 200 immediately to acknowledge receipt (before processing). (b) Track processed event IDs (`event_id` from the envelope) in a short-lived cache (Redis or in-memory with 5-minute TTL). (c) If a duplicate `event_id` is received, skip processing silently.

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

    - Adjustable from the Web dashboard (Settings page) or the Slack
      > App Home Tab.

  - **Acceptance Criteria:**

    - Users can set unique start/end hours for each weekday.

    - Scheduler always respects these constraints.

### Feature 4: Real-Time Dashboard

- **User Story 4.1 --- View and Manage Tasks**

  - **As a user,** I want to view all my pending, scheduled, and
    > completed tasks in a single dashboard **so that** I can track my
    > workload visually.

  - **System Behavior:**

    - **Web Dashboard:** React + Tailwind SPA. Design language follows **Linear** as the reference UI.

      **UI/Design Guidelines (Linear-inspired)**

      - **Overall feel:** Minimal, fast, professional. Every pixel earns its place — no decorative elements, no heavy borders, no drop shadows on cards. The UI should feel like a sharp tool, not a marketing page.
      - **Layout:** Fixed left sidebar for navigation (icon + label, collapsible to icon-only). Main content area is a single scrollable column, max-width ~960px, centered. No right sidebar for MVP.
      - **Color palette:** Near-monochrome base. Dark-mode-first (dark gray background `#1a1a2e`, lighter surface `#222244`, white text). Light mode supported but secondary. Accent color: a single brand hue (e.g., indigo/violet `#6366f1`) used sparingly for active states, primary buttons, and selected nav items. Importance badges use muted semantic colors: High = soft red, Medium = soft amber, Low = soft gray.
      - **Typography:** Single sans-serif font (Inter). Limited type scale — 3-4 sizes max. Headings are medium-weight (500), not bold. Body text is 14px, secondary/muted text is 12px in `text-muted` (gray-400 on dark, gray-500 on light).
      - **Spacing:** Tight but breathable. 8px base grid. Content density closer to a spreadsheet than a Trello board — show more rows, less chrome per row.
      - **Components:**
        - **Task rows:** Single-line items in a flat list (no cards). Each row: checkbox/status icon, title, due date, importance badge, subtle hover background. Clicking a row opens an inline detail panel (slide-over from right, like Linear's issue detail) — not a full page navigation.
        - **Buttons:** Ghost/text buttons for secondary actions, solid filled for primary. Small, tight padding. No large CTAs inside the app (reserve those for marketing/onboarding).
        - **Modals:** Rare. Prefer inline editing and slide-over panels. When used, modals are compact, centered, with a subtle backdrop blur.
        - **Tables/lists:** No visible borders between rows — use alternating subtle background or whitespace to separate. Column headers in muted uppercase (11px, letter-spaced).
        - **Status indicators:** Small colored dots or pills, not large badges. States map to: Detected = blue dot, Confirmed = yellow dot, Scheduled = green dot, Failed = red dot, Completed = gray checkmark.
        - **Navigation:** Sidebar items: Dashboard, Calendar, Priority Matrix, History, Settings. Active item has accent-colored left border + accent text. Inactive items are muted.
        - **Empty states:** Centered illustration-free message with a single-line description and one action button. e.g., "No scheduled tasks. Tasks detected from Slack will appear here."
        - **Transitions:** Subtle and fast (150ms). No bouncy animations. Fade-in for panels, slide for side panels. Instant feedback on clicks (optimistic UI).
      - **Keyboard navigation:** Tab-through task lists, Enter to open detail, Escape to close panels. Not full Linear-level keyboard shortcuts for MVP, but basic accessibility is required.
      - **Responsive:** Desktop-first (1024px+). Tablet (768px) collapses sidebar to icons. Mobile (< 768px) hides sidebar behind a hamburger menu — functional but not optimized for MVP.

      The following pages/routes are required:

      **1. Dashboard Home (`/dashboard`)**
      - Top section: summary cards — count of pending tasks, scheduled tasks today, overdue tasks, and completed this week.
      - Middle section: "Up Next" list — the next 10 scheduled tasks sorted by `scheduled_start`, each with title, time, importance badge, and a \[✅ Complete\] button.
      - Bottom section: "Needs Attention" — tasks in `detected`, `confirmed`, or `failed` state that require user action. Each with inline action buttons (Confirm/Dismiss/Retry).

      **2. Priority Matrix (`/dashboard/matrix`)**
      - A 2×2 quadrant grid: X-axis = Derived Urgency (Low → High), Y-axis = Importance (Low → High).
      - Each task appears as a card in its quadrant. Only `scheduled` and `confirmed` tasks are shown.
      - Clicking a quadrant filters the task list below the grid to that quadrant's tasks.
      - Uses data from `GET /api/dashboard/priority-matrix`.

      **3. Calendar View (`/dashboard/calendar`)**
      - Weekly calendar view showing Tandem-created events alongside the user's other Google Calendar events (read-only, fetched via Google Calendar API).
      - Tandem tasks are visually distinct (colored differently) from non-Tandem events.
      - Clicking a Tandem task opens a detail panel with title, description, importance, and actions (Complete, Reschedule).

      **4. Task History (`/dashboard/history`)**
      - Paginated list of `completed` and `dismissed` tasks, sorted by `updated_at` descending.
      - Each row: title, original due date, completion/dismissal date, importance.
      - Filter by date range and state (completed vs. dismissed).

      **5. Settings (`/dashboard/settings`)**
      - Work hours: per-day start/end time pickers (Mon–Sun).
      - Break times: add/remove break slots with start time, end time, and applicable days.
      - Default task duration: dropdown (15/30/45/60/90/120 min).
      - Scheduling buffer: dropdown (0/5/10/15 min between tasks).
      - Connected accounts: show Slack workspace(s) and Google account with connection status. Buttons to connect/disconnect.
      - Timezone: auto-detected, editable dropdown.
      - Uses `GET/PUT /api/preferences` and `GET /api/auth/me`.

      **6. Login / Register (`/login`, `/register`)**
      - Email + password form, or "Sign in with Google" button.
      - After login, redirect to `/dashboard` if fully onboarded, or to an onboarding flow if Slack/Google not yet connected.

      **7. Onboarding (`/onboarding`)**
      - Step-by-step wizard: 1) Connect Slack, 2) Connect Google Calendar, 3) Set timezone and work hours.
      - Each step shows what permissions are needed and why.
      - On completion, redirect to `/dashboard`.

    - **Slack App Home Tab:** Built using Slack Block Kit. Layout from top to bottom:

      1. **Header:** "Tandem" with the user's name and connection status (Google Calendar: ✅ Connected / ❌ Not connected).

      2. **Pending Tasks** (state = `detected`): Tasks awaiting confirmation. Each shows title, detected time, and \[Confirm ✅\] \[Dismiss ❌\] buttons. Hidden if none.

      3. **Up Next** (state = `scheduled`, sorted by `scheduled_start`, limit 5): Each shows title, scheduled date/time, importance badge, and a \[✅ Mark Complete\] button.

      4. **Needs Attention** (state = `failed`): Tasks that couldn't be scheduled. Each shows title, reason, and a \[🔄 Retry\] button. Hidden if none.

      5. **Recently Completed** (state = `completed`, last 3): Title and completion date. Collapsed by default.

      6. **Footer:** Links to "Open Dashboard" (web app URL) and "Settings" (web app settings URL).

    - The Home Tab refreshes on every `app_home_opened` event (Slack fires this when the user navigates to the Home Tab). No polling needed.

- **User Story 4.2 --- End-of-Day Review for Overdue Tasks**

  - **As a user,** I want Tandem to ask me about tasks whose scheduled time has passed **so that** stale tasks don't pile up and my dashboard stays accurate.

  - **System Behavior:**

    - At the end of the user's workday (based on `user_preferences.work_hours` end time), Tandem checks for any tasks in `scheduled` state whose `scheduled_end` is in the past.

    - If overdue tasks exist, Tandem sends a single Slack DM:

>
> 📋 End-of-day check-in! These tasks were on your calendar today but haven't been marked complete:
>
> 1️⃣ "Prepare project update" — 2:00 PM - 3:00 PM
>
> 2️⃣ "Review design draft" — 4:00 PM - 4:30 PM
>
> For each task:
>
> \[✅ Complete\] \[🔄 Reschedule\] \[❌ Dismiss\]

  - **Complete:** Transitions task to `completed`, deletes the Google Calendar event.

  - **Reschedule:** Opens a Slack modal where the user picks a new due date and time. Task is re-queued for scheduling (state remains `scheduled`, scheduler finds a new slot).

  - **Dismiss:** Transitions task to `dismissed`, deletes the Google Calendar event.

  - If the user does not respond, the DM remains. No automatic state change — the tasks stay in `scheduled` and will appear again in the next end-of-day check-in.

  - **Acceptance Criteria:**

    - The check-in DM is sent only once per day, at the end of the user's configured work hours.

    - Only tasks with `scheduled_end` before the current time are included.

    - If there are no overdue tasks, no DM is sent.

    - Each button press updates the task state immediately and refreshes the DM message to reflect the change.

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

    - **From Slack Home Tab (direct completion, no confirmation):**

      - Each scheduled task has a \[✅ Mark Complete\] button.

      - When the user clicks it, Tandem immediately: a. Transitions the task to `completed`. b. Deletes the corresponding Google Calendar event. c. Refreshes the Home Tab to reflect the change.

      - No confirmation DM is sent — the user is actively managing their tasks and the action is intentional.

    - **From end-of-day check-in DM (User Story 4.2):**

      - The DM lists overdue tasks with \[✅ Complete\], \[🔄 Reschedule\], and \[❌ Dismiss\] buttons.

      - Clicking \[✅ Complete\] transitions the task to `completed` and deletes the calendar event.

    - **From the web dashboard:**

      - Same behavior as the Home Tab — single click to complete, no confirmation dialog.

  - **Acceptance Criteria:**

    - Task status is updated consistently across the database, Slack Home Tab, and web dashboard.

    - The Google Calendar event is successfully removed on completion.

    - Completion is a single-click action from all surfaces (Home Tab, dashboard, end-of-day DM).

## 8. Technical Architecture (MVP) {#technical-architecture-mvp}

- **Authentication:** Users register via Email + Password or Google
  > OAuth. They must then connect Slack (OAuth) and Google Calendar
  > (OAuth).

- **JWT & Session Strategy:**
  - On login/register, the backend issues a short-lived **access token** (JWT, 15-minute expiry) and a long-lived **refresh token** (opaque, stored in DB, 30-day expiry).
  - The access token is sent in `Authorization: Bearer <token>` headers. The refresh token is sent as an `httpOnly`, `Secure`, `SameSite=Strict` cookie.
  - `POST /api/auth/refresh` accepts the refresh token cookie and returns a new access token + rotated refresh token. The old refresh token is invalidated immediately (rotation prevents replay).
  - On logout (`POST /api/auth/logout`), the refresh token is deleted from the DB.
  - The frontend uses an Axios/fetch interceptor: on 401, silently call `/api/auth/refresh` once. If that also fails, redirect to `/login`.

- **Email Verification:**
  - After email+password registration, the user receives a verification email with a signed token link (`/api/auth/verify-email?token=...`, 24-hour expiry).
  - Unverified users can log in and access the dashboard but **cannot connect Slack or Google OAuth** until verified. A banner is shown: "Please verify your email to continue setup."
  - `POST /api/auth/resend-verification` — rate-limited to 3 requests per hour.

- **Password Reset:**
  - `POST /api/auth/forgot-password` — accepts email, sends a reset link with a signed token (1-hour expiry). Always returns 200 (don't leak whether the email exists).
  - `POST /api/auth/reset-password` — accepts the token + new password. Invalidates all existing refresh tokens for the user (force re-login on all devices).

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

  - AI prompt must be version-controlled (stored as a versioned template file in the repo, not hardcoded inline).

  - **Prompt Input:** The system sends the AI a single Slack message's text along with minimal context (channel type, whether the user was @mentioned or in a DM). No conversation history or thread context for MVP.

  - **Expected AI Response (JSON):**

    ```json
    {
      "is_task": true,
      "confidence": 0.85,
      "task_title": "Review the pitch deck",
      "description": "Review and provide feedback on the Q3 pitch deck",
      "due_date": "2026-03-20T15:00:00",
      "importance": "high",
      "estimated_duration_minutes": 60
    }
    ```

  - **Field rules:**
    - `is_task` (boolean, required): Whether the message contains an actionable task for the user.
    - `confidence` (float 0-1, required): Model's confidence in the classification. Only proceed if `confidence >= 0.6`. Below this threshold, discard silently.
    - `task_title` (string, required if is_task=true): Short, action-oriented title. Max 100 characters.
    - `description` (string, optional): Additional context extracted from the message.
    - `due_date` (ISO 8601 string, optional): Extracted deadline. Null if no deadline is mentioned — the user must set it during confirmation.
    - `importance` (enum: "low"/"medium"/"high", optional): Inferred from language urgency. Defaults to "medium" if unclear.
    - `estimated_duration_minutes` (integer, optional): Inferred estimate. Defaults to the user's `default_task_duration` preference if not extracted.

  - **Classification guidelines (baked into the prompt):**
    - **IS a task:** "Can you review this by Friday?", "Please update the docs", "Send me the report", "Let's schedule a call to discuss pricing"
    - **NOT a task:** "Thanks!", "Sounds good", "Here's the link you asked for", "Happy birthday!", general discussion, questions that don't require action
    - When ambiguous, lean toward `is_task: false` — false negatives are better than false positives (less noise for the user).

  - **Error Handling:** Implement exponential backoff for API failures
    > (e.g., 5xx, 429). If the AI response is not valid JSON or is missing required fields, log the raw response and discard — do not send a broken DM to the user.

- **Scheduling Engine:**

  - Uses Google Calendar API.

  - Logic for availability respects user work hours and breaks.

  - **Source of Truth:** Google Calendar is the source of truth for
    > time/availability. The Tandem DB is the source of truth for task
    > metadata (Importance, Slack message ID, etc.).

  - **Calendar Reconciliation (End-of-Day):**

    - During the end-of-day check-in (User Story 4.2), before sending the DM, Tandem fetches the current state of all `scheduled` tasks' Google Calendar events and reconciles:

    - **Event moved externally:** If the event's start/end times differ from `scheduled_start`/`scheduled_end` in the DB, update the DB to match Google Calendar. The user moved it intentionally — just sync silently.

    - **Event deleted externally:** If the event no longer exists in Google Calendar, transition the task to `completed` with metadata `{"reason": "calendar_event_deleted_externally"}`. Do not include it in the check-in DM.

    - This keeps Google Calendar as the source of truth for time/availability without requiring push notifications.

  - **Error & Edge Case Handling (Google Calendar):**

    - **Expired / revoked Google token:** If a Calendar API call returns 401, attempt a silent refresh using the stored refresh token. If the refresh also fails (token revoked), mark the user's Google connection as disconnected and send a Slack DM: "Your Google Calendar connection has expired. Please reconnect: [Reconnect 🔗]". Tasks in `confirmed` state are held (not lost) until the user reconnects.

    - **Google Calendar API downtime (5xx):** Retry with exponential backoff (3 attempts, 1s / 4s / 16s). If all retries fail, transition the task to `failed` state and send a Slack DM: "I couldn't schedule your task due to a temporary issue. You can retry from your dashboard or Slack Home Tab."

    - **Rate limiting (403 / 429):** Respect the `Retry-After` header. Queue the scheduling request and process after cooldown. Only transition to `failed` if the rate limit persists beyond 5 minutes.

    - **Duplicate event prevention:** Before creating an event, check that the task's `google_calendar_event_id` is null. If an event ID already exists, verify it still exists in Google Calendar before creating a new one.

- **Database:** PostgreSQL (tasks, users, preferences, message IDs).

### Data Models {#data-models}

#### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| email | VARCHAR | Unique. Used for login. |
| password_hash | VARCHAR | Nullable — empty if user signed up via Google OAuth. |
| google_id | VARCHAR | Nullable — Google subject ID for "Login with Google". |
| display_name | VARCHAR | |
| timezone | VARCHAR | e.g., "America/New_York". Drives all scheduling. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `slack_installations` (one row per workspace)

Stores the **bot-level** token for each Slack workspace where Tandem is installed. This token is owned by the workspace, not by any individual user.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| slack_team_id | VARCHAR | Unique. The Slack workspace ID (e.g., T012ABC). |
| slack_team_name | VARCHAR | Human-readable workspace name. |
| bot_token_encrypted | BYTEA | Encrypted `xoxb-` bot token. Used to send DMs and listen for events. |
| bot_user_id | VARCHAR | The bot's own Slack user ID in this workspace. |
| installed_by | UUID (FK → users) | Nullable. The admin who installed, if they are a Tandem user. |
| installed_at | TIMESTAMP | |

#### `slack_user_tokens` (one row per user per workspace)

A user (e.g., a freelancer) can be in multiple Slack workspaces. Each workspace connection produces its own OAuth user token. This is the many-to-many link between `users` and `slack_installations`.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | |
| installation_id | UUID (FK → slack_installations) | |
| slack_user_id | VARCHAR | The user's Slack ID in this workspace (e.g., U012XYZ). |
| user_token_encrypted | BYTEA | Encrypted `xoxp-` user token. Used to read DMs, private channels, threads visible to this user. |
| scopes | TEXT | Comma-separated OAuth scopes granted. |
| token_expires_at | TIMESTAMP | Nullable. For token rotation. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| **Unique constraint** | | `(user_id, installation_id)` — one token per user per workspace. |

#### `google_oauth_tokens` (one row per user)

Each Tandem user connects one Google account. This token is used for Calendar read/write.

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | Unique. One Google connection per user. |
| google_email | VARCHAR | The connected Google account email. |
| access_token_encrypted | BYTEA | Encrypted short-lived access token. |
| refresh_token_encrypted | BYTEA | Encrypted long-lived refresh token. Used to obtain new access tokens. |
| token_expires_at | TIMESTAMP | When the current access token expires. |
| calendar_id | VARCHAR | Default: "primary". The calendar Tandem writes events to. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `tasks`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | The task owner. |
| state | ENUM | One of: `detected`, `confirmed`, `scheduled`, `completed`, `dismissed`, `failed`. See Task Lifecycle. |
| title | VARCHAR | Extracted or user-edited task title. |
| description | TEXT | Nullable. Additional context. |
| importance | ENUM | `low`, `medium`, `high`. User-editable. |
| derived_urgency | ENUM | `low`, `medium`, `high`. System-computed from due_date. Not user-editable. |
| due_date | TIMESTAMP | Required before scheduling. May be null in `detected` state. |
| estimated_duration | INTEGER | Minutes. Required before scheduling. |
| source_slack_team_id | VARCHAR | The workspace where the message originated. |
| source_slack_channel_id | VARCHAR | Channel/DM where the task was detected. |
| source_slack_message_id | VARCHAR | Slack message timestamp (ts). Used for linking back, not storing message text. |
| google_calendar_event_id | VARCHAR | Nullable. Set when state = `scheduled`. Cleared when state = `completed`. |
| scheduled_start | TIMESTAMP | Nullable. The calendar slot start time. |
| scheduled_end | TIMESTAMP | Nullable. The calendar slot end time. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `task_state_log` (audit trail)

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| task_id | UUID (FK → tasks) | |
| from_state | ENUM | Nullable (null for initial creation). |
| to_state | ENUM | |
| changed_at | TIMESTAMP | |
| metadata | JSONB | Nullable. Context for the transition (e.g., "pushed_by_task_id", "slot_not_found"). |

#### `user_preferences`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | Unique. One preferences row per user. |
| work_hours | JSONB | Per-day start/end times. e.g., `{"monday": {"start": "09:00", "end": "18:00"}, ...}` |
| break_times | JSONB | e.g., `[{"start": "12:00", "end": "13:00", "days": ["monday","tuesday","wednesday","thursday","friday"]}]` |
| default_task_duration | INTEGER | Minutes. Fallback if AI extraction doesn't provide one. Default: 30. |
| scheduling_buffer | INTEGER | Minutes between back-to-back tasks. Default: 0. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Token Storage & Security Notes

- All tokens (Slack bot, Slack user, Google access/refresh) are **encrypted at rest** using AES-256. Encryption keys are stored in environment variables, never in the database.
- Slack user tokens and Google refresh tokens are **long-lived secrets** — treat them with the same care as passwords.
- Google access tokens are short-lived (~1 hour). The backend must auto-refresh using the refresh token before each Calendar API call.
- Slack token rotation: if Slack enables token rotation for the workspace, the `token_expires_at` field is used to trigger re-authorization.
- The `slack_user_tokens` table is the key to multi-workspace support: one Tandem `user` can have rows in this table for each Slack workspace they belong to, each with its own `xoxp-` token and `slack_user_id`.

- **Backend:** Node.js with TypeScript (Express or Fastify). Slack integration via Bolt SDK. Google Calendar via `googleapis` Node.js client.

- **Frontend:** React + Tailwind (web), Slack UI Kit (modals, home tab).

- **Frontend State & Data Fetching:**
  - Use **React Query (TanStack Query)** for all server state (tasks, preferences, dashboard data). Provides caching, background refetch, and optimistic updates out of the box.
  - No global state library needed for MVP — React Query handles server state; React context handles auth state (current user + tokens).
  - **Real-time updates:** Polling via React Query's `refetchInterval` (30 seconds on dashboard pages). WebSockets are out of scope for MVP.
  - **Slack Home Tab refresh:** After any button action (Mark Complete, Confirm, Dismiss), the Bolt handler must call `client.views.publish()` to re-render the Home Tab immediately — not just on `app_home_opened`.

### Timezone Strategy {#timezone-strategy}

- **Single rule:** All dates and times are interpreted and displayed in the **task owner's timezone** (`users.timezone`).
- When the AI extracts a deadline like "by 3 PM Wednesday" from a Slack message, it is resolved to 3 PM in the task owner's timezone — regardless of the sender's timezone.
- The confirmation DM shows times in the owner's timezone. The user can adjust during the Edit flow if the AI interpreted incorrectly.
- Google Calendar events are created with the owner's timezone. Google handles display conversion for any other viewers.
- The web dashboard renders all times in the owner's timezone.
- The user's timezone is set during onboarding (auto-detected from the browser or Slack profile) and can be changed in Preferences.
- Internally, all timestamps are stored as **UTC** in the database. Timezone conversion happens at the presentation layer (Slack DMs, dashboard, calendar event creation).

### Backend API Routes {#backend-api-routes}

All routes return JSON. Protected routes require a valid JWT in the `Authorization: Bearer <token>` header.

#### Authentication

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register with email + password. Returns JWT. |
| POST | `/api/auth/login` | Public | Login with email + password. Returns JWT. |
| POST | `/api/auth/google` | Public | Login/register via Google OAuth ID token. Returns JWT. |
| POST | `/api/auth/logout` | JWT | Invalidate current session (delete refresh token). |
| POST | `/api/auth/refresh` | Cookie | Exchange refresh token for new access token + rotated refresh token. |
| POST | `/api/auth/verify-email` | Public | Verify email address via signed token from query param. |
| POST | `/api/auth/resend-verification` | JWT | Resend verification email. Rate-limited to 3/hour. |
| POST | `/api/auth/forgot-password` | Public | Send password reset email. Always returns 200. |
| POST | `/api/auth/reset-password` | Public | Reset password via signed token. Invalidates all refresh tokens. |
| GET | `/api/auth/me` | JWT | Return current user profile, connection status (Slack, Google), and email verification status. |

#### OAuth Connections

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/connect/slack` | JWT | Initiate Slack user OAuth flow. Redirects to Slack authorization URL. |
| GET | `/api/connect/slack/callback` | JWT (via state param) | Slack OAuth callback. Exchanges code for user token, stores in `slack_user_tokens`. |
| GET | `/api/connect/google` | JWT | Initiate Google Calendar OAuth flow. Redirects to Google authorization URL. |
| GET | `/api/connect/google/callback` | JWT (via state param) | Google OAuth callback. Exchanges code for access + refresh tokens, stores in `google_oauth_tokens`. |
| DELETE | `/api/connect/slack/:installationId` | JWT | Disconnect a specific Slack workspace. Revokes and deletes the user token. |
| DELETE | `/api/connect/google` | JWT | Disconnect Google Calendar. Revokes and deletes tokens. |

#### Slack Bot (Bolt SDK handles these internally)

| Event / Route | Description |
|---|---|
| `POST /slack/events` | Slack Events API endpoint. Bolt SDK routes incoming events (message, app_mention, etc.). |
| `POST /slack/interactions` | Slack interactivity endpoint. Handles button clicks (Confirm, Edit, Dismiss, Push, Mark Complete) and modal submissions. |

#### Tasks

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/tasks` | JWT | List tasks for the current user. Supports query params: `?state=scheduled,confirmed&sort=due_date&limit=20&offset=0`. |
| GET | `/api/tasks/:id` | JWT | Get a single task by ID. |
| PATCH | `/api/tasks/:id` | JWT | Update task fields (title, description, importance, due_date, estimated_duration). Triggers reschedule if `scheduled` and time-related fields changed. |
| POST | `/api/tasks/:id/confirm` | JWT | Transition task from `detected` → `confirmed`. Triggers scheduling. |
| POST | `/api/tasks/:id/dismiss` | JWT | Transition task to `dismissed`. |
| POST | `/api/tasks/:id/complete` | JWT | Transition task from `scheduled` → `completed`. Deletes Google Calendar event. |
| POST | `/api/tasks/:id/reschedule` | JWT | Re-run the scheduler for a `failed` or `scheduled` task. |

#### Preferences

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/preferences` | JWT | Get current user's preferences (work hours, breaks, defaults). |
| PUT | `/api/preferences` | JWT | Update preferences. Full replace of the preferences object. |

#### Dashboard

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/summary` | JWT | Aggregated view: task counts by state, next 5 upcoming tasks, overdue count. |
| GET | `/api/dashboard/priority-matrix` | JWT | Tasks grouped by derived urgency × importance for the quadrant view. |

#### Slack App Installation (Admin)

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/install/slack` | Public | Initiate Slack app installation (admin). Redirects to Slack OAuth with bot scopes. |
| GET | `/api/install/slack/callback` | Public | Slack install callback. Stores bot token in `slack_installations`. |

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

### Deployment & Infrastructure {#deployment-infrastructure}

- **Monorepo structure:** Single repository containing backend, frontend, and shared types. Managed with npm/pnpm workspaces.

- **Environments:**

  | Environment | Purpose | Slack App | Database |
  |---|---|---|---|
  | Local | Developer machine + ngrok tunnel | Separate dev Slack app | Local PostgreSQL or Docker container |
  | Staging | Pre-production testing | Separate staging Slack app | Hosted PostgreSQL (e.g., Railway, Supabase, or RDS) |
  | Production | Live users | Production Slack app | Hosted PostgreSQL with daily backups |

- **Hosting:** Containerized (Docker). Deploy backend and frontend as separate containers. Recommended platforms for MVP: Railway, Render, or Fly.io (simple, low-ops overhead). Migrate to AWS/GCP if scale demands it.

- **CI/CD:** GitHub Actions pipeline:
  - On pull request: lint, type-check, run tests.
  - On merge to `main`: build Docker images, run tests, deploy to staging automatically.
  - Production deploy: manual trigger (promote staging to production).

- **Environment variables:** All secrets (DB connection string, OAuth client secrets, encryption keys, OpenAI API key) stored in the hosting platform's secret manager. Never committed to the repo. A `.env.example` file documents required variables without values.

- **Database migrations:** Managed via a migration tool (e.g., Prisma Migrate or node-pg-migrate). Migrations are version-controlled and run automatically on deploy.

## 10. Non-Functional Requirements {#non-functional-requirements}

### Latency Targets

| Operation | Target | Notes |
|---|---|---|
| Slack message → confirmation DM | < 10 seconds | Includes AI classification + DM send. Already stated in Feature 1. |
| Task confirm → calendar event created | < 5 seconds | Includes availability check + event creation. |
| Button click (Confirm/Dismiss/Complete) → Slack UI update | < 2 seconds | User should see immediate feedback. |
| Dashboard page load | < 3 seconds | Initial load with task list and summary. |

### Throughput (MVP)

- Support up to **500 registered users** across multiple workspaces.
- Handle up to **50 concurrent Slack events per second** (message detection pipeline).
- The scheduling engine processes tasks sequentially per user (no parallel scheduling for the same user to avoid race conditions), but can process different users in parallel.
- **Scheduling concurrency mechanism:** Use a per-user advisory lock (PostgreSQL `pg_advisory_xact_lock` on the user's UUID hash) acquired at the start of each scheduling transaction. This prevents two concurrent scheduling attempts for the same user from double-booking. A lightweight job queue (e.g., BullMQ with Redis, or `pg-boss`) processes scheduling jobs — one queue per user ensures ordering.

### Logging & Observability

- **Structured logging** (JSON format) for all backend services. Every log entry includes: timestamp, request ID, user ID (if applicable), and severity level.
- **AI classification logging:** Log the AI model's input (message ID only, not text), output (extracted fields, confidence), and latency for every classification call. This is critical for tuning detection accuracy.
- **State transition logging:** Every task state change is recorded in `task_state_log` (already defined in the data model). This serves as the audit trail.
- **Error alerting:** Log all 5xx responses, failed OAuth refreshes, and scheduling failures at ERROR level. These should be surfaced in whatever monitoring tool is used (e.g., application logs, Datadog, or simple log aggregation).
- **Health check endpoint:** `GET /api/health` returns 200 with service status (DB connected, Slack bot connected). Used for uptime monitoring.

### Availability

- **Target uptime:** 99% (allows ~7 hours downtime/month). Acceptable for MVP.
- **Graceful degradation:** If the OpenAI API is down, task detection pauses but existing scheduled tasks, the dashboard, and calendar sync continue to work. If Google Calendar API is down, detection and confirmation still work — only scheduling is delayed.

## 11. Security & Compliance {#security-compliance}

- **Data Retention:** No message *text* is retained; only message ID
  > references.

- **Token Management:** OAuth tokens are encrypted at rest and refreshed
  > automatically.

- **Data Isolation:** Multi-tenant architecture with strict per-user
  > data isolation. An admin cannot see a user\'s tasks.

- **Compliance:** GDPR-ready (no message storage, opt-in authorization).

- **Rate Limiting:**
  - Public auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`): **5 requests per minute per IP.**
  - `/api/auth/refresh`: **10 requests per minute per IP.**
  - All authenticated API routes: **60 requests per minute per user.**
  - Slack event ingestion (`/slack/events`): Not rate-limited by us — Slack controls the flow. But the deduplication cache prevents reprocessing.
  - Use `express-rate-limit` (or equivalent) with a Redis store for multi-instance deployments.

- **Encryption Key Rotation:**
  - Token encryption uses AES-256-GCM. Each encrypted value is prefixed with a **key version identifier** (e.g., `v1:encrypted_data`).
  - When a key is rotated, add the new key as the active encryption key and keep the old key(s) for decryption only. Re-encrypt tokens lazily — when a token is read and decrypted with an old key version, re-encrypt with the current key and save.
  - Encryption keys are stored in environment variables: `ENCRYPTION_KEY_CURRENT`, `ENCRYPTION_KEY_PREVIOUS` (nullable).

- **Frontend Error States:**
  - **Disconnected Google Calendar:** If any API call returns a `google_disconnected` error, show a persistent banner on all dashboard pages: "Google Calendar disconnected. [Reconnect]". Disable scheduling-related actions (Complete, Reschedule) but keep task list and history readable.
  - **Disconnected Slack:** Show a banner: "Slack workspace disconnected. Task detection is paused. [Reconnect]".
  - **API errors (5xx / network):** Show a toast notification: "Something went wrong. Please try again." React Query's built-in retry (3 attempts with exponential backoff) handles transient failures before surfacing the error.
  - **Session expired:** If `/api/auth/refresh` fails, redirect to `/login` with a flash message: "Your session has expired. Please sign in again."

## 12. Out of Scope (for MVP) {#out-of-scope-for-mvp}

- Multi-calendar support (Outlook, Apple Calendar)

- Delegation or task assignment between users

- Admin console or team billing

- Auto-scheduling *without* user confirmation

- Message backfill scanning

- Meeting-free day configuration

- Google Calendar push notifications (calendar changes are reconciled during end-of-day check-in instead)

- Manual task creation from dashboard or slash commands (all tasks originate from Slack message detection)

- Task reminders / nudges before a task's scheduled time

- Recurring / repeating tasks

- Slack slash commands (all interaction is bot-DM and button-driven; settings accessible via Slack Home Tab or web dashboard)

## 13. Success Metrics {#success-metrics}

- **Activation Rate:** % of users who start onboarding and successfully
  > connect both Slack and Google Calendar.

- **Adoption Rate:** % of detected tasks that are \"Confirmed\" by users
  > (vs. \"Dismissed\").

- **Engagement:** Daily Active Users (DAU) with at least one scheduled
  > task.

- **Retention:** % of users who are still active 30 days after signup.
