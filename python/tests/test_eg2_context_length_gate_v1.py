"""Regression tests for scripts/atlas/eg2-context-length-gate-v1.py (no database)."""
from __future__ import annotations

import base64
import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
GATE_PATH = REPO / "scripts" / "atlas" / "eg2-context-length-gate-v1.py"

_spec = importlib.util.spec_from_file_location("eg2_gate", GATE_PATH)
gate = importlib.util.module_from_spec(_spec)
sys.modules["eg2_gate"] = gate  # dataclasses resolve their module through sys.modules
_spec.loader.exec_module(gate)


def b64_wrapped(text: str) -> str:
    """Mimic PostgreSQL encode(...,'base64'): newline every 76 characters."""
    raw = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return "\n".join(raw[i:i + 76] for i in range(0, len(raw), 76))


class FakeEncoding:
    def __init__(self, ids):
        self.ids = ids


class FakeTokenizer:
    """One token per character, so boundaries can be set exactly."""

    def __init__(self, truncation=None):
        self.truncation = truncation

    def encode(self, text):
        return FakeEncoding(list(text))


# ── selector ──────────────────────────────────────────────────────────────

def test_selector_never_calls_abs_on_hash():
    sql = gate.selector_sql(250)
    assert "abs(" not in sql
    assert "::bigint" in sql


def test_selector_shift_is_non_negative_for_int4_minimum():
    # hashtext() can return -2^31; abs() on it overflows int4 in PostgreSQL.
    h = -2147483648
    shifted = h + gate.HASH_SHIFT
    assert shifted == 0
    assert 0 <= shifted < 2**32
    assert (-2147483648 + gate.HASH_SHIFT) % 250 == 0


@pytest.mark.parametrize("bad", [0, -1, 2.5, "250"])
def test_selector_rejects_invalid_modulus(bad):
    with pytest.raises(ValueError):
        gate.selector_sql(bad)


def test_selector_is_deterministic():
    assert gate.selector_sql(250) == gate.selector_sql(250)
    assert gate.fetch_sql(250) == gate.fetch_sql(250)


# ── decoding ──────────────────────────────────────────────────────────────

def test_sql_strips_base64_newlines_so_each_record_is_one_line():
    assert "replace(encode(convert_to(content,'UTF8'),'base64'), E'\\n', '')" in gate.fetch_sql(250)


def test_wrapped_base64_is_never_silently_truncated():
    # Regression for the original bug: only the first 76-char line was read,
    # so every chunk looked 57 characters long. Continuation lines have no tab,
    # so they must be counted as invalid, not accepted as complete content.
    text = "x" * 400
    raw = f"src/a.ts\t{b64_wrapped(text)}"
    report = gate.decode_rows(raw)
    assert report.rows == []
    assert report.invalid_records >= 1


def test_joined_single_line_record_decodes_fully():
    text = "x" * 400
    raw = f"src/a.ts\t{b64_wrapped(text).replace(chr(10), '')}"
    assert gate.decode_rows(raw).rows == [("src/a.ts", text)]


def test_unicode_survives_round_trip():
    text = "§ 1234 — naïve café 漢字 ✓"
    report = gate.decode_rows(f"legal/p.md\t{b64_wrapped(text)}".replace("\n", ""))
    assert report.rows == [("legal/p.md", text)]


def test_exact_source_bytes_preserved_including_internal_whitespace():
    text = "line one\n\n  indented\ttab\r\n"
    report = gate.decode_rows(f"a.txt\t{base64.b64encode(text.encode()).decode()}")
    assert report.rows[0][1] == text


def test_empty_content_is_counted_not_measured():
    report = gate.decode_rows(f"a.ts\t{base64.b64encode(b'   \n').decode()}")
    assert report.rows == []
    assert report.empty_content == 1


def test_invalid_base64_is_counted_not_guessed():
    report = gate.decode_rows("a.ts\t!!!not-base64!!!")
    assert report.rows == []
    assert report.invalid_records == 1


def test_missing_tab_is_counted():
    report = gate.decode_rows("no-tab-here")
    assert report.invalid_records == 1


def test_undecodable_utf8_is_counted():
    bad = base64.b64encode(b"\xff\xfe\xfd").decode()
    report = gate.decode_rows(f"a.bin\t{bad}")
    assert report.undecodable == 1
    assert report.rows == []


def test_empty_input_yields_no_rows():
    report = gate.decode_rows("")
    assert report.rows == [] and report.invalid_records == 0


# ── recipe and measurement ────────────────────────────────────────────────

def test_recipe_text_is_exact():
    assert gate.build_text("src/a.ts", "  hi  ") == "title: src/a.ts | text: hi"
    assert gate.build_text("", "hi") == "title: none | text: hi"


def test_truncation_enabled_is_refused():
    with pytest.raises(RuntimeError):
        gate.measure(FakeTokenizer(truncation={"max_length": 512}), [("a", "b")], 99)


def test_empty_rows_measure_without_division_error():
    stats = gate.measure(FakeTokenizer(), [], 99)
    assert stats["rows"] == 0
    assert stats["fractionOver"]["512"] == 0.0
    assert stats["tokens"]["max"] == 0


@pytest.mark.parametrize("payload_tokens,expected_bucket", [
    (512, 512),   # exactly at the 512 boundary: fits
    (513, 1024),  # one over: next bucket
    (1024, 1024),
    (1025, 2048),
    (8192, 8192),
    (8193, 8192),  # over the largest bucket: clamped, caller must chunk
])
def test_bucket_boundaries(payload_tokens, expected_bucket):
    # With a one-token-per-character tokenizer, make the full recipe text exactly payload_tokens long.
    prefix = gate.build_text("", "")  # "title: none | text: "
    body = "y" * (payload_tokens - len(prefix))
    stats = gate.measure(FakeTokenizer(), [("", body)], 100)
    assert stats["tokens"]["max"] == payload_tokens
    assert stats["recommendedContextTokens"] == expected_bucket


def test_percentile_nearest_rank():
    assert gate.percentile([1, 2, 3, 4], 50) == 2
    assert gate.percentile([1, 2, 3, 4], 100) == 4
    assert gate.percentile([], 99) == 0


def test_fraction_over_counts_strictly_greater_than_bucket():
    rows = [("", "y" * (512 - 20)), ("", "y" * (600 - 20))]
    stats = gate.measure(FakeTokenizer(), rows, 99)
    n = stats["rows"]
    assert n == 2
    assert stats["fractionOver"]["512"] == 0.5


def test_prompt_overhead_is_positive_with_real_tokenizer():
    tok_path = gate.TOKENIZER
    if not tok_path.exists():
        pytest.skip("EG2 tokenizer not present")
    from tokenizers import Tokenizer

    tok = Tokenizer.from_file(str(tok_path))
    tok.no_truncation()
    tok.no_padding()
    stats = gate.measure(tok, [("a.ts", "function f() { return 1 }")], 99)
    assert stats["promptOverheadTokens"] > 0
