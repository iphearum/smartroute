# Migration & Technology Upgrade

Never start by rewriting. Start by understanding what must not break.

```
Current system → Business-critical behavior → Technical debt → Dependencies
→ Compatibility constraints → Migration risks → Target architecture → Strategy
```

## 1. Inventory

```
framework · language · runtime · database · auth · authorization · sessions
file storage · queues · cron · cache · external APIs · frontend · build system
deployment · reverse proxy · CI/CD · monitoring · tests · legacy integrations
```

## 2. Classify every component

`KEEP · UPGRADE · REFACTOR · REPLACE · REMOVE · DEFER`

| Component | Current | Target | Action |
|---|---|---|---|
| Runtime | unsupported version | supported version | UPGRADE |
| Framework | legacy release | supported release | UPGRADE |
| UI/client layer | legacy implementation | replacement implementation | REPLACE |
| Database | existing engine | same engine | KEEP |
| Business rules | in controllers | use cases/services | REFACTOR |
| Deprecated API | old contract | — | REMOVE |

## 3. Phased strategy (prefer incremental; big-bang needs justification)

```
Phase 0 Audit                 Phase 5 Data migration
Phase 1 Tests / behavior lock Phase 6 Compatibility verification
Phase 2 Architecture boundary Phase 7 Cutover
Phase 3 Runtime/deps upgrade  Phase 8 Legacy removal
Phase 4 Feature migration     Phase 9 Optimization
```

## 4. Preserve behavior before improving it

Capture, and where possible lock with tests, before touching anything major:
existing inputs · outputs · API contracts · DB behavior · auth behavior ·
business rules · known edge cases.

## 5. Backward compatibility

Check impact on: frontend · mobile apps · third-party clients · public APIs ·
DB schemas · stored files · tokens · sessions · external services · old URLs.

Tools when compatibility is required:
`adapter · facade · compatibility endpoint · versioned API · migration script ·
feature flag · dual write · shadow read`.

## 6. Database migration is not schema conversion

Analyze: schema · constraints · indexes · sequences · triggers · stored procedures ·
views · encoding · collation · time zones · NULL semantics · data types · large tables ·
foreign keys · application assumptions baked into the data.

```
schema → sample migration → validation → full migration
→ checksum/row-count comparison → application verification → rollback readiness
```

Rollback plan exists before cutover, not after the incident.

## 7. API migration

Compare per endpoint: route · method · headers · authentication · authorization ·
request schema · response schema · status codes · error shape · pagination · filtering ·
sorting · rate limits · side effects · idempotency.

Breaking an existing contract must be a decision, never an accident.

## 8. Rollout and cutover

Choose the rollout mechanism based on blast radius and reversibility:

```
shadow read · dark launch · feature flag · canary · percentage rollout
dual read · dual write · expand/contract · blue/green · maintenance window
```

For every phase, define before implementation:

- success signals and error budgets;
- invariant checks and comparison queries;
- who or what can stop the rollout;
- the exact rollback or roll-forward command;
- how in-flight jobs, sessions, caches, and queued messages are handled.

Do not call a migration reversible merely because the old code still exists.
Prove that data written by the new path can be read by the old path, or make
the compatibility window and recovery procedure explicit.

## 9. Data backfills and dual paths

Treat schema changes, data backfills, application changes, and traffic changes
as separate operations when they have different failure modes. Prefer an
expand/contract sequence for live systems:

```
expand schema → deploy readers → backfill in bounded batches
→ compare old/new representations → switch writers/readers
→ monitor stability → contract old schema after the recovery window
```

Backfills must be restartable, bounded, observable, and safe to run twice.
Record progress and validate both counts and business invariants; a row-count
match alone does not prove semantic equivalence.

## 10. Operational readiness

Before cutover, verify more than code and tests:

```
backup restore · migration rehearsal · capacity · latency · error rates
permissions · secrets · health checks · dashboards · alerts · runbook
```

Exercise the rollback path in an environment that resembles production. State
the remaining risks, monitoring owner, recovery window, and cleanup date. Keep
compatibility code and flags until evidence shows they are no longer needed;
then remove them in a separate, reviewable change.
