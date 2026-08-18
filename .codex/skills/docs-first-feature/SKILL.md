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
python .codex/skills/docs-first-feature/scripts/docs_context.py review --query "<feature request>"
```

Read every file listed under `Recommended documents`, prioritizing higher scores. Increase `--limit` when the feature spans several subsystems. If no document matches, inspect the full inventory with `review` and no `--query`.

Summarize relevant constraints, contracts, and assumptions before implementation. Treat documentation as context, then verify it against current code when conflicts appear.

## 3. Implement the feature

Make the smallest coherent code change. Preserve unrelated work. Test in proportion to risk.

## 4. Update related documentation

Update the documents used as references whenever behavior, APIs, configuration, architecture, setup, limitations, or workflows changed. Add a focused file under `docs/` only when no existing document has a suitable home. Do not make cosmetic edits solely to satisfy verification.

## 5. Verify code and documentation together

After tests, run:

```bash
python .codex/skills/docs-first-feature/scripts/docs_context.py verify --base HEAD
```

The command must pass when feature code changed. If it reports missing documentation changes, update the appropriate document and rerun it. Use another Git base with `--base <revision>` when validating a branch or commit range.

In the final response, mention which documentation informed the implementation and which documentation was updated.
