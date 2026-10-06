# Dialoggg Session Handoff — October 6, 2026

## Current task

Make the shared application header and sidebar responsive across the Dialoggg app for small screens. Preserve the desktop layout exactly as it is; the user explicitly said not to change desktop view. The requested responsive work is for phones and other small devices.

## Repository and workspace

- Correct application repository: `D:\Dialoggg\Dialoggg`
- The active terminal initially opened in `C:\Users\kajal\Downloads\naukari automation`, which is a different project. Do not edit that project for Dialoggg work.
- The Naukari Automation working tree had unrelated modified files (`ip_history.json`, `naukri_common.py`, `naukri_scroller.py`); preserve them.
- In the Dialoggg repo, pre-existing uncommitted work was present when inspected. Preserve it and avoid reverting or overwriting it:
  - `scripts/test-calendars-events-ui.mjs`
  - `scripts/test-resources-ui.mjs`
  - `src/app/(app)/calendar/page.tsx`
  - `src/app/(app)/resources/schedule/page.tsx`
  - `src/app/api/resources/schedule/route.ts`
  - `src/components/CalendarWorkflowReview.tsx`
  - untracked `src/components/TaskOccurrenceDialog.tsx`

## Important user decisions and preferences

- User clarified repeatedly that work must happen in the Dialoggg project, not the similarly named Naukari Automation folder.
- For the current request, only improve shared sidebar and top-header behavior on small devices, throughout the app.
- Desktop must remain visually and behaviorally unchanged.
- The user explicitly requested deployment for the current header/sidebar task; it has been deployed to Railway production.
- Communicate briefly and plainly; avoid unnecessary scope expansion. User prefers English for client-facing professional messages, but normal collaboration can match their Hindi/Hinglish style.

## Code inspection / implementation starting point

- Shared shell: `src/components/AppShell.tsx`
- It is mounted for app routes by `src/app/(app)/layout.tsx`, so changes there can cover the whole authenticated app.
- The mobile header now contains only the navigation toggle and Dialoggg logo. Account context/role controls, company logo, and working Log out action are grouped into a labeled Account box at the bottom of the mobile sidebar drawer.
- At desktop (`lg`, 1024px+) account controls remain in the header and the sidebar remains static, preserving the established desktop arrangement.
- The sidebar drawer uses phone-header-aware top padding and a flex layout so navigation and the account box fit/scroll on small viewports.
- Verification: `npm run build` passed; focused foundation mobile/accessibility test passed; `git diff --check` passed. The full foundation tests were previously attempted and had unrelated failures (Project Types copy expectations and local `better-sqlite3` Node ABI mismatch).
- Deployed to Railway `dialoggg` → `dialoggg-web`, production: `9ef81251-be50-41b2-96d2-fcd445d0fe4b` (SUCCESS). `/api/health/ready` and `/login` returned HTTP 200 after deployment.

## Broader project context from this conversation

The user has been iterating on Dialoggg client feedback. Recent substantial scope concerned the Resource Calendar and timeline:

- Resource Calendar page keeps its title and has Timeline and Calendar views; Timeline is default, last view should persist per user, and resources are grouped by category/type.
- Calendar view should follow Master Calendar month/week/day layout, grouped/ordered by resource; resource-assigned Tasks and Events only; task colors and event styling; multi-resource tasks repeat once per resource.
- Calendar interaction includes overflow (`+ N more`), tooltips with full details/dates, and role-appropriate task details/edit access. Employees should see details only, no Project Plan link.
- Resource type filter should be inside Calendar Controls, dynamically include categories, default all selected, have Select all/Clear all, persist across views, apply to Timeline and Calendar, and show selected categories near the month title. Empty selection message: “No resource types selected.”
- Mobile Calendar month view needs item dots/count and tapping a day opens that day’s items grouped by resource.
- Timeline bars need hover tooltips for truncated one-day labels.
- “Do Not Build” in client doc: individual-resource-name filter and drag-and-drop editing on Resource Calendar; no other Timeline changes beyond shared filter and hover tooltip.
- Other previous client requests included color alignment, Gantt duration/link/date rendering, project status controls, and auth page background color. Treat those as historical context, not part of the current responsive-shell task unless asked.

## Next actions for the new session

1. Read this handoff file.
2. Change working directory to `D:\Dialoggg\Dialoggg` and inspect `git status` before editing.
3. Inspect `src/components/AppShell.tsx` and existing app-shell UI/browser tests.
4. If continuing the app-shell task, inspect the deployed result on a phone viewport; refine only if requested, keeping desktop layout unchanged.
5. Preserve any unrelated working-tree changes. For further changes, verify and deploy only when explicitly requested.
