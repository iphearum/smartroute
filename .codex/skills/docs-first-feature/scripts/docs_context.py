#!/usr/bin/env python3
"""Find feature context in docs and verify code changes include documentation."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

DOC_SUFFIXES = {".md", ".mdx", ".rst", ".txt", ".yaml", ".yml", ".json"}
WORD = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.:/-]{2,}")
STOP_WORDS = {"about", "after", "before", "change", "code", "create", "feature",
              "from", "have", "into", "need", "please", "should", "that", "their",
              "then", "this", "update", "using", "with"}


def run(root: Path, *command: str) -> list[str]:
    result = subprocess.run(command, cwd=root, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, check=False)
    return [line for line in result.stdout.splitlines() if line.strip()]


def documentation_files(root: Path, docs_dir: str) -> list[Path]:
    directory = (root / docs_dir).resolve()
    if not directory.is_dir():
        raise SystemExit(f"Documentation directory not found: {directory}")
    return sorted(path for path in directory.rglob("*")
                  if path.is_file() and path.suffix.casefold() in DOC_SUFFIXES)


def terms(value: str) -> set[str]:
    return {token.casefold() for token in WORD.findall(value)
            if token.casefold() not in STOP_WORDS}


def review(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    files = documentation_files(root, args.docs_dir)
    if not args.query:
        print("Documentation inventory:")
        for path in files:
            print(f"- {path.relative_to(root)}")
        return 0
    needles, ranked = terms(args.query), []
    for path in files:
        content = path.read_text(encoding="utf-8", errors="replace")
        lowered, path_terms = content.casefold(), terms(str(path.relative_to(root)))
        score = sum(8 for item in needles if item in path_terms)
        score += sum(min(5, lowered.count(item)) for item in needles)
        headings = [line.strip() for line in content.splitlines()
                    if line.lstrip().startswith("#")
                    and any(item in line.casefold() for item in needles)][:3]
        score += len(headings) * 3
        if score:
            ranked.append((score, path, headings))
    ranked.sort(key=lambda item: (-item[0], str(item[1])))
    print(f"Query terms: {', '.join(sorted(needles)) or '(none)'}")
    print("Recommended documents:")
    if not ranked:
        print("- No direct match. Run review without --query and inspect the inventory.")
    for score, path, headings in ranked[:max(1, args.limit)]:
        print(f"- {path.relative_to(root)} (score {score})")
        for heading in headings:
            print(f"  {heading}")
    return 0


def changed_files(root: Path, base: str) -> set[str]:
    changed = set(run(root, "git", "diff", "--name-only", base, "--"))
    changed.update(run(root, "git", "diff", "--cached", "--name-only", "--"))
    for line in run(root, "git", "status", "--porcelain", "--untracked-files=all"):
        path = line[3:]
        changed.add(path.split(" -> ", 1)[-1])
    return {path for path in changed if path}


def verify(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    documentation_files(root, args.docs_dir)
    changed, docs_prefix = changed_files(root, args.base), args.docs_dir.strip("./") + "/"
    documentation = sorted(path for path in changed if path.startswith(docs_prefix))
    ignored = (docs_prefix, ".codex/", ".github/", "tests/", "test/")
    source = sorted(path for path in changed if not path.startswith(ignored)
                    and Path(path).name not in {"README.md", "CHANGELOG.md"})
    print("Changed implementation files:")
    print("\n".join(f"- {path}" for path in source) or "- None")
    print("Changed documentation files:")
    print("\n".join(f"- {path}" for path in documentation) or "- None")
    if source and not documentation:
        print("ERROR: implementation changed without a related docs/ update.", file=sys.stderr)
        return 1
    print("Documentation verification passed.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument("--docs-dir", default="docs", help="Docs directory relative to root")
    commands = parser.add_subparsers(dest="command", required=True)
    review_parser = commands.add_parser("review", help="Rank docs related to a feature")
    review_parser.add_argument("--query", default="", help="Feature request or search terms")
    review_parser.add_argument("--limit", type=int, default=8)
    review_parser.set_defaults(handler=review)
    verify_parser = commands.add_parser("verify", help="Require docs changes with code changes")
    verify_parser.add_argument("--base", default="HEAD", help="Git revision used as diff base")
    verify_parser.set_defaults(handler=verify)
    return parser


if __name__ == "__main__":
    arguments = build_parser().parse_args()
    raise SystemExit(arguments.handler(arguments))
