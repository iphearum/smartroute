---
name: docs-first-feature
description: Enforce a documentation-first feature workflow by finding and reviewing related context under a repository's docs folder before coding, using those documents as implementation references, and updating relevant documentation after code changes. Use for implementing, changing, refactoring, or removing product features, APIs, architecture, configuration, behavior, or developer workflows in repositories that maintain project documentation under docs/.
---

# Docs First Feature

Follow this sequence. Do not begin code edits before completing the documentation review.

## 1. Find repository instructions

Read applicable repository instruction files such as `AGENTS.md`. Identify the repository root and confirm that `docs/` exists. For a differently named documentation directory, pass `--docs-dir`.

## 2. Review documentation before coding

Run the bundled script from the repository root with a concise feature description:

```bash
python <skill-root>/scripts/docs_context.py review --query "<feature request>"
```

Run the bundled script from the repository root, resolving `<skill-root>` from
the loaded skill's location. Read every file listed under `Recommended
documents`, prioritizing higher scores. Increase `--limit` when the feature
spans several subsystems. If no document matches, inspect the full inventory
with `review` and no `--query`.

Summarize relevant constraints, contracts, and assumptions before implementation. Treat documentation as context, then verify it against current code when conflicts appear.

## 3. Implement the feature

Make the smallest coherent code change. Preserve unrelated work. Test in proportion to risk.

### Repository structure during refactors

When the repository documents feature ownership, organize new or moved code by
feature or bounded context rather than leaving a growing flat list of files.
Keep genuinely shared primitives in a shared location, and keep entry points
(HTTP, WebSocket, CLI, or UI) thin: they should coordinate the owning module,
not accumulate parsing, streaming, validation, or domain rules.

Preserve specialized subsystems such as routing, search, or workflow engines
when their files are cohesive. Do not move their internals into generic
services merely to make the tree look uniform. Group operational scripts only
when their purpose is unambiguous, and update every import and documented CLI
invocation when moving one.

Before moving files, inventory imports, registration points, and entry points.
Prefer a complete import migration over stale compatibility shims; preserve a
shim only when a historical migration or external contract makes deletion
unsafe.

## 4. Update related documentation

Update the documents used as references whenever behavior, APIs, configuration, architecture, setup, limitations, or workflows changed. Add a focused file under `docs/` only when no existing document has a suitable home. Do not make cosmetic edits solely to satisfy verification.

## 5. Verify code and documentation together

After tests, run:

```bash
python <skill-root>/scripts/docs_context.py verify --base HEAD
```

The command must pass when feature code changed. If it reports missing documentation changes, update the appropriate document and rerun it. Use another Git base with `--base <revision>` when validating a branch or commit range.

In the final response, mention which documentation informed the implementation and which documentation was updated.
