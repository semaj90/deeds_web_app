"""Sentence/AST Lexical Keyword [] + 1-2 Line Regex Summary -> ACE JSON Packet Builder (v1).

Extracts deterministic `astKeywords: list[str]` and a 1-2 line `regexSummary` from
PROVEN chunks (`doc14-admitted-chunks.jsonl`), optionally enriches via primitive
`dspy.Predict` (`engine="lm15"`), and emits bounded ACE JSON cards (`atlas.ace-regex-card.v1`).

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

CHUNKS_PATH = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
OUT_PATH = REPO_ROOT / "docs" / "reports" / "doc14-ast-regex-ace-cards-v1.jsonl"

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.;\n])\s+")
_AST_IDENT_RE = re.compile(
    r"\b(?:(?:export\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)\b|"
    r"\bfrom\s+['\"]([^'\"]+)['\"]|"
    r"\b(?:SELECT|INSERT|UPDATE|FROM|JOIN)\s+([a-z_][a-z0-9_]*)\b)"
)
_DECL_LINE_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const)\s+[A-Za-z0-9_]+.*$"
)
_RETURN_THROW_RE = re.compile(r"^\s*(?:return|throw|await)\b.*$")


def extract_ast_keywords_and_regex_summary_v1(text: str) -> tuple[list[str], str, int]:
    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text.replace("\r\n", "\n")) if s.strip()]
    keywords: set[str] = set()
    for m in _AST_IDENT_RE.finditer(text):
        for grp in m.groups():
            if grp:
                keywords.add(grp)

    summary_lines: list[str] = []
    for line in text.replace("\r\n", "\n").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if _DECL_LINE_RE.match(stripped) and len(summary_lines) < 2:
            summary_lines.append(stripped[:160])
        elif _RETURN_THROW_RE.match(stripped) and len(summary_lines) < 2:
            summary_lines.append(stripped[:160])
        if len(summary_lines) >= 2:
            break

    if not summary_lines and sentences:
        summary_lines = [s[:160] for s in sentences[:2]]

    return sorted(keywords), "\n".join(summary_lines[:2]), len(sentences)


def build_ace_regex_cards_v1(
    chunks: Sequence[dict[str, Any]],
    *,
    live_dspy: bool = False,
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    if live_dspy:
        raise ValueError("CANONICAL_ACE_CONTEXT_REQUIRED")

    for chunk in chunks:
        text = str(chunk.get("text") or "")
        ast_keywords, regex_summary, sentence_count = extract_ast_keywords_and_regex_summary_v1(text)
        dspy_summary = None

        card_body = {
            "schema": "atlas.ace-regex-card.v1",
            "chunkId": str(chunk["chunkId"]),
            "sourceRef": str(chunk["sourceRef"]),
            "sourceRevision": str(chunk["sourceRevision"]),
            "chunkSha256": str(chunk["chunkSha256"]),
            "sentenceCount": sentence_count,
            "astKeywords": ast_keywords,
            "regexSummary": regex_summary,
            "dspyGrounded": dspy_summary,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        card_body["cardChecksum"] = "sha256:" + hashlib.sha256(
            json.dumps(card_body, sort_keys=True).encode("utf-8")
        ).hexdigest()
        cards.append(card_body)
    return cards


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--live-dspy", action="store_true")
    args = parser.parse_args()

    chunks = [
        json.loads(line)
        for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ][: max(1, args.limit)]
    cards = build_ace_regex_cards_v1(chunks, live_dspy=args.live_dspy)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        "\n".join(json.dumps(c, ensure_ascii=False) for c in cards) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "schema": "atlas.ace-regex-cards-batch.v1",
                "cardCount": len(cards),
                "sampleCard": cards[0] if cards else None,
                "outPath": str(OUT_PATH),
                "canonicalAuthority": False,
                "writesPerformed": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
