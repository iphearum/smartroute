# Development workflow

## Documentation-first feature changes

Before implementing or changing a feature, review related files in `docs/` and use them as implementation context. After changing code, update the documents affected by behavior, API, configuration, architecture, setup, limitations, or workflow changes.

The repository skill `.codex/skills/docs-first-feature` formalizes this workflow. Its helper can rank relevant documents before work begins:

```bash
python .codex/skills/docs-first-feature/scripts/docs_context.py review \
  --query "route calculation performance"
```

After implementation and testing, verify that implementation changes include a documentation update:

```bash
python .codex/skills/docs-first-feature/scripts/docs_context.py verify --base HEAD
```

Use `--docs-dir <directory>` when a repository stores documentation outside `docs/`, and use `--base <revision>` to validate a branch or commit range.
