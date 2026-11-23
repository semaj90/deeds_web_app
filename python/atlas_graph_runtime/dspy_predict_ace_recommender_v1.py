"""Task 3 & Task 5: Structured dspy.Predict Recommender over Bounded ACE Context + Offline GEPA Gate.

Per AGENTS.md:
  - Never pass raw search hits directly to the LLM; require a canonicalized ContextManifest.
  - Resolve the active model ID dynamically from :8090/v1/models (never hardcode a model name).
  - Verify cited chunk IDs and exact quote substrings against the bounded manifest.
  - Keep offline GEPA optimization separate from promotion approval and ontology truth.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any, Callable, Mapping, Sequence

import dspy
from .doc14_bounded_rlm_recommender_v1 import (
    run_bounded_dspy_recommendation_with_ace_manifest_v1,
)


class _ChannelStrippingXMLAdapter(dspy.XMLAdapter):
    """Strip Gemma 4 `<channel|>` reasoning preamble before XML field parsing."""

    def parse(self, signature, completion):  # type: ignore[override]
        if isinstance(completion, str) and "<channel|>" in completion:
            completion = completion.split("<channel|>", 1)[1].lstrip()
        return super().parse(signature, completion)


class AceGroundedRecommendationSignature(dspy.Signature):
    """Recommend an engineering action grounded strictly in the provided ContextManifest chunks."""

    task_query: str = dspy.InputField(desc="Bounded engineering task or question.")
    context_manifest_json: str = dspy.InputField(desc="Canonicalized ACE ContextManifest JSON.")
    recommendation: str = dspy.OutputField(desc="Concise action grounded in the chunks.")
    cited_chunk_id: str = dspy.OutputField(desc="Exact chunkId from context_manifest_json.")
    exact_quote: str = dspy.OutputField(desc="Exact verbatim substring from the cited chunk text.")


# Bind this callable in server code to the authenticated request scope. The
# readback owner must verify current admission and return the exact selected
# rows, or return None. Request data must never supply the callable.
ScopedAceReadbackV1 = Callable[
    [str], tuple[Mapping[str, Any], Sequence[dict[str, Any]]] | None
]


def resolve_live_model_id_v1(base_url: str = "http://127.0.0.1:8090", timeout_s: float = 5.0) -> str:
    endpoint = base_url.rstrip("/")
    if endpoint.endswith("/v1"):
        endpoint = endpoint[:-3]
    req = urllib.request.Request(f"{endpoint}/v1/models", method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    data = payload.get("data") or []
    if not data or not data[0].get("id"):
        raise RuntimeError("NO_ACTIVE_MODEL_AT_ENDPOINT")
    return str(data[0]["id"])


def build_native_dspy_lm_v1(
    *,
    dspy_module: Any = dspy,
    base_url: str | None = None,
    requested_model_id: str | None = None,
    timeout_s: float = 5.0,
) -> Any:
    """Build DSPy's native lm15 client for the model currently served by llama-server."""
    configured_base = (base_url or os.environ.get("DSPY_LM_API_BASE") or "http://127.0.0.1:8090").rstrip("/")
    if configured_base.endswith("/v1"):
        configured_base = configured_base[:-3]
    active_model = resolve_live_model_id_v1(base_url=configured_base, timeout_s=timeout_s)
    configured_model = (requested_model_id or os.environ.get("DSPY_LM_MODEL") or "").strip()
    if configured_model.startswith("openai/"):
        configured_model = configured_model.removeprefix("openai/")
    if configured_model and configured_model != active_model:
        raise RuntimeError("DSPY_CONFIGURED_MODEL_NOT_AVAILABLE")
    return dspy_module.LM(
        model=f"openai/{active_model}",
        api_base=f"{configured_base}/v1",
        api_key=os.environ.get("DSPY_LM_API_KEY") or "local-llama",
        engine="lm15",
        max_tokens=1024,
        temperature=0.0,
    )


