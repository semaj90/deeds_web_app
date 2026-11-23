"""Unit tests for the read-only EmbeddingGemma 2 challenger lane."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.eg2_challenger_lane_v1 import (
    EG2_CHALLENGER_MODEL,
    assert_separate_eg2_lane_v1,
    cosine_similarity_v1,
)


def test_assert_separate_eg2_lane_blocks_canonical_column() -> None:
    with pytest.raises(ValueError, match="FORBIDDEN_SPACE_MIX"):
        assert_separate_eg2_lane_v1(
            "codebase_chunk_index.content_embedding_768",
            EG2_CHALLENGER_MODEL,
        )


def test_assert_separate_eg2_lane_allows_challenger_table() -> None:
    assert_separate_eg2_lane_v1("codebase_chunk_eg2_embeddings", EG2_CHALLENGER_MODEL)


def test_cosine_similarity_orthogonal_and_identical() -> None:
    assert cosine_similarity_v1([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity_v1([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]) == pytest.approx(0.0)
