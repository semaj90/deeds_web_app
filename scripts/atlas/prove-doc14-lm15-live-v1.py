"""Read-only :8090 transport and DSPy native-lm15 capability probe.

Probes /health, /v1/models, /props, JSON response modes, and one structured DSPy Predict call.
This probe deliberately does not build an ACE manifest or claim citation verification. A
recommendation proof must use the strict ContextManifestV2 + independent readback-row path.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any

import dspy

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (
    build_native_dspy_lm_v1,
    resolve_live_model_id_v1,
)

RECEIPT_PATH = Path(os.environ.get(
    "ATLAS_DOC14_LM15_CAPABILITY_RECEIPT_PATH",
    str(REPO_ROOT / "docs" / "reports" / "doc14-llama-lm15-capability-receipt-v1.json"),
)).resolve()


class DspyCapabilitySignature(dspy.Signature):
    """Minimal structured probe; it receives no repository or case evidence."""

    prompt: str = dspy.InputField()
    answer: str = dspy.OutputField()


def _http_json(url: str, body: dict[str, Any] | None = None, timeout_s: float = 20.0) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
        headers={"Content-Type": "application/json"} if body is not None else {},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    base_url = "http://127.0.0.1:8090"
    health = _http_json(f"{base_url}/health")
    model_id = resolve_live_model_id_v1(base_url=base_url)
    props = _http_json(f"{base_url}/props")

    jobj = _http_json(
        f"{base_url}/v1/chat/completions",
        {
            "model": model_id,
            "messages": [{"role": "user", "content": "Return JSON with one string field named answer."}],
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "max_tokens": 256,
        },
    )
    jschema = _http_json(
        f"{base_url}/v1/chat/completions",
        {
            "model": model_id,
            "messages": [{"role": "user", "content": "Answer using the required schema."}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "doc14_probe",
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "answer": {"type": "string"},
                            "supporting_chunk_ids": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["answer", "supporting_chunk_ids"],
                    },
                },
            },
            "temperature": 0,
            "max_tokens": 256,
        },
    )

    jobj_text = jobj.get("choices", [{}])[0].get("message", {}).get("content", "")
    jschema_text = jschema.get("choices", [{}])[0].get("message", {}).get("content", "")
    json_object_ok = isinstance(json.loads(jobj_text), dict)
    json_schema_parsed = json.loads(jschema_text)
    json_schema_ok = isinstance(json_schema_parsed, dict) and "answer" in json_schema_parsed and "supporting_chunk_ids" in json_schema_parsed

    lm = build_native_dspy_lm_v1(base_url=base_url, requested_model_id=model_id)
    with dspy.context(lm=lm):
        prediction = dspy.Predict(DspyCapabilitySignature)(prompt="Reply with the word ready only.")
    predicted_answer = str(getattr(prediction, "answer", "") or "").strip()
    if not predicted_answer:
        raise RuntimeError("DSPY_PREDICT_EMPTY_OUTPUT")

    receipt = {
        "schema": "atlas.doc14-llama-lm15-capability-receipt.v1",
        "dspyVersion": getattr(dspy, "__version__", "unknown"),
        "engine": "lm15",
        "litellmUsed": False,
        "modelId": model_id,
        "serverBuildInfo": props.get("build_info"),
        "serverBaseUrl": f"{base_url}/v1",
        "transportCapabilities": {
            "healthStatus": health.get("status"),
            "jsonObjectSupported": json_object_ok,
            "jsonSchemaSupported": json_schema_ok,
        },
        "dspyPredictCapability": {
            "status": "DSPY_PREDICT_SUCCEEDED",
            "engine": "lm15",
            "structuredAnswerPresent": True,
            "responseSha256": "sha256:" + hashlib.sha256(predicted_answer.encode("utf-8")).hexdigest(),
            "aceContextProvided": False,
            "citationVerified": False,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }

    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**receipt, "reportPath": str(RECEIPT_PATH)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
