from dataclasses import dataclass
from enum import Enum

from atlas_structural_provenance import (
    find_occurrence_positions,
    is_exact_langextract_alignment,
    normalize_langextract_extraction,
    normalize_treesitter_chunker_chunk,
    occurrence_to_absolute_position,
)


@dataclass
class FakeChunk:
    node_id: str = "node-native"
    file_id: str = "file-native"
    symbol_id: str = "symbol-native"
    chunk_id: str = "chunk-native"
    node_type: str = "function_definition"
    symbol: str = "update_case"
    parent_route: tuple[str, ...] = ("module", "CaseService")
    parent_context: str = "CaseService"
    byte_start: int = 10
    byte_end: int = 40
    start_line: int = 2
    end_line: int = 4
    metadata: dict = None

    def __post_init__(self):
        self.metadata = {
            "calls": ["authorize_case"],
            "imports": ["db"],
            "exports": ["update_case"],
            "dependencies": ["CasePolicy"],
        }


class AlignmentStatus(Enum):
    MATCH_EXACT = "match_exact"
    MATCH_FUZZY = "match_fuzzy"


@dataclass
class CharInterval:
    start_pos: int
    end_pos: int


@dataclass
class FakeExtraction:
    extraction_class: str
    extraction_text: str
    char_interval: CharInterval | None
    alignment_status: AlignmentStatus | None
    attributes: dict


def test_chunker_native_ids_are_preserved():
    result = normalize_treesitter_chunker_chunk(FakeChunk())
    assert result["upstream_node_id"] == "node-native"
    assert result["upstream_file_id"] == "file-native"
    assert result["upstream_symbol_id"] == "symbol-native"
    assert result["upstream_chunk_id"] == "chunk-native"
    assert result["parent_route"] == ["module", "CaseService"]
    assert result["calls"] == ["authorize_case"]


def test_langextract_char_interval_and_alignment_are_preserved():
    result = normalize_langextract_extraction(FakeExtraction(
        extraction_class="authorization",
        extraction_text="case owner",
        char_interval=CharInterval(4, 14),
        alignment_status=AlignmentStatus.MATCH_EXACT,
        attributes={"role": "owner"},
    ))
    assert result["grounded"] is True
    assert result["char_interval"] == {"start_pos": 4, "end_pos": 14}
    assert result["alignment_status"] == "match_exact"
    assert is_exact_langextract_alignment(result["alignment_status"])


def test_ungrounded_langextract_result_remains_unpromotable():
    result = normalize_langextract_extraction(FakeExtraction(
        extraction_class="authorization",
        extraction_text="invented relation",
        char_interval=None,
        alignment_status=None,
        attributes={},
    ))
    assert result["grounded"] is False
    assert result["char_interval"] is None


# --- find_occurrence_positions (CSGR-3, 2026-08-29) ---
# Regression test for the real live finding: treesitter-chunker's flat name-string lists made
# every AstEvidenceEdge inside one chunk inherit the SAME chunk-level position — 94.8% of
# unresolved_target edges shared a position with a sibling in the live corpus (see
# openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md). These cases are the
# exact real chunks that exhibited the bug, used here as regression fixtures.

PROMISE_EXECUTOR_SOURCE = """
async function readInput() {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin });
    const rows = [];
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    });
    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}
"""


def test_find_occurrence_positions_disambiguates_previously_shared_chunk_position():
    # Live-observed bug: rl.on / line.trim / rows.push / JSON.parse all previously reported the
    # SAME position (the chunk's own start), because treesitter-chunker doesn't track
    # per-occurrence positions. Each must now resolve to its own distinct, correct position.
    result = find_occurrence_positions(
        PROMISE_EXECUTOR_SOURCE, "javascript", ["rl.on", "line.trim", "rows.push", "JSON.parse"]
    )
    assert len(result["rl.on"]) == 3  # called 3 times: 'line', 'close', 'error'
    assert len(result["line.trim"]) == 1
    assert len(result["rows.push"]) == 1
    assert len(result["JSON.parse"]) == 1
    # All four occurrence sets must be at genuinely distinct positions from each other.
    all_positions = result["line.trim"] + result["rows.push"] + result["JSON.parse"]
    assert len(set(all_positions)) == len(all_positions)


def test_find_occurrence_positions_finds_every_call_to_a_repeated_name():
    source = (
        "const REPORT_JSON = path.join(ROOT, 'a.json');\n"
        "const REPORT_MD = path.join(ROOT, 'a.md');\n"
        "const OTHER = path.join(ROOT, 'x');\n"
    )
    result = find_occurrence_positions(source, "javascript", ["path.join"])
    assert len(result["path.join"]) == 3
    rows = [row for row, _column in result["path.join"]]
    assert rows == [0, 1, 2]  # one call per line, in source order


def test_find_occurrence_positions_returns_empty_list_for_absent_name():
    result = find_occurrence_positions("const x = 1;", "javascript", ["never.called"])
    assert result == {"never.called": []}


def test_find_occurrence_positions_never_raises_on_empty_or_invalid_input():
    assert find_occurrence_positions("", "javascript", ["foo"]) == {"foo": []}
    assert find_occurrence_positions("const x = ", "javascript", []) == {}


# --- occurrence_to_absolute_position ---

def test_occurrence_to_absolute_position_row_zero_adds_chunk_start_column():
    # A chunk starting at file line 40, column 8 (mid-line, e.g. after "  export ") — an
    # occurrence on the chunk's own first row (row 0) sits on that same file line, so its
    # column must be measured from the chunk's own start column, not from column 0.
    assert occurrence_to_absolute_position(
        chunk_start_line=40, chunk_start_column=8, occurrence_row=0, occurrence_column=5
    ) == (40, 13)


def test_occurrence_to_absolute_position_later_row_is_already_absolute_column():
    # A chunk starting at file line 40 — an occurrence on the chunk's row 2 is file line 42, a
    # full line of its own with no chunk-prefix material stripped, so its column is used as-is.
    assert occurrence_to_absolute_position(
        chunk_start_line=40, chunk_start_column=8, occurrence_row=2, occurrence_column=5
    ) == (42, 5)


def test_occurrence_to_absolute_position_end_to_end_with_a_non_zero_chunk_start():
    # Exercises the real bug class: a chunk that does NOT start at file line 0 (this pass's
    # earlier find_occurrence_positions tests all conveniently started at row 0 — this closes
    # that gap). Simulates a function chunk starting at file line 100.
    source = (
        "function example() {\n"
        "  path.join(a, b);\n"
        "  return path.join(c, d);\n"
        "}\n"
    )
    result = find_occurrence_positions(source, "javascript", ["path.join"])
    assert len(result["path.join"]) == 2
    chunk_start_line, chunk_start_column = 100, 0  # chunk begins at the start of file line 100
    absolute = [
        occurrence_to_absolute_position(chunk_start_line, chunk_start_column, row, column)
        for row, column in result["path.join"]
    ]
    # Row 1 (second source line) -> file line 101; row 2 (third source line) -> file line 102.
    assert absolute == [(101, 2), (102, 9)]
