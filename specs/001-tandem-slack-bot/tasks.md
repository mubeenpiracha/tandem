---
description: "Task list for Tandem Slack Bot implementation"
---

# Tasks: Tandem Slack Bot

**Input**: Design documents from `/specs/001-tandem-slack-bot/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## 🔥 MULTI-WORKSPACE ARCHITECTURE DECISION

**DECISION**: Implement multi-workspace support from the foundation to avoid fundamental rewrites later.

**IMPACT**: 
- **Workspace Model**: Core entity representing each Slack workspace installation
- **Workspace-Scoped Tokens**: Bot tokens, user tokens, and all data tied to specific workspaces  
- **Workspace Installation Flow**: Separate from user authentication - workspace admin installs app
- **User Authentication Flow**: Users authenticate within their workspace context
- **Data Isolation**: All tasks, messages, preferences scoped to workspace boundaries
- **API Routing**: Workspace-aware endpoints and middleware
- **Billing Ready**: Foundation for per-workspace subscription model

**TRADE-OFFS**:
- ✅ **Pros**: Scalable to enterprise, no fundamental rewrites, proper data isolation, billing foundation
- ❌ **Cons**: Additional complexity in MVP, more database relations, more authentication flows

**ARCHITECTURE ADDITIONS**:
```
Workspace (new) → Users → Tasks/Messages/Preferences
Workspace (new) → BotTokens (new)
User → SlackToken (user-scoped)
User → GoogleToken (user-scoped)
```

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure with backend/ and frontend/ directories per implementation plan
- [x] T002 Initialize Node.js backend project with TypeScript, Express.js, Prisma, and testing dependencies in backend/
- [x] T003 [P] Initialize React frontend project with TypeScript and testing dependencies in frontend/
- [x] T004 [P] Configure ESLint and Prettier for both backend and frontend projects
- [x] T005 [P] Setup Docker development environment with PostgreSQL and Redis containers
- [x] T006 [P] Configure ngrok for local webhook development in backend/scripts/ngrok-setup.sh

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Setup PostgreSQL database schema and Prisma migrations in backend/prisma/
- [x] T007b **ARCHITECTURE CHANGE**: Add Workspace model and update User/Token models for multi-workspace support in backend/prisma/schema.prisma
- [x] T008 [P] Create database models for User, SlackToken, GoogleToken in backend/src/models/
- [x] T008b **ARCHITECTURE CHANGE**: Add Workspace model and update models to be workspace-scoped in backend/src/models/
- [x] T009 [P] Implement environment configuration management in backend/src/config/
- [x] T009b **ARCHITECTURE CHANGE**: Update config to support multi-workspace token storage and routing in backend/src/config/
- [x] T010 [P] Setup Express.js server with middleware structure in backend/src/app.ts
- [x] T010b **ARCHITECTURE CHANGE**: Update server to handle workspace-based routing in backend/src/app.ts
- [x] T011 [P] Configure error handling and logging infrastructure in backend/src/middleware/
- [x] T011b **ARCHITECTURE CHANGE**: Update middleware for workspace-aware request handling in backend/src/middleware/
- [x] T012 [P] Setup Redis client for job queues in backend/src/services/redis.js
- [x] T013 [P] Create base OAuth service structure in backend/src/services/oauth/
- [x] T013b **ARCHITECTURE CHANGE**: Update OAuth service for workspace installation flow in backend/src/services/oauth/
- [x] T014 [P] Setup API routing structure in backend/src/routes/
- [x] T014b **ARCHITECTURE CHANGE**: Update routing for workspace-scoped endpoints in backend/src/routes/
- [x] T015 [P] Configure CORS and security middleware for Slack/Google integration

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

**🔥 BREAKING CHANGE**: Multi-workspace architecture implemented from foundation level - ALL subsequent user stories must respect workspace boundaries

---

## Phase 3: User Story 1 - Task Detection (Priority: P1) 🎯 MVP

**Goal**: AI-powered detection of actionable tasks from Slack conversations with user confirmation via DM

**Independent Test**: Bot joins a channel, detects task from conversation, sends DM confirmation, stores task in database

**⚠️ MULTI-WORKSPACE**: All tasks must be workspace-scoped from the start

### Implementation for User Story 1

- [x] T016 [P] [US1] Create Task model in backend/src/models/task.ts
- [ ] T016b **ARCHITECTURE CHANGE**: Update Task model to be workspace-scoped in backend/src/models/task.ts
- [x] T017 [P] [US1] Create SlackMessage model in backend/src/models/slackMessage.ts
- [ ] T017b **ARCHITECTURE CHANGE**: Update SlackMessage model to be workspace-scoped in backend/src/models/slackMessage.ts
- [x] T018 [US1] Implement OpenAI service for task detection in backend/src/services/ai/taskDetector.ts
- [x] T019 [US1] Implement Slack service for reading messages in backend/src/services/slack/messageReader.ts
- [ ] T019b **ARCHITECTURE CHANGE**: Update message reader to use workspace-specific bot tokens in backend/src/services/slack/messageReader.ts
- [x] T020 [US1] Implement Slack service for sending DMs in backend/src/services/slack/dmSender.ts
- [ ] T020b **ARCHITECTURE CHANGE**: Update DM sender to use workspace-specific bot tokens in backend/src/services/slack/dmSender.ts
- [x] T021 [US1] Create task detection job processor in backend/src/jobs/taskDetection.ts
- [ ] T021b **ARCHITECTURE CHANGE**: Update job processor for workspace-scoped task processing in backend/src/jobs/taskDetection.ts
- [x] T022 [US1] Implement Slack event webhook handler in backend/src/routes/slack/events.ts
- [ ] T022b **ARCHITECTURE CHANGE**: Update webhook handler to route events by workspace in backend/src/routes/slack/events.ts
- [x] T023 [US1] Create task confirmation flow in backend/src/routes/slack/interactions.ts
- [ ] T023b **ARCHITECTURE CHANGE**: Update interaction handler for workspace-scoped responses in backend/src/routes/slack/interactions.ts
- [x] T024 [US1] Add task CRUD operations in backend/src/routes/tasks.ts
- [ ] T024b **ARCHITECTURE CHANGE**: Update task routes to be workspace-scoped in backend/src/routes/tasks.ts
- [x] T025 [US1] Add validation and error handling for task detection workflow
- [ ] T025b **ARCHITECTURE CHANGE**: Update validation for workspace-scoped operations
- [x] T026 [US1] Add logging for task detection operations
- [ ] T026b **ARCHITECTURE CHANGE**: Update logging to include workspace context

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Calendar Scheduling (Priority: P1) 🎯 MVP

**Goal**: Intelligent scheduling of confirmed tasks in Google Calendar with conflict detection

**Independent Test**: Confirmed task gets automatically scheduled in user's calendar, conflicts are detected and user is notified

**⚠️ MULTI-WORKSPACE**: All scheduling must respect workspace boundaries and user associations

### Implementation for User Story 2

- [ ] T027 [P] [US2] Create CalendarEvent model in backend/src/models/calendar_event.js
- [ ] T027b **ARCHITECTURE CHANGE**: Make CalendarEvent workspace-scoped via user association in backend/src/models/calendar_event.js
- [ ] T028 [US2] Implement Google Calendar service for reading events in backend/src/services/google/calendar_reader.js
- [ ] T029 [US2] Implement Google Calendar service for creating events in backend/src/services/google/calendar_writer.js
- [ ] T030 [US2] Create intelligent scheduling service in backend/src/services/scheduling/scheduler.js
- [ ] T030b **ARCHITECTURE CHANGE**: Update scheduler to respect workspace boundaries in backend/src/services/scheduling/scheduler.js
- [ ] T031 [US2] Create conflict detection service in backend/src/services/scheduling/conflict_detector.js
- [ ] T032 [US2] Create calendar scheduling job processor in backend/src/jobs/calendar_scheduling.js
- [ ] T032b **ARCHITECTURE CHANGE**: Update calendar jobs for workspace-scoped processing in backend/src/jobs/calendar_scheduling.js
- [ ] T033 [US2] Implement calendar webhook handlers in backend/src/routes/google/calendar.js
- [ ] T034 [US2] Add calendar operations to task routes in backend/src/routes/tasks.js
- [ ] T034b **ARCHITECTURE CHANGE**: Ensure calendar operations respect workspace boundaries in backend/src/routes/tasks.js
- [ ] T035 [US2] Integrate calendar scheduling with task confirmation flow
- [ ] T035b **ARCHITECTURE CHANGE**: Update integration to use workspace-specific tokens and context
- [ ] T036 [US2] Add conflict notification via Slack DM
- [ ] T036b **ARCHITECTURE CHANGE**: Use workspace-specific bot tokens for notifications in backend/src/services/slack/dmSender.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Authentication (Priority: P2)

**Goal**: Secure OAuth integration with Slack and Google for user onboarding WITH workspace installation support

**Independent Test**: Workspace admin can install app, users can authenticate with both Slack and Google, workspace-scoped tokens are stored securely

**🔥 CRITICAL**: This phase now includes WORKSPACE INSTALLATION FLOW - not just user authentication

### Implementation for User Story 3

- [ ] T037 [P] [US3] **WORKSPACE INSTALLATION**: Implement Slack App installation flow in backend/src/routes/auth/workspace.js
- [ ] T037b [P] [US3] Create workspace registration and bot token storage in backend/src/services/workspace/installer.js
- [ ] T038 [P] [US3] Implement Slack OAuth flow for USERS within workspaces in backend/src/routes/auth/slack.js
- [ ] T039 [P] [US3] Implement Google OAuth flow for users in backend/src/routes/auth/google.js
- [ ] T040 [P] [US3] Create OAuth token management service with WORKSPACE CONTEXT in backend/src/services/oauth/token_manager.js
- [ ] T041 [P] [US3] Add OAuth middleware for API protection with WORKSPACE ROUTING in backend/src/middleware/auth.js
- [ ] T042 [US3] Create user onboarding flow WITHIN WORKSPACE CONTEXT in backend/src/routes/auth/onboarding.js
- [ ] T043 [US3] Add authentication status endpoints with workspace awareness in backend/src/routes/auth/status.js
- [ ] T044 [US3] Integrate OAuth tokens with Slack and Google services FOR WORKSPACE-SCOPED OPERATIONS
- [ ] T045 [US3] Add token refresh handling for expired credentials WITH WORKSPACE CONTEXT
- [ ] T046 [US3] **NEW**: Add workspace management endpoints in backend/src/routes/workspace.js
- [ ] T047 [US3] **NEW**: Add workspace admin authentication and permissions in backend/src/middleware/workspace_auth.js

**Checkpoint**: All core functionality should now be independently functional with proper authentication

---

## Phase 6: User Story 4 - Task Dashboard (Priority: P3)

**Goal**: Web dashboard for viewing and managing detected tasks WITH WORKSPACE-AWARE INTERFACE

**Independent Test**: User can view all their tasks within their workspace context, mark them as complete, and see their status in a web interface

**⚠️ MULTI-WORKSPACE**: Dashboard must show workspace context and only workspace-scoped data

### Implementation for User Story 4

- [ ] T048 [P] [US4] Create React app structure in frontend/src/
- [ ] T049 [P] [US4] Setup API client for backend communication with WORKSPACE HEADERS in frontend/src/services/api.js
- [ ] T050 [P] [US4] Create task list component with WORKSPACE FILTERING in frontend/src/components/TaskList.jsx
- [ ] T051 [P] [US4] Create task detail component in frontend/src/components/TaskDetail.jsx
- [ ] T052 [P] [US4] Create authentication components with WORKSPACE SELECTION in frontend/src/components/Auth/
- [ ] T053 [US4] Implement task management page with WORKSPACE CONTEXT in frontend/src/pages/Dashboard.jsx
- [ ] T054 [US4] Add task filtering and search functionality WITHIN WORKSPACE SCOPE
- [ ] T055 [US4] Create responsive design with modern UI components
- [ ] T056 [US4] Add real-time updates for task status changes WITH WORKSPACE ISOLATION
- [ ] T057 [US4] Integrate with backend authentication system WITH WORKSPACE ROUTING
- [ ] T058 [US4] **NEW**: Add workspace switcher component in frontend/src/components/WorkspaceSwitcher.jsx
- [ ] T059 [US4] **NEW**: Add workspace settings page in frontend/src/pages/WorkspaceSettings.jsx

**Checkpoint**: Users can now manage tasks through both Slack and web interface

---

## Phase 7: User Story 5 - Work Preferences (Priority: P3)

**Goal**: Configurable work preferences for personalized scheduling WITH WORKSPACE-SCOPED DEFAULTS

**Independent Test**: User can set work hours, break preferences, and task duration estimates that affect scheduling decisions within their workspace context

**⚠️ MULTI-WORKSPACE**: Preferences may vary per workspace, with workspace-level defaults

### Implementation for User Story 5

- [ ] T060 [P] [US5] Create WorkPreferences model with WORKSPACE ASSOCIATION in backend/src/models/work_preferences.js
- [ ] T061 [US5] Implement preferences service with WORKSPACE CONTEXT in backend/src/services/preferences/preferences_manager.js
- [ ] T062 [US5] Create preferences CRUD endpoints with WORKSPACE SCOPING in backend/src/routes/preferences.js
- [ ] T063 [US5] Integrate preferences with scheduling service FOR WORKSPACE-AWARE SCHEDULING
- [ ] T064 [US5] Add default preferences setup during onboarding WITH WORKSPACE DEFAULTS
- [ ] T065 [P] [US5] Create preferences UI components in frontend/src/components/Preferences/
- [ ] T066 [US5] Create preferences management page with WORKSPACE CONTEXT in frontend/src/pages/Preferences.jsx
- [ ] T067 [US5] Add preferences validation and smart defaults PER WORKSPACE
- [ ] T068 [US5] Integrate preferences with calendar scheduling logic WITH WORKSPACE BOUNDARIES
- [ ] T069 [US5] **NEW**: Add workspace-level preference templates in backend/src/services/workspace/preference_templates.js

**Checkpoint**: All user stories should now be independently functional with full customization

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories WITH MULTI-WORKSPACE CONSIDERATIONS

- [ ] T070 [P] Add comprehensive API documentation with WORKSPACE ROUTING EXAMPLES in docs/api.md
- [ ] T071 [P] Create deployment guide with MULTI-WORKSPACE CONFIGURATION in docs/deployment.md
- [ ] T072 [P] Add monitoring and health check endpoints with WORKSPACE METRICS
- [ ] T073 Code cleanup and refactoring across all services FOR WORKSPACE ARCHITECTURE
- [ ] T074 Performance optimization for AI task detection WITH WORKSPACE ISOLATION
- [ ] T075 [P] Security hardening for OAuth flows and data storage WITH WORKSPACE BOUNDARIES
- [ ] T076 [P] Add rate limiting for Slack webhooks PER WORKSPACE
- [ ] T077 Run quickstart.md validation with full end-to-end testing ACROSS MULTIPLE WORKSPACES
- [ ] T078 [P] Setup CI/CD pipeline with automated testing INCLUDING MULTI-WORKSPACE SCENARIOS
- [ ] T079 [P] **NEW**: Add workspace analytics and usage tracking in backend/src/services/analytics/workspace_metrics.js
- [ ] T080 [P] **NEW**: Add workspace billing and subscription management in backend/src/services/billing/workspace_billing.js

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P1 → P2 → P3 → P3)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Integrates with US1 for task confirmation flow
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Required for production deployment
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories for basic functionality
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Integrates with US2 for personalized scheduling

### Within Each User Story

- Models before services
- Services before endpoints/jobs
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, User Stories 1 and 4 can start in parallel (different codebases)
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all models for User Story 1 together:
Task: "Create Task model in backend/src/models/task.js"
Task: "Create SlackMessage model in backend/src/models/slack_message.js"

# Once models are done, launch services in parallel:
Task: "Implement OpenAI service for task detection in backend/src/services/ai/task_detector.js"
Task: "Implement Slack service for reading messages in backend/src/services/slack/message_reader.js"
Task: "Implement Slack service for sending DMs in backend/src/services/slack/dm_sender.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Task Detection)
4. Complete Phase 4: User Story 2 (Calendar Scheduling)
5. **STOP and VALIDATE**: Test core workflow end-to-end
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Core detection works
3. Add User Story 2 → Test independently → Full automation works → Deploy/Demo (MVP!)
4. Add User Story 3 → Add authentication → Production ready
5. Add User Story 4 → Add web interface → Enhanced UX
6. Add User Story 5 → Add personalization → Full featured
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Task Detection)
   - Developer B: User Story 4 (Dashboard - different codebase)
   - Developer C: User Story 3 (Authentication)
3. User Story 2 starts after User Story 1 completes (integration dependency)
4. User Story 5 starts after User Story 2 completes (integration dependency)

---

## Summary

- **Total Tasks**: 80 tasks across 8 phases (was 72 - added 8 for multi-workspace support)
- **MVP Scope**: User Stories 1 & 2 with multi-workspace foundation (Tasks T001-T036b) - Core AI-powered task detection and scheduling
- **Production Ready**: Add User Story 3 with workspace installation (Authentication) - Tasks T037-T047
- **Full Featured**: All user stories complete with workspace management - Tasks T001-T080
- **Parallel Opportunities**: 28+ tasks marked [P] can run in parallel within their phases
- **Independent Test Criteria**: Each user story has clear standalone validation requirements WITH WORKSPACE ISOLATION
- **Key Integration Points**: US2 builds on US1 confirmation flow, US5 enhances US2 scheduling logic, ALL WITHIN WORKSPACE BOUNDARIES

**🔥 ARCHITECTURE CHANGE SUMMARY**:
- **Added**: Workspace model and installation flow
- **Updated**: All models to be workspace-scoped
- **Enhanced**: Authentication to include workspace installation
- **Modified**: All services to respect workspace boundaries
- **Added**: Workspace management, analytics, and billing capabilities

Each task is specific enough for immediate implementation with exact file paths and clear dependencies. The modular structure enables both incremental delivery and parallel development while maintaining independent testability of each user story **with full multi-workspace support from day one**.