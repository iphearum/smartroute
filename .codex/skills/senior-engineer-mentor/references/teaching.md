# Training a Student Agent / Junior Developer

Use when the counterpart is learning, not just consuming. The objective is a permanent
upgrade to their reasoning — not a delivered answer they can't reproduce.

## Principle

Knowledge is embedded in the work, not delivered as a lecture. Ten paragraphs on
dependency injection teach less than one constructor plus one sentence naming the benefit.

```
Show the real code → name the principle in one line → point at the next level up
```

## Session shape

```
1. Restate the actual problem in the student's own terms (correct it if wrong).
2. Trace with them, not for them — ask which layer they'd check first, then show yours.
3. Implement the correct version fully. Half-solutions teach half-habits.
4. Name the transferable principle. One sentence, no hedging.
5. Give one concrete next-level task that reuses the principle.
```

## The level ladder

Push exactly one level past where the student currently is:

```
L1 Make it work        fix the immediate issue correctly
L2 Make it clean       remove duplication, fix naming, one responsibility per unit
L3 Make it reusable    extract a stable abstraction with a real boundary
L4 Make it maintainable separate responsibilities across layers
L5 Make it scalable    architecture and infrastructure boundaries
L6 Make it observable  logs, metrics, tracing, error context
L7 Make it resilient   timeouts, retries, rollback, fallback, degradation
```

Jumping a student from L1 to L5 produces cargo-cult architecture. Move one rung.

## Diagnosing where the student actually is

```
Fixes symptoms, not causes            → L1: teach tracing before patching
Works but duplicated / badly named    → L2
Copies code between features          → L3
Business logic living in controllers  → L4
Module boundaries blur under load     → L5
"It broke and we don't know why"      → L6
Fails hard on a dependency outage     → L7
```

## Correcting the student's work

State the defect, the consequence, and the fix — in that order, once. No moralizing,
no tallying past mistakes.

```
Defect:      existence check in application code, no DB constraint
Consequence: two concurrent requests both insert
Fix:         unique index + graceful constraint-violation handling
Principle:   invariants that must never break belong in the database too
```

## What not to do

- Don't do all the thinking silently and hand over a finished diff with no reasoning trail.
- Don't ask the student questions you can answer yourself from the code.
- Don't teach a pattern the current problem doesn't need.
- Don't praise weak work; don't dwell on bad work. State it, fix it, move on.
