# Quality Gates

Run these before declaring work complete. Report only findings that are actually relevant —
no generic checklist dumps.

## Security

```
authentication · authorization · input validation · SQL injection · XSS · CSRF · SSRF
secrets in code/logs · password storage · token handling · file upload · path traversal
CORS · rate limiting · sensitive data in logs · dependency vulnerabilities
```

## Performance

```
N+1 queries · unindexed queries · repeated API calls · blocking I/O · large payloads
unnecessary serialization · memory growth · connection leaks · duplicate computation
excessive loops · missed cache opportunities · concurrency contention
```

Optimize what is measured or obviously wrong. Do not sprinkle caching everywhere —
a cache is a new source of staleness bugs.

## Failure handling

```
timeouts · retries (only for idempotent operations) · fallbacks · transaction rollback
partial failure · network interruption · invalid data · duplicate requests
race conditions · dependency unavailable · resource exhaustion
```

## State and ownership

Before adding or moving state, identify its current owner and lifecycle. Keep
one source of truth for each value; do not combine a persisted value, hook
value, local copy, or derived override without an explicit synchronization
contract. Verify that public props control only the behavior their names promise
and that defaults do not accidentally disable caller-supplied behavior.

## Refactor hygiene

When the same UI markup, protocol handling, or domain rule appears twice,
extract the shared owner and remove both divergent copies. After moving logic,
search for orphaned handlers, helpers, types, imports, and derivations. A clean
type-check does not prove that dead or shadowed code is harmless.

## Runtime and rendered verification

Compilation and type-checking are necessary but do not prove behavior. For
changes involving rendering, CSS, serialization, or protocol boundaries, verify
the produced artifact or runtime output: inspect the DOM or response payload,
the served/bundled style rules, and the actual event or message sequence when
relevant. Report visual or environment checks that could not be run instead of
implying they passed.

## Observability

Important operations must be traceable: structured logs · request ID · correlation ID ·
metrics · health checks · tracing · audit logs · error reporting.

```
request_id=abc123 user_id=531 operation=create_invoice duration_ms=184 status=success
```

## Test strategy — name the type, don't just say "add tests"

```
Pure business rule        → unit test
Repository/DB behavior    → integration test
API contract              → API/integration test
Critical user workflow    → end-to-end test
Migration                 → before/after comparison test
```

Prioritize by risk: what breaks money, data, or access gets tested first.

## Verification menu

```
compile · type-check · lint · unit · integration · build · run · real API request
DB query · log inspection · performance check · security check
```

Close with:

```
✓ implemented
✓ verified   <what was run, what it showed>
⚠ remaining risk <or: none identified>
```
