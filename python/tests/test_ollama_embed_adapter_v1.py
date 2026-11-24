from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path
from unittest import mock

import pytest

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.ollama_embed_adapter_v1 import (
    EG2_MRL_128,
    EG2_MRL_256,
    EG2_MRL_512,
    EG2_MRL_768,
    EG2_SUPPORTED_MRL_DIMS,
    LEGACY_EMBEDDINGGEMMA_768,
    OFFICIAL_EG2_CONFIGS,
    EmbedValidationError,
    MultimodalCapabilityError,
    OllamaEmbedAdapterV1,
    build_eg2_profile,
    validate_vectors,
)


def _ollama_reachable() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def test_official_eg2_config_specs() -> None:
    assert set(OFFICIAL_EG2_CONFIGS.keys()) == {"270M", "440M", "570M", "740M"}
    assert OFFICIAL_EG2_CONFIGS["270M"].supports_vision is False
    assert OFFICIAL_EG2_CONFIGS["270M"].supports_audio is False
    assert OFFICIAL_EG2_CONFIGS["440M"].supports_vision is True
    assert OFFICIAL_EG2_CONFIGS["440M"].supports_audio is False
    assert OFFICIAL_EG2_CONFIGS["570M"].supports_vision is False
    assert OFFICIAL_EG2_CONFIGS["570M"].supports_audio is True
    assert OFFICIAL_EG2_CONFIGS["740M"].supports_vision is True
    assert OFFICIAL_EG2_CONFIGS["740M"].supports_audio is True


def test_validate_vectors_rejects_nonfinite_and_unnormalized() -> None:
    unit = [1.0 / math.sqrt(4.0)] * 4
    vecs, norms, all_finite, all_norm = validate_vectors([unit], expected_count=1, expected_dim=4)
    assert len(vecs) == 1
    assert all_finite is True
    assert all_norm is True
    assert abs(norms[0] - 1.0) < 1e-6

    with pytest.raises(EmbedValidationError, match="non-finite"):
        validate_vectors([[float("nan"), 0.0, 0.0, 1.0]], expected_count=1, expected_dim=4)

    with pytest.raises(EmbedValidationError, match="normalization"):
        validate_vectors([[2.0, 0.0, 0.0, 0.0]], expected_count=1, expected_dim=4, require_normalized=True)

    with pytest.raises(EmbedValidationError, match="dim=4"):
        validate_vectors([[1.0, 0.0]], expected_count=1, expected_dim=4)


def test_profile_separation_and_task_prefixes() -> None:
    adapter = OllamaEmbedAdapterV1(ollama_url="http://127.0.0.1:11434")
    legacy_inputs = adapter.format_inputs(["hello world"], profile=LEGACY_EMBEDDINGGEMMA_768, task_type="code_retrieval")
    eg2_inputs = adapter.format_inputs(["hello world"], profile=EG2_MRL_512, task_type="code_retrieval")
    assert legacy_inputs == ["hello world"]
    assert eg2_inputs == ["task: code retrieval | query: hello world"]
    assert LEGACY_EMBEDDINGGEMMA_768.space_id != EG2_MRL_512.space_id


def test_multimodal_gate_fails_closed_on_270m_mock() -> None:
    adapter = OllamaEmbedAdapterV1(ollama_url="http://127.0.0.1:11434")
    fake_show = {
        "digest": "sha256:abc",
        "license": "Gemma",
        "details": {"family": "gemma-embedding2", "parameter_size": "271.00M", "quantization_level": "Q8_0"},
        "model_info": {"gemma-embedding2.context_length": 262144, "gemma-embedding2.embedding_length": 512},
        "capabilities": ["embedding"],
    }
    with mock.patch("atlas_graph_runtime.ollama_embed_adapter_v1._post_json", return_value=fake_show):
        caps = adapter.inspect_runtime("embeddinggemma2:q8_0")
        assert caps.config_tier == "270M"
        assert caps.supports_text is True
        assert caps.supports_vision is False
        assert caps.supports_audio is False
        with pytest.raises(MultimodalCapabilityError):
            adapter.encode_image(["ZmFrZQ=="], model_tag="embeddinggemma2:q8_0")
        with pytest.raises(MultimodalCapabilityError):
            adapter.encode_audio(["ZmFrZQ=="], model_tag="embeddinggemma2:q8_0")


@pytest.mark.skipif(not _ollama_reachable(), reason="Live Ollama :11434 not reachable")
def test_live_eg2_mrl_dimensions_and_capability_gate() -> None:
    adapter = OllamaEmbedAdapterV1()
    caps = adapter.inspect_runtime("embeddinggemma2:q8_0")
    assert caps.config_tier == "270M"
    assert caps.supports_text is True
    assert caps.supports_vision is False
    assert caps.supports_audio is False

    with pytest.raises(MultimodalCapabilityError):
        adapter.encode_image(["ZmFrZQ=="], model_tag="embeddinggemma2:q8_0")

    for dim, prof in ((768, EG2_MRL_768), (512, EG2_MRL_512), (256, EG2_MRL_256), (128, EG2_MRL_128)):
        res = adapter.encode_code(
            ["export async function verifyAcePacket(id: string) { return true; }"],
            profile=prof,
            truncate=False,
        )
        assert res.dimensions == dim
        assert res.all_finite is True
        assert res.all_normalized is True
        assert len(res.vectors) == 1
        assert len(res.vectors[0]) == dim
        assert build_eg2_profile(dim).space_id == prof.space_id


@pytest.mark.skipif(not _ollama_reachable(), reason="Live Ollama :11434 not reachable")
def test_live_legacy_api_embed_vs_api_embeddings_parity() -> None:
    text = "export async function handleAuthLogin(sessionId: string) { return db.select().from(users); }"
    adapter = OllamaEmbedAdapterV1()
    new_res = adapter.embed_batch([text], profile=LEGACY_EMBEDDINGGEMMA_768, truncate=True, require_normalized=False)
    new_vec = new_res.vectors[0]

    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/embeddings",
        data=json.dumps({"model": "embeddinggemma:latest", "prompt": text}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        old_vec = json.loads(resp.read().decode("utf-8"))["embedding"]

    assert len(new_vec) == len(old_vec) == 768
    dot = sum(a * b for a, b in zip(new_vec, old_vec))
    norm_a = math.sqrt(sum(a * a for a in new_vec))
    norm_b = math.sqrt(sum(b * b for b in old_vec))
    cosine = dot / (norm_a * norm_b)
    assert cosine >= 0.9999
