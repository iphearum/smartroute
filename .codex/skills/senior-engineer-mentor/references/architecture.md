# Code Analysis, Refactoring & Structure

## Reviewing code — look past syntax

```
Correctness · Readability · Naming · Duplication · Coupling · Cohesion
Responsibility · Reusability · Error handling · Type safety · Security
Performance · Testability · Extensibility · Framework conventions · Architecture
```

Then give each unit a verdict: `keep · clean · refactor · extract · rewrite · deprecate`.

## Refactoring progression — never skip ahead

```
Simple function → Reusable function → Reusable module → Service
→ Class/object → Domain abstraction → Pattern
```

Reach for a design pattern only when the simpler step has actually failed.

## Function vs OOP

Prefer a **function** when: logic is stateless · the operation is small ·
input→output is direct · no lifecycle · no shared internal state.

```ts
export function calculateAge(dateOfBirth: Date): number { /* ... */ }
```

Prefer a **class/object** when: state must be held · several operations belong to one
concept · dependencies are injected · multiple implementations share one contract ·
lifecycle matters · domain behavior needs encapsulation.

```ts
interface PaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

class AbaPaymentGateway implements PaymentGateway { /* ... */ }
```

OOP because OOP exists is not a reason.

## Reuse boundaries

Classify deliberately, never into one giant `utils/`:

```
Reusable generic logic · Reusable domain logic · Feature-specific logic
Infrastructure-specific logic · UI-specific logic
```

## Folder design

Small app — keep it flat and boring. Medium/large — group by feature/domain, not by file type:

```
src/
├── app/            bootstrap, routes, middleware
├── modules/
│   ├── auth/       domain/ application/ infrastructure/ presentation/ index.ts
│   ├── students/   domain/ application/ infrastructure/ presentation/ index.ts
│   └── attendance/
├── shared/         errors/ types/ validation/ logging/ helpers/
├── infrastructure/ database/ cache/ queue/ storage/ integrations/
└── config/
```

Never force enterprise layering onto a small CRUD app.

### Feature package boundaries in an existing application

For an established application with a growing service or module directory, use
feature packages as recognition and ownership boundaries, not as a reason to
invent layers:

```text
src/
├── shared/               # genuinely reusable behavior
├── features/
│   ├── identity/         # one bounded context
│   └── planning/         # another bounded context
└── infrastructure/      # databases, clients, queues, adapters
```

Keep route/controller/CLI files as thin entry points. Move parsing, validation,
streaming, and domain behavior into the owning feature package. Use short module
names inside a feature when the package already provides context
(`feature/stream.py`, `feature/tools.py`); keep descriptive names at shared
boundaries where context is not obvious.

Operational scripts are entry points rather than domain services. Group them by
purpose only when the grouping is unambiguous, and preserve their invocation
contract. A specialized subsystem may remain flat while its files are cohesive;
split it into subpackages only when the dependency graph or ownership actually
requires that distinction.

## Layer responsibility

```
Presentation → Application → Domain → Infrastructure     (dependencies point inward)
```

- **Presentation** — HTTP/CLI/UI, request parsing, response formatting. No business rules.
- **Application** — use cases, workflow, orchestration, transactions.
- **Domain** — entities, value objects, business rules, domain services, contracts.
- **Infrastructure** — DB, filesystem, HTTP clients, Redis, queues, mail, external APIs.

Worked example of moving a fat controller into this shape: `examples/use-case-refactor.md`.

## Architecture evolution

```
Simple app → Feature modules → Modular monolith → Clear domain boundaries
→ Extract selected services only when justified
```

Extraction trigger: a module's scaling, ownership, or deployment lifecycle becomes
genuinely independent. Not before.

## Existing-project rule

1. Inspect existing conventions.  2. Preserve the useful ones.
3. Name the problematic ones.     4. Don't introduce a second competing architecture.
5. Refactor incrementally.        6. Keep compatibility unless breaking it is justified.

## Configuration

No hard-coded environment values. Use env vars / a typed config object / a secret manager,
and **validate config at startup** so misconfiguration fails immediately, not at 3am.

## Dependencies

Before adding one, ask: can the language/framework already do this cleanly? Is it
maintained? How much complexity and transitive surface does it bring? Is it
security-sensitive? Does it lock the project in? Prefer fewer, higher-quality deps.

## Upgrading a technology

Newer is not a reason. Evaluate: stability · support lifecycle · ecosystem ·
migration cost · team familiarity · performance · security · compatibility ·
operational complexity · long-term maintenance.

## Technical debt found along the way

```
CRITICAL  fix now
IMPORTANT fix in this task if practical
NORMAL    note it, schedule it
COSMETIC  ignore unless already editing that code
```

Never derail the task for cosmetic debt.

## Git-friendly changes

Small enough to review · logically grouped · easy to revert · testable ·
backward-compatible where possible. Large migrations ship as independent steps.
