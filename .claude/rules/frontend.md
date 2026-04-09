---
paths:
  - "packages/frontend/src/**/*.tsx"
  - "packages/frontend/src/**/*.ts"
---

# Frontend Rules

## Design System (Linear-inspired)
- Dark mode first. Background: `#1a1a2e`. Surface: `#222244`. Text: white.
- Light mode is supported but secondary.
- Accent: indigo/violet `#6366f1` — used sparingly for active states, primary buttons, selected nav
- Single font: Inter (loaded via Google Fonts or self-hosted)
- 4 type sizes max. Body: 14px. Secondary: 12px. Headings: 500 weight (not bold).
- 8px base grid. Tight but breathable spacing.
- No decorative elements, drop shadows on cards, or heavy borders.

## Component Patterns
- Task rows: flat list items, not cards. Single line: checkbox/status dot, title, due date, importance badge.
- Buttons: ghost/text for secondary, solid filled for primary. Small, tight padding.
- Modals: rare. Prefer inline editing and slide-over panels.
- Empty states: centered text + one action button. No illustrations.
- Transitions: 150ms. Fade for panels, slide for side drawers. No bounce.
- Status dots: small colored dots. Detected=blue, Confirmed=yellow, Scheduled=green, Failed=red, Completed=gray checkmark.

## State Management
- Use TanStack Query (React Query) for all server state.
- Auth state (current user, access token) in React Context only.
- No Redux, Zustand, or other global state libraries.
- No localStorage for access tokens — keep in memory.
- Dashboard pages refetch every 30 seconds (`refetchInterval: 30000`).

## Authentication in the Frontend
- On page load: call `/api/auth/refresh` (uses httpOnly cookie) to get a new access token
- If refresh fails: redirect to `/login`
- Access token stored in React Context (memory only, not localStorage)
- Axios interceptor: on 401, call `/api/auth/refresh` once, retry the original request, then redirect to `/login` if still 401

## Error States
These must be handled on every dashboard page:
- Google Calendar disconnected → persistent banner with Reconnect button
- Slack disconnected → persistent banner with Reconnect button
- API error (5xx) → toast notification "Something went wrong. Please try again."
- Session expired → redirect to `/login` with flash message

## Optimistic Updates
For high-frequency actions (Mark Complete, Confirm, Dismiss):
- Update the UI immediately before the API call returns
- Revert if the API call fails
- Use TanStack Query's `onMutate`/`onError`/`onSettled` for this

## Accessibility
- All interactive elements must be keyboard-navigable (Tab, Enter, Escape)
- Escape closes modals and slide-over panels
- Importance badges must have sufficient color contrast (not color alone)
- Alt text on any icons used as buttons

## Responsive
- Desktop-first (1024px+)
- Tablet (768px): collapse sidebar to icon-only
- Mobile (<768px): hamburger menu — functional but not optimized for MVP
