"""Tests for DOC-07: semantic_768 representation via embed_llama_server_768
(parent-atlas-versioned-doc-intelligence).

No prior test existed for this function at all before this session --
DOC-07's task text ("EXISTS, reuse as-is") described an untested reuse.
Covers both a real integration proof (live :8081 llama.cpp embedding server,
confirmed running this session -- n_embd:768 via GET /v1/models) and the
fail-closed guard paths (mocked, since triggering a wrong-dimension/non-finite
response from a real healthy server isn't practical).
"""

from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import patch

import numpy as np
import pytest

from atlas_external_docs import embed_llama_server_768

_LIVE_BASE_URL = "http://host.docker.internal:8081"
_LIVE_MODEL = "embeddinggemma-300m-f16.gguf"


def _live_server_available() -> bool:
    import urllib.request

    try:
        with urllib.request.urlopen(f"{_LIVE_BASE_URL}/v1/models", timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


_LIVE_SKIP_REASON = "embedding server not reachable at :8081 in this environment"


@pytest.mark.skipif(not _live_server_available(), reason=_LIVE_SKIP_REASON)
def test_live_embedding_is_768_dim_finite_and_normalized():
    vectors = embed_llama_server_768(
        ["CUDA kernel programming with tile_ir on sm_86."],
        base_url=_LIVE_BASE_URL,
        model=_LIVE_MODEL,
    )
    assert vectors.shape == (1, 768)
    assert vectors.dtype == np.float32
    assert np.isfinite(vectors).all()
    assert np.linalg.norm(vectors[0]) == pytest.approx(1.0, abs=1e-4)


@pytest.mark.skipif(not _live_server_available(), reason=_LIVE_SKIP_REASON)
def test_live_distinct_texts_produce_distinct_vectors():
    vectors = embed_llama_server_768(
        [
            "CUDA kernel programming with tile_ir on sm_86.",
            "Postgres full text search uses GIN indexes on tsvector columns.",
        ],
        base_url=_LIVE_BASE_URL,
        model=_LIVE_MODEL,
    )
    assert not np.allclose(vectors[0], vectors[1])


@pytest.mark.skipif(not _live_server_available(), reason=_LIVE_SKIP_REASON)
def test_live_deterministic_across_repeated_calls():
    text = ["Deterministic replay proof text for DOC-07."]
    first = embed_llama_server_768(text, base_url=_LIVE_BASE_URL, model=_LIVE_MODEL)
    second = embed_llama_server_768(text, base_url=_LIVE_BASE_URL, model=_LIVE_MODEL)
    assert np.allclose(first, second)


def _mock_response(payload: dict) -> BytesIO:
    return BytesIO(json.dumps(payload).encode("utf-8"))


class _FakeHTTPResponse:
    def __init__(self, payload: dict):
        self._buffer = _mock_response(payload)

    def read(self) -> bytes:
        return self._buffer.read()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_missing_embedding_key_fails_closed():
    with patch("atlas_external_docs.urlopen", return_value=_FakeHTTPResponse({"data": [{}]})):
        with pytest.raises(RuntimeError, match="EMBEDDING_RESPONSE_MISSING_VECTOR"):
            embed_llama_server_768(["text"], base_url="http://fake/")


def test_empty_data_array_fails_closed():
    with patch("atlas_external_docs.urlopen", return_value=_FakeHTTPResponse({"data": []})):
        with pytest.raises(RuntimeError, match="EMBEDDING_RESPONSE_MISSING_VECTOR"):
            embed_llama_server_768(["text"], base_url="http://fake/")


def test_wrong_dimension_fails_closed_never_substitutes_zero_vector():
    wrong_dim_vector = [0.1] * 512  # not 768
    with patch(
        "atlas_external_docs.urlopen",
        return_value=_FakeHTTPResponse({"data": [{"embedding": wrong_dim_vector}]}),
    ):
        with pytest.raises(RuntimeError, match="EMBEDDING_VECTOR_INVALID"):
            embed_llama_server_768(["text"], base_url="http://fake/")


def test_non_finite_vector_fails_closed():
    non_finite_vector = [float("nan")] * 768
    with patch(
        "atlas_external_docs.urlopen",
        return_value=_FakeHTTPResponse({"data": [{"embedding": non_finite_vector}]}),
    ):
        with pytest.raises(RuntimeError, match="EMBEDDING_VECTOR_INVALID"):
            embed_llama_server_768(["text"], base_url="http://fake/")


def test_pipeline_wiring_passes_manifest_embedding_config_through():
    """Static proof that atlas_okf_docs_pipeline.py's real end-to-end pipeline
    stage (not a hypothetical future call site) actually calls
    embed_llama_server_768 with the manifest's own embedding_url/embedding_model
    -- confirmed by reading the source, asserted here so a future refactor that
    silently drops that wiring fails a test instead of going unnoticed."""
    import inspect

    import atlas_okf_docs_pipeline as pipeline_module

    source = inspect.getsource(pipeline_module)
    assert "embed_llama_server_768(" in source
    assert "manifest.embedding_url" in source
    assert "manifest.embedding_model" in source