def run_dspy_predict_ace_recommender_v1(
    *,
    task_query: str,
    context_manifest: Mapping[str, Any],
    records: Sequence[dict[str, Any]] | None = None,
    scoped_readback: ScopedAceReadbackV1 | None = None,
    lm: Any | None = None,
    base_url: str = "http://127.0.0.1:8090",
    max_chunks: int = 4,
    model_revision: str | None = None,
    program_revision: str = "atlas.doc14-dspy-predict-ace.v1",
    token_counter: Any | None = None,
) -> dict[str, Any]:
    """Run Predict only through the checksum-validated ContextManifestV2 owner.

    A caller-supplied ``canonicalized`` boolean and arbitrary ``chunks`` are not
    admission evidence. Only the lookup key crosses from the supplied manifest
    into the server-owned readback. The strict recommender rejoins the rows
    against the manifest returned by that owner.
    """
    def reject(status: str) -> dict[str, Any]:
        return {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": status,
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    if context_manifest.get("schema") != "atlas.context-manifest.v2":
        return {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "REJECTED_RAW_CONTEXT",
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    if records is not None:
        return reject("ACE_CALLER_READBACK_ROWS_FORBIDDEN")
    if scoped_readback is None:
        return reject("ACE_VERIFIED_READBACK_ROWS_REQUIRED")
    checksum = context_manifest.get("identityChecksum")
    if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
        return reject("ACE_CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
    readback = scoped_readback(checksum)
    if readback is None:
        return reject("CANONICAL_ADMISSION_UNVERIFIED")
    context_manifest, records = readback
    if not records or context_manifest.get("identityChecksum") != checksum:
        return reject("ACE_CONTEXT_READBACK_MISMATCH")
    if not callable(token_counter):
        return {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "MODEL_TOKEN_COUNTER_REQUIRED",
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    v1 = context_manifest.get("v1")
    selected = v1.get("selectedNodeKeys") if isinstance(v1, Mapping) else None
    if not isinstance(selected, list) or len(selected) > max_chunks:
        return {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "ACE_CONTEXT_CHUNK_LIMIT_EXCEEDED",
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    if not model_revision:
        return reject("MODEL_REVISION_REQUIRED_FOR_INJECTED_LM" if lm is not None else "MODEL_REVISION_REQUIRED")
    def resolve_model():
        return build_native_dspy_lm_v1(base_url=base_url, requested_model_id=model_revision)

    try:
        return run_bounded_dspy_recommendation_with_ace_manifest_v1(
            question=task_query,
            records=records,
            context_manifest=context_manifest,
            model_revision=model_revision,
            program_revision=program_revision,
            token_counter=token_counter,
            lm=lm,
            lm_resolver=resolve_model if lm is None else None,
            max_context_tokens=None,
            max_evidence_bytes=32_000,
            max_output_chars=3_000,
        )
    except (TypeError, ValueError) as error:
        return {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "ACE_CONTEXT_REJECTED",
            "failure": str(error),
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }


def evaluate_gepa_offline_promotion_gate_v1(
    *,
    dataset_checksum: str,
    program_version: str,
    metric_version: str,
    train_count: int,
    held_out_count: int,
    before_held_out_score: float,
    after_held_out_score: float,
    approved_by: str | None = None,
) -> dict[str, Any]:
    reasons: list[str] = []
    if not dataset_checksum.startswith("sha256:"):
        reasons.append("MISSING_DATASET_CHECKSUM")
    if not program_version or not metric_version:
        reasons.append("MISSING_PROGRAM_OR_METRIC_VERSION")
    if train_count < 10 or held_out_count < 10:
        reasons.append("INSUFFICIENT_TRAIN_OR_HELD_OUT_SPLIT")
    if after_held_out_score <= before_held_out_score:
        reasons.append("NO_HELD_OUT_IMPROVEMENT")
    if not approved_by:
        reasons.append("AWAITING_INDEPENDENT_PROMOTION_APPROVAL")

    return {
        "schema": "atlas.gepa-offline-promotion-gate.v1",
        "datasetChecksum": dataset_checksum,
        "programVersion": program_version,
        "metricVersion": metric_version,
        "beforeHeldOutScore": before_held_out_score,
        "afterHeldOutScore": after_held_out_score,
        "delta": round(after_held_out_score - before_held_out_score, 6),
        "promotionAllowed": len(reasons) == 0,
        "reasons": reasons,
        "canPromoteOntologyRelations": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def build_bounded_rlm_tools_v1(context_manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Reject the legacy RLM scaffold until it can bind verified ACE readback rows.

    ContextManifestV2 contains identities and checksums, not the authorized chunk
    bodies required for RLM tools. A Boolean or attached ``chunks`` field is not
    sufficient evidence to expose retrieval tools to an interpreter.
    """
    if context_manifest.get("schema") != "atlas.context-manifest.v2":
        raise ValueError("ACE_CONTEXT_MANIFEST_V2_REQUIRED")
    raise ValueError("RLM_VERIFIED_ACE_READBACK_TOOL_BINDING_NOT_IMPLEMENTED")


def create_bounded_dspy_rlm_v1(
    *,
    context_manifest: Mapping[str, Any],
    max_iterations: int = 3,
    max_llm_calls: int = 4,
    max_output_chars: int = 2048,
) -> dict[str, Any]:
    """Instantiate a strictly bounded read-only dspy.RLM module over ContextManifest."""
    tools_bundle = build_bounded_rlm_tools_v1(context_manifest)
    bounded_iters = max(1, min(4, int(max_iterations)))
    bounded_calls = max(1, min(6, int(max_llm_calls)))
    bounded_chars = max(256, min(4096, int(max_output_chars)))

    rlm = dspy.RLM(
        AceGroundedRecommendationSignature,
        max_iters=bounded_iters,
        max_llm_calls=bounded_calls,
        max_output_chars=bounded_chars,
        tools=[tools_bundle["search_manifest_chunks"], tools_bundle["verify_utf8_span"]],
    )
    return {
        "rlm": rlm,
        "tools": tools_bundle,
        "budgets": {
            "maxIterations": bounded_iters,
            "maxLlmCalls": bounded_calls,
            "maxOutputChars": bounded_chars,
            "readOnlyToolsOnly": True,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def doc14_gepa_metric_v1(
    example: Any,
    prediction: Any,
    _trace: Any = None,
    _pred_name: Any = None,
    _pred_trace: Any = None,
) -> dspy.Prediction:
    """Offline GEPA metric returning score + textual feedback for citation & quote grounding."""
    cited_id = str(getattr(prediction, "cited_chunk_id", "") or "").strip()
    exact_quote = str(getattr(prediction, "exact_quote", "") or "").strip()
    recommendation = str(getattr(prediction, "recommendation", "") or "").strip()

    raw_manifest = getattr(example, "context_manifest_json", None)
    try:
        chunks = json.loads(raw_manifest) if isinstance(raw_manifest, str) else []
    except Exception:
        chunks = []

    chunk_by_id = {str(c.get("chunkId")): c for c in chunks if isinstance(c, dict) and c.get("chunkId")}
    if not recommendation:
        return dspy.Prediction(score=0.0, feedback="Recommendation is empty; provide a concise action.")
    if cited_id not in chunk_by_id:
        return dspy.Prediction(
            score=0.0,
            feedback=f"cited_chunk_id '{cited_id}' is not in context_manifest_json; pick an exact allowed chunkId.",
        )
    norm_q = exact_quote.replace("\r\n", "\n")
    norm_t = str(chunk_by_id[cited_id].get("text") or "").replace("\r\n", "\n")
    if not norm_q or norm_q not in norm_t:
        return dspy.Prediction(
            score=0.25,
            feedback="exact_quote did not match verbatim UTF-8 text in the cited chunk; copy an exact substring.",
        )
    return dspy.Prediction(score=1.0, feedback=None)
