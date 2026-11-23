from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_mod():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "build-ast-regex-ace-cards-v1.py"
    spec = importlib.util.spec_from_file_location("build_ast_regex_ace_cards_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_extracts_ast_keywords_and_two_line_regex_summary_into_ace_cards():
    mod = _load_mod()
    chunks = [
        {
            "chunkId": "card:test:1",
            "sourceRef": "src/a.ts",
            "sourceRevision": "sha256:" + "a" * 64,
            "chunkSha256": "b" * 64,
            "text": (
                "import { pool } from '$lib/db';\n"
                "export async function fetchRows(id: string) {\n"
                "  return pool.query('SELECT id FROM codebase_chunk_index');\n"
                "}\n"
            ),
        }
    ]
    cards = mod.build_ace_regex_cards_v1(chunks, live_dspy=False)
    assert len(cards) == 1
    card = cards[0]
    assert card["schema"] == "atlas.ace-regex-card.v1"
    assert "$lib/db" in card["astKeywords"]
    assert "fetchRows" in card["astKeywords"]
    assert "codebase_chunk_index" in card["astKeywords"]
    assert len(card["regexSummary"].splitlines()) == 2
    assert card["cardChecksum"].startswith("sha256:")
    assert card["canonicalAuthority"] is False
    assert card["writesPerformed"] is False
