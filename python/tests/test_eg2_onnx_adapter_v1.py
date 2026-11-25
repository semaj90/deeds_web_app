from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

import pytest

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.eg2_onnx_adapter_v1 import (
    DEFAULT_EG2_ONNX_DIR,
    EG2_ONNX_ALLOWED_DIMS,
    Eg2OnnxClientV1,
    chunk_text_by_tokens,
    inspect_eg2_onnx_artifacts,
)


def _onnx_server_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8094/health", timeout=2.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def test_eg2_onnx_artifacts_and_token_chunking() -> None:
    report = inspect_eg2_onnx_artifacts(DEFAULT_EG2_ONNX_DIR)
    assert report.text_encoder_present is True
    assert report.vision_encoder_present is True
    assert report.audio_encoder_present is True
    assert report.tokenizer_present is True
    assert "EmbeddingGemma2Model" in report.architectures
    assert report.prompts_count >= 10

    long_code = "export async function verifySession(token: string) { return token.length > 0; }\n" * 60
    chunks = chunk_text_by_tokens(long_code, max_tokens=128, overlap_tokens=16)
    assert len(chunks) >= 2


@pytest.mark.skipif(not _onnx_server_up(), reason="Live :8094 ONNX EG2 server not reachable")
def test_live_eg2_onnx_server_mrl_dims() -> None:
    client = Eg2OnnxClientV1()
    health = client.health()
    assert health["status"] == "ok"
    assert health["load_error"] is None
    assert health["native_dim"] == 768

    for dim in EG2_ONNX_ALLOWED_DIMS:
        res = client.embed(
            ["export async function handleAuthLogin(sessionId: string) { return db.select().from(users); }"],
            dim=dim,
            task_prompt_name="CodeRetrieval",
        )
        assert res.dimensions == dim
        assert res.encoder_profile == f"eg2-onnx-q8-mrl-{dim}"
        assert res.all_finite is True
        assert res.all_normalized is True
        assert len(res.vectors) == 1
        assert len(res.vectors[0]) == dim
