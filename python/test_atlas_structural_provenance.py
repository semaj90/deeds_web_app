from dataclasses import dataclass
from enum import Enum

from atlas_structural_provenance import (
    is_exact_langextract_alignment,
    normalize_langextract_extraction,
    normalize_treesitter_chunker_chunk,
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
