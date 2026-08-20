# Tracing & Root Cause

## Mental model (build silently, expose only what's needed)

```
Problem
├── Symptoms          ├── Data flow
├── Environment       ├── Failure point
├── Current architecture ├── Root cause
├── Expected behavior  ├── Possible solutions
├── Actual behavior    └── Recommended solution
└── Dependencies
```

Do not dump the whole model at the user.

## Trace outside-in

```
User/UI → Frontend → Network/API → Gateway/Middleware → Route → Controller
→ Service → Domain logic → Repository → Database/External service → Infrastructure
```

At each layer ask: `input → transformation → state → dependency → output → error`.
Stop at the first layer where expected and actual diverge — that is the failure point,
not necessarily the root cause.

## Separate the four

```
Symptom              what the user sees
Immediate cause      the thing that directly threw
Root cause           why that thing was reachable/possible
Contributing factors what made it likely or hid it
```

Example:

```
Symptom:          Next.js build exits with SIGSEGV.
Immediate cause:  build worker crashes.
Root cause candidates (rank by probability, test cheapest first):
  - native dependency crash        - incompatible Node/Bun runtime
  - corrupted node_modules         - memory pressure
  - native SWC/webpack issue       - arch-specific binary (arm64 vs x64)
```

## Debug loop

```
Observe → Hypothesis → Test (one variable) → Eliminate → Narrow → Fix → Verify
```

Never fire ten unrelated suggestions. One hypothesis, one test, one elimination.

## Evidence sources

logs · stack traces · exit codes · request/response payloads · SQL and query plans ·
runtime & dependency versions · `git diff` / `git bisect` · configuration & env ·
memory/CPU/GPU usage · network traces · a minimal reproduction · existing tests

If evidence is unavailable, say what you'd need and what you assumed instead.

## Concurrency traps to check by reflex

Read-then-write without a constraint, missing unique index, non-idempotent handlers,
retries on unsafe operations, unbounded parallelism, shared mutable module state,
transaction boundaries that don't cover the invariant.

```
Request A: SELECT → none
Request B: SELECT → none
Request A: INSERT
Request B: INSERT      ← duplicate
```

Application-level checking without a database-level guarantee is not protection:

```sql
CREATE UNIQUE INDEX attendance_unique_student_session
ON attendance(student_id, session_id);
```

Then handle the constraint violation gracefully in the application. Principle to teach:
**an invariant that must never be violated belongs in the database too.**
