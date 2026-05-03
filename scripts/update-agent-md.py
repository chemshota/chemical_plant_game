#!/usr/bin/env python3
"""AGENT.md のファイル一覧セクションを実際のソースツリーから再生成する。

`<!-- BEGIN:FILE-TREE -->` と `<!-- END:FILE-TREE -->` の間を上書きする。
この2つのマーカーがない場合は何もしない。冪等。

実行例:
    python3 scripts/update-agent-md.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT_MD = ROOT / "AGENT.md"

BEGIN_MARKER = "<!-- BEGIN:FILE-TREE -->"
END_MARKER = "<!-- END:FILE-TREE -->"

# ソースとして扱うトップレベル要素 (ファイル or ディレクトリ)
SOURCE_PATHS: list[str] = ["index.html", "css", "js"]
# 一覧から除外するファイル名パターン
EXCLUDE_SUFFIXES: tuple[str, ...] = (".swp", ".bak", "~")


def collect_files() -> list[Path]:
    files: list[Path] = []
    for entry in SOURCE_PATHS:
        p = ROOT / entry
        if not p.exists():
            continue
        if p.is_file():
            files.append(p)
        else:
            for child in sorted(p.rglob("*")):
                if child.is_file() and not child.name.endswith(EXCLUDE_SUFFIXES):
                    files.append(child)
    return sorted(files, key=lambda f: f.relative_to(ROOT).as_posix())


def render_tree(files: list[Path]) -> str:
    lines = ["```"]
    for f in files:
        lines.append(f.relative_to(ROOT).as_posix())
    lines.append("```")
    return "\n".join(lines)


def main() -> int:
    if not AGENT_MD.exists():
        print(f"warn: {AGENT_MD} が存在しないためスキップしました", file=sys.stderr)
        return 0

    text = AGENT_MD.read_text(encoding="utf-8")
    if BEGIN_MARKER not in text or END_MARKER not in text:
        # マーカーが無いリポジトリ状態 (例: マーカーを意図的に外した) は何もしない
        return 0

    files = collect_files()
    new_block = f"{BEGIN_MARKER}\n{render_tree(files)}\n{END_MARKER}"
    pattern = re.compile(
        re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER),
        re.DOTALL,
    )
    new_text = pattern.sub(new_block, text, count=1)

    if new_text != text:
        AGENT_MD.write_text(new_text, encoding="utf-8")
        print(f"updated: {AGENT_MD.relative_to(ROOT)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
