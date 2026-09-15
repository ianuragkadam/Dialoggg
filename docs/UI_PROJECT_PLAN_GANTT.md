# Project Plan / Gantt Workflow UI Module

Last verified: September 15, 2026

## Delivery boundary

This UI-only review layer is rendered immediately above the existing internal `GanttChart`. It does not replace or edit the original Gantt engine and its review actions do not persist Task, dependency, Resource, Project, calendar, Google, or Microsoft data.

The layer makes the approved Reboot workflows reviewable before the shared scheduling engine and persistence work is completed: full Task editor variants, working-day rules, dependency types, multiple predecessors, cascade explanations, drag semantics, root/Header roll-ups, validation, and safe deletion states.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-GNT-001`–`DG-GNT-005` | Shows the single Project Plan, protected Project root, nested Header/leaf hierarchy, and explicitly retains the original left-list/right-timeline Gantt with weekend presentation. |
| `DG-GNT-006`–`DG-GNT-013` | Full Task editor review includes Task Name, Header/leaf choice, parent, Time Period/Link start method, Start Date, integer Duration, inclusive End Date, independent Saturday/Sunday rules, Resource Category, multiple Resources, Color, Progress, save/cancel/delete paths, and validation. |
| `DG-GNT-014`–`DG-GNT-019`, `FUP-005` | Dependency review includes all four link types, multiple predecessors, latest-constraint-wins copy, non-negative integer lag, dependent-Task working-day language, and next-allowed-workday zero-lag Finish-to-Start examples. |
| `DG-GNT-020`–`DG-GNT-027` | UI explains earlier/later transitive cascades, linked-Task drag-to-lag behavior, identical editor/bar link creation, connector behavior in the retained Gantt, atomic invalid-link rejection, bar/edge/progress dragging, and double-click editing. |
| `DG-GNT-028`–`DG-GNT-034` | Header/root review covers derived dates, duration-weighted progress, no direct Resources/dependencies, child-safe deletion block, Project End Date roll-up, safe link cleanup, and one shared scheduling result across every downstream surface. |
| `DG-ROL-004`, `DG-ROL-005`, `DG-ROL-008` | Owner/Admin sees workflow controls, Employee receives read-only Project Plan controls, and the previously delivered External/Client view remains separate and safe. |
| `DG-UX-005` | Responsive control layer avoids page-level phone overflow while the original Gantt retains its own horizontally scrollable timeline. |

## Dialog and interaction inventory

1. Add Task / Review Header Task — conditional full editor with inline validation.
2. Review Task schedule — exact summary before the UI-only apply confirmation.
3. Create dependency — predecessor, dependent Task, type, lag, and atomic validation boundaries.
4. Scheduling guide — six plain-language scheduling examples.
5. Root Header Task is protected — immutable root explanation.
6. Header Task cannot be deleted — child-preservation block.
7. Delete Task? — incoming/outgoing link cleanup and recalculation confirmation.
8. Status confirmations — explicitly state that no production data changed.

## Verification

- Production build and TypeScript validation pass.
- Focused Playwright suite covers 13 Project Plan scenarios.
- Existing foundation, end-to-end scenario, and all previous UI module suites are rerun before deployment.
- Human click-through QA is performed in a visible browser after automated QA.

