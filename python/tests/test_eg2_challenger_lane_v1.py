"""Unit tests for the read-only EmbeddingGemma 2 challenger lane."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.eg2_challenger_lane_v1 import (
    EG2_CHALLENGER_MODEL,
    EG2_Q8_MODEL_REVISION,
    EG2_Q8_REPRESENTATION_ID,
    assert_separate_eg2_lane_v1,
    cosine_similarity_v1,
    resolve_query_vector_v1,
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


def test_default_q8_query_encoder_only_accepts_its_exact_recipe() -> None:
    with pytest.raises(ValueError, match="EG2_QUERY_ENCODER_RECIPE_MISMATCH"):
        resolve_query_vector_v1(
            [0.0] * 768,
            representation_id="embeddinggemma2-trt-rtx-code-retrieval-doc-v1",
            model_revision="onnx-community/embeddinggemma-2-ONNX@model_trt_ctx.onnx",
            query_vector=None,
            query_vector_model_revision=None,
        )

    q8_vector = [0.0] * 768
    q8_vector[0] = 1.0
    vector, revision = resolve_query_vector_v1(
        q8_vector,
        representation_id=EG2_Q8_REPRESENTATION_ID,
        model_revision=EG2_Q8_MODEL_REVISION,
        query_vector=None,
        query_vector_model_revision=None,
    )
    assert vector is None
    assert revision == EG2_Q8_MODEL_REVISION


def test_supplied_query_vector_must_match_recipe_revision_and_be_unit_normalized() -> None:
    recipe = "onnx-trt-rtx-v1"
    vector = [0.0] * 768
    vector[0] = 1.0
    resolved, revision = resolve_query_vector_v1(
        [0.0] * 768,
        representation_id="embeddinggemma2-trt-rtx-code-retrieval-doc-v1",
        model_revision=recipe,
        query_vector=vector,
        query_vector_model_revision=recipe,
    )
    assert resolved == vector
    assert revision == recipe

    with pytest.raises(ValueError, match="EG2_QUERY_VECTOR_REVISION_MISMATCH"):
        resolve_query_vector_v1(
            [0.0] * 768,
            representation_id="embeddinggemma2-trt-rtx-code-retrieval-doc-v1",
            model_revision=recipe,
            query_vector=vector,
            query_vector_model_revision="other-recipe",
        )

    with pytest.raises(ValueError, match="EG2_QUERY_VECTOR_NOT_UNIT_NORMALIZED"):
        resolve_query_vector_v1(
            [0.0] * 768,
            representation_id="embeddinggemma2-trt-rtx-code-retrieval-doc-v1",
            model_revision=recipe,
            query_vector=[0.0] * 768,
            query_vector_model_revision=recipe,
        )
