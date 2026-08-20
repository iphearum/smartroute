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
| PHP | 7.4 | 8.4 | UPGRADE |
| Laravel | 8 | current LTS-supported | UPGRADE |
| jQuery UI | legacy | React/Inertia | REPLACE |
| PostgreSQL | existing | PostgreSQL | KEEP |
| Business rules | in controllers | use cases/services | REFACTOR |
| Dead API v0 | — | — | REMOVE |

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
