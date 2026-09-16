# DOC-08 — Gantt Scheduling and Dependency Rules

**Version:** 0.1  
**Status:** Approval required before scheduling-engine changes  
**Requirements:** `DG-GNT-001`–`DG-GNT-034`

## Non-negotiable product boundary

The current DHTMLX Gantt UI remains the foundation. Scheduling mathematics must be extracted or implemented as one deterministic server/domain engine used by direct edits, drags, dependency changes, Project Start Date changes, Templates, calendars, and Google synchronization.

## Date model

- A Task uses date-only values in the Project/company calendar context.
- Duration is a positive integer number of working days.
- Displayed Start and End are inclusive. Duration 1 starting Monday ends Monday.
- Each leaf independently allows/disallows Saturday and Sunday.
- No holiday calendar is included in v1 unless approved through change control.
- A Header/root has derived dates and cannot define independent working-day rules.

## Working-day functions

- `isAllowed(date, task)`: weekdays true; Saturday/Sunday use task flags.
- `normalizeForward(date, task)`: first allowed date on/after input.
- `addWorkingDaysInclusive(start, duration, task)`: normalize start; count it as day 1; advance only through allowed dates.
- `nextAllowedAfter(date, task)`: first allowed date strictly after input.
- Lag is a non-negative integer counted using the dependent/successor Task's working-day rules.

Examples:

| Start | Duration | Sat | Sun | End |
| --- | ---: |:---:|:---:| --- |
| Monday | 1 | No | No | Monday |
| Friday | 2 | No | No | Monday |
| Friday | 2 | Yes | No | Saturday |
| Saturday | 1 | No | No | Monday after forward normalization |

## Dependency constraints

Let `Sx` and `Fx` be inclusive start/finish. For successor `B`:

- **FS:** `SB = addLag(nextAllowedAfter(FA, B), lag, B)`. Zero lag starts the next allowed working day.
- **SS:** `SB = addLag(normalizeForward(SA, B), lag, B)`.
- **FF:** constrained finish is based on predecessor finish plus successor-calendar lag; derive `SB` backward so B's inclusive duration ends there.
- **SF:** constrained finish is based on predecessor start plus successor-calendar lag; derive `SB` backward.

The exact definition of zero-lag SS/FF/SF must be validated in the golden examples before approval. FS is explicitly approved by `FUP-005`.

## Multiple predecessors

- Evaluate every incoming link.
- Convert each link into the earliest valid successor start under that constraint.
- Select the latest resulting start.
- Preserve all incoming links.
- Recalculate whenever any predecessor, lag, link type, duration, or weekend rule changes.

## Cascading

1. Validate complete proposed change in memory/transaction.
2. Reject self-link, cross-Project link, duplicate invalid link, negative lag, and any cycle.
3. Recalculate affected Tasks in topological order.
4. Move successors both later and earlier when constraints change.
5. Recalculate ancestor Header dates and weighted progress bottom-up.
6. Set root span and Project End Date.
7. Commit Tasks, dependencies, audit record, and outbox notifications atomically.
8. Return every changed Task/version to the UI.

## Drag behavior

- Unlinked Time Period leaf: drag changes Start; edge drag changes Duration.
- Linked leaf: dragging retains dependencies and converts the requested placement into a new non-negative lag for the controlling constraint.
- If multiple predecessors make the requested position impossible without changing more than one lag, show an exact review or reject; do not silently delete links.
- Unauthorized/read-only roles cannot initiate or persist drag.
- Cancelled confirmation leaves source and downstream schedules unchanged.

## Header and root behavior

- Root exists exactly once and cannot be deleted, converted, or reparented.
- Header Start is the earliest descendant leaf Start.
- Header End is the latest descendant leaf End.
- Header progress is duration-weighted across descendant leaves: `sum(duration × progress) / sum(duration)`.
- Empty Header progress is 0 and dates remain unset or follow the documented placeholder policy.
- Header cannot have Resources or dependencies.
- Header with children cannot be deleted until children are moved/deleted.

## Deletion

Deleting a leaf removes its incoming/outgoing links in the same transaction, recalculates affected downstream constraints, ancestors, root, Project End Date, calendars, conflicts, and outbox work. Deleting a Header with children is rejected. Completed-history retention rules apply before physical deletion.

## Concurrency

- Each Plan has a version.
- Schedule commands require expected version.
- One transaction locks/validates the affected Plan.
- Stale edits return `409 VERSION_CONFLICT` with refresh guidance.
- External jobs receive only committed source versions and are idempotent.

## Golden test suite required

- All four link types with lags 0, 1, and larger.
- Each Saturday/Sunday combination.
- Multiple predecessors with different link types.
- Branch and merge graphs; multi-level earlier and later cascade.
- Cycle/self/cross-Project rejection with no partial writes.
- Leap day, month/year boundary, and DST-adjacent date-only cases.
- Header/root rollup, empty Header, deletion, reparenting, progress.
- Linked drag lag recalculation and impossible requested position.
- Project Start Date rebase, completed/archived behavior, Template instantiation.

## Approval blockers

Scott/product review must approve worked examples for zero-lag SS, FF, and SF; linked drag with multiple predecessors; and empty Header display. Engineering must approve the database/concurrency strategy before implementation.

