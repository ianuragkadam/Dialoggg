# DOC-12 — Non-Functional Requirements and Service Objectives

**Version:** 0.1  
**Status:** Proposed targets requiring owner approval

## Measurement assumptions

These targets must be tested with a representative dataset, not an empty demo. Scott's approved acceptance profile is:

- Several companies on the platform.
- Up to 25 Users per company.
- Up to 100 Resources per company.
- Up to 250 active Projects per company.
- Up to 500 Tasks per Project with representative dependencies.
- 10 simultaneously active Users in one company plus background integration work (`IC-003`).

A separate engineering stress profile should run at approximately twice these record/concurrency levels to identify the failure slope; it is not a new client acceptance requirement.

## Proposed service objectives

| Area | Target | Measurement |
| --- | --- | --- |
| Availability | 99.5% monthly excluding approved maintenance | External uptime check |
| Normal API read | p95 ≤ 750 ms, p99 ≤ 2 s | Server metrics under benchmark load |
| Normal API write | p95 ≤ 1.5 s excluding vendor delivery | Server metrics |
| Large Project Plan load | p95 ≤ 3 s to usable UI | Browser synthetic test |
| Local schedule recalculation | p95 ≤ 2 s for benchmark Plan | Domain benchmark |
| Google delivery | Normally ≤ 2 minutes | Outbox age metric; approved requirement |
| Google transient retry | Up to 24 hours with visible state | Job history test |
| Backup | Daily, verified, off-volume, 30-day retention | Backup records/alerts |
| Restore time | ≤ 4 hours | Quarterly restore drill |
| Recovery point | Proposed ≤ 24 hours until a tighter target is approved | Backup cadence |
| Accessibility | WCAG 2.2 AA for primary workflows | Automated + manual audit |
| Browser support | Current maintained Chrome, Edge, Safari, mobile Safari, mobile Chrome | Release matrix |

## Reliability and correctness

- No acknowledged write may disappear silently.
- Multi-record domain changes are atomic.
- Integration delivery is at-least-once internally with idempotent external effect.
- Gantt calculation is deterministic for the same inputs.
- Cross-company leakage tolerance is zero.
- Backup verification and restore testing are mandatory, not optional operational tasks.

## Accessibility

Primary workflows target WCAG 2.2 AA. This includes keyboard operation, focus not obscured, labels/errors, status announcements, contrast, 200% zoom/reflow, non-color meaning, accessible authentication, and alternatives to drag-only operations. WCAG 2.2 specifically requires an alternative to dragging unless dragging is essential and defines a 24×24 CSS pixel minimum target-size criterion with exceptions. See [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

For the Gantt, every drag action must have an editor or keyboard/single-pointer alternative. Mobile may use a compact task list plus horizontally scrollable timeline.

## Performance research plan

1. Generate the benchmark dataset above.
2. Measure database queries and indexes for Projects, calendars, permission joins, Plan load, and conflict checks.
3. Benchmark cascade graphs: chain, branch, merge, worst valid graph.
4. Load-test interactive writes alongside outbox/job processing.
5. Repeat on the selected production database and Railway plan.
6. Record p50/p95/p99, errors, locks, CPU, memory, volume latency, and job age.

## Capacity/architecture trigger

SQLite WAL still has one writer at a time. If benchmark write latency, lock rate, job delay, operational scaling, or availability targets cannot be met with one replica, migrate to PostgreSQL before completing backend modules rather than after launch.

## Maintainability

- TypeScript strictness should be enabled or increased through an approved staged plan.
- New domain behavior requires unit/API/scenario evidence.
- No module may depend on undocumented production-only state.
- A new engineer should complete setup and run the suite using documented steps in under one working day.

## Approval questions

- Expected maximum company/User/Project/Task volumes.
- Required monthly availability and permitted maintenance window.
- Final RPO if 24 hours is unacceptable.
- Whether accessibility conformance requires third-party audit.
- Supported minimum browser versions rather than only current families.
