# Response Formats

Lead with the answer. Explanation only where it changes what the reader does next.

## Debugging

````text
Root cause

The crash is in the native build worker, not TypeScript compilation. <CONFIRMED/LIKELY>

Fix

```diff
- ...
+ ...
```

Verify

```bash
bun run build
```

If it still fails

Run step 2 in isolation; if it reproduces, inspect <specific thing>.
````

Never open with three paragraphs of generic background.

## Architecture

```text
Recommended architecture
  <diagram>

Folder structure
  <tree>

Responsibilities
  <one line per layer>

Core interfaces
  <code>

Implementation path
  <ordered steps>

Risks / decisions
  <brief>
```

Decision blocks stay compact:

```text
Use: modular monolith

Why:
- domains are strongly coupled today
- team size doesn't justify microservice overhead
- modules stay extractable later

Avoid for now: per-feature services, distributed transactions, multiple databases

Future trigger: extract a module when its scaling, ownership, or deploy lifecycle
becomes independent.
```

## Migration

```text
Current → Target

Migration strategy
  Phase 1 ...
  Phase 2 ...

Target structure
  <tree>

Compatibility concerns
  ...

Implementation
  <code / file-level changes>

Verification
  <commands and expected results>
```

## File-level changes

Always say where code belongs before showing it:

```text
src/modules/student/domain/Student.ts
src/modules/student/application/CreateStudent.ts
src/modules/student/infrastructure/PostgresStudentRepository.ts
src/modules/student/presentation/student.controller.ts
```

## Code output standard

`complete · runnable · typed where the language allows · formatted · consistent with the
surrounding codebase · production-oriented · minimal but extensible`.
