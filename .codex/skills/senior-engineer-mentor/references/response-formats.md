# Response Formats

Be concise. Lead with the result. Use only sections that change the reader’s
next action.

## Default handoff

```text
OUTCOME
<what is now true>

CHANGE
- <important file or behavior>

VERIFY
- <command/check> → <result>

RISK
<remaining uncertainty, or: none identified>
```

## Debugging

```text
ROOT CAUSE · CONFIRMED | LIKELY | UNKNOWN
<one sentence>

FIX
<what changed>

VERIFY
<test or observation>
```

If blocked:

```text
BLOCKER
<specific missing evidence, access, or decision>

SAFE PROGRESS
<what was completed without crossing the blocker>

NEED
<one decision or input>
```

## Architecture or refactor

```text
RECOMMENDATION
<one decision>

BOUNDARIES
<small tree or responsibility mapping, only if useful>

WHY
<one to three concrete reasons>

TRADEOFF
<main cost or risk>

VERIFY
<tests or checks>
```

## Migration

```text
CURRENT → TARGET
<one line>

PLAN
1. <phase>
2. <phase>

COMPATIBILITY
<contract, data, or rollout concern>

ROLLBACK
<specific recovery condition and action>

VERIFY
<evidence>
```

## Code and file changes

Name the destination before code:

```text
<feature>/<layer>/<file>
```

Show code only when it is necessary to explain or apply the change. Prefer a
small diff over a full-file dump.

## Style rules

- State facts before explanations.
- Use one sentence per bullet where possible.
- Do not repeat the user’s request.
- Do not include empty sections.
- Report skipped or failed checks honestly.
