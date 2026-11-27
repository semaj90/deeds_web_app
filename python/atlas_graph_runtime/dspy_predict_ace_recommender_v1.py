"""Task 3 & Task 5: Structured dspy.Predict Recommender over Bounded ACE Context + Offline GEPA Gate.

Per AGENTS.md:
  - Never pass raw search hits directly to the LLM; require a canonicalized ContextManifest.
  - Resolve the active model ID dynamically from :8090/v1/models (never hardcode a model name).
  - Verify cited chunk IDs and exact quote substrings against the bounded manifest.
  - Keep offline GEPA optimization separate from promotion approval and ontology truth.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from typing import Any, Callable, Mapping, Sequence

import dspy
from .doc14_bounded_rlm_recommender_v1 import (
    read_verified_source_span,
    run_bounded_dspy_recommendation_with_ace_manifest_v1,
    search_admitted_chunks,
    select_bounded_evidence_span_v1,
    validate_ace_context_readback_rows_v1,
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
        cache=False,
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


def build_bounded_rlm_tools_v1(
    context_manifest: Mapping[str, Any],
    *,
    scoped_readback: ScopedAceReadbackV1 | None = None,
    task_query: str | None = None,
    token_counter: Any | None = None,
    max_chunks: int = 4,
    max_tool_results: int = 4,
    max_span_bytes: int = 1200,
    max_tool_output_bytes: int = 8192,
) -> dict[str, Any]:
    """Build read-only RLM tools over rows returned by the scoped ACE owner.

    The request manifest supplies only the identity checksum. Chunk bodies must
    come from ``scoped_readback`` and pass the shared ContextManifest/row checks
    before either tool is exposed to DSPy's interpreter.
    """
    if context_manifest.get("schema") != "atlas.context-manifest.v2":
        raise ValueError("ACE_CONTEXT_MANIFEST_V2_REQUIRED")
    if scoped_readback is None:
        raise ValueError("ACE_VERIFIED_READBACK_ROWS_REQUIRED")
    if not 1 <= max_chunks <= 4 or not 1 <= max_tool_results <= 4:
        raise ValueError("INVALID_RLM_RESULT_BUDGET")
    if not 1 <= max_span_bytes <= 1200 or not 512 <= max_tool_output_bytes <= 8192:
        raise ValueError("INVALID_RLM_BYTE_BUDGET")

    checksum = context_manifest.get("identityChecksum")
    if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
        raise ValueError("ACE_CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
    readback = scoped_readback(checksum)
    if readback is None:
        raise ValueError("CANONICAL_ADMISSION_UNVERIFIED")
    owner_manifest, owner_rows = readback
    if not isinstance(owner_manifest, Mapping) or owner_manifest.get("identityChecksum") != checksum:
        raise ValueError("ACE_CONTEXT_READBACK_MISMATCH")
    manifest, records = validate_ace_context_readback_rows_v1(
        records=owner_rows,
        context_manifest=owner_manifest,
        max_chunks=max_chunks,
    )
    if manifest["identityChecksum"] != checksum:
        raise ValueError("ACE_CONTEXT_READBACK_MISMATCH")
    if not isinstance(task_query, str) or not task_query.strip() or task_query.strip() != str(manifest["v1"].get("query") or "").strip():
        raise ValueError("ACE_CONTEXT_QUERY_MISMATCH")
    if not callable(token_counter):
        raise ValueError("MODEL_TOKEN_COUNTER_REQUIRED")

    context_manifest_json = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    token_budget = int(manifest["v1"]["tokenBudget"])
    used_tokens = token_counter(task_query + "\n" + context_manifest_json)
    if not isinstance(used_tokens, int) or isinstance(used_tokens, bool) or used_tokens < 0:
        raise ValueError("MODEL_TOKEN_COUNTER_INVALID")
    if used_tokens > token_budget:
        raise ValueError("ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED")
    token_state = {"used": used_tokens}

    records_by_id = {str(row["chunkId"]): row for row in records}
    readback_rows_checksum = hashlib.sha256(
        json.dumps(
            {"manifest": manifest, "records": records},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()

    def encode_tool_result(value: Mapping[str, Any]) -> str:
        nonlocal used_tokens
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if len(encoded.encode("utf-8")) > max_tool_output_bytes:
            raise ValueError("RLM_TOOL_OUTPUT_BUDGET_EXCEEDED")
        added_tokens = token_counter(encoded)
        if not isinstance(added_tokens, int) or isinstance(added_tokens, bool) or added_tokens < 0:
            raise ValueError("MODEL_TOKEN_COUNTER_INVALID")
        if used_tokens + added_tokens > token_budget:
            raise ValueError("ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED")
        used_tokens += added_tokens
        token_state["used"] = used_tokens
        return encoded

    def search_manifest_chunks(query: str, limit: int = 4) -> str:
        """Search only this admitted manifest and return byte-verified excerpts."""
        if not isinstance(query, str) or not query.strip() or len(query) > 512:
            raise ValueError("RLM_SEARCH_QUERY_INVALID")
        if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
            raise ValueError("RLM_SEARCH_LIMIT_INVALID")
        hits = search_admitted_chunks(records, query.strip(), limit=min(limit, max_tool_results))
        excerpts: list[dict[str, Any]] = []
        used_bytes = 0
        for hit in hits:
            row = records_by_id[str(hit["chunkId"])]
            start, end, expected = select_bounded_evidence_span_v1(
                str(row["text"]), query.strip(), max_span_bytes=max_span_bytes,
            )
            citation = read_verified_source_span(records_by_id, str(hit["chunkId"]), start, end, expected)
            used_bytes += len(expected.encode("utf-8"))
            if used_bytes > max_tool_output_bytes // 2:
                break
            excerpts.append({
                **citation,
                "manifestNodeKey": row["manifestNodeKey"],
                "evidenceRefs": row["evidenceRefs"],
                "chunkSha256": row["chunkSha256"],
                "score": hit["score"],
            })
        return encode_tool_result({"status": "OK", "results": excerpts})

    def verify_utf8_span(chunk_id: str, start_byte: int, end_byte: int, expected_text: str) -> str:
        """Verify a proposed span against the admitted chunk's exact UTF-8 bytes."""
        if not isinstance(chunk_id, str) or chunk_id not in records_by_id:
            raise ValueError("CHUNK_NOT_ADMITTED")
        if (isinstance(start_byte, bool) or not isinstance(start_byte, int)
                or isinstance(end_byte, bool) or not isinstance(end_byte, int)
                or start_byte < 0 or end_byte <= start_byte
                or end_byte - start_byte > max_span_bytes):
            raise ValueError("RLM_SPAN_BOUNDS_INVALID")
        if not isinstance(expected_text, str) or len(expected_text.encode("utf-8")) > max_span_bytes:
            raise ValueError("RLM_SPAN_TEXT_INVALID")
        citation = read_verified_source_span(records_by_id, chunk_id, start_byte, end_byte, expected_text)
        row = records_by_id[chunk_id]
        return encode_tool_result({
            **citation,
            "manifestNodeKey": row["manifestNodeKey"],
            "evidenceRefs": row["evidenceRefs"],
            "chunkSha256": row["chunkSha256"],
        })

    return {
        "search_manifest_chunks": search_manifest_chunks,
        "verify_utf8_span": verify_utf8_span,
        "context_manifest": manifest,
        "records": records,
        "readbackRowsChecksum": readback_rows_checksum,
        "tokenBudget": token_budget,
        "initialTokens": used_tokens,
        "tokenState": token_state,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def create_bounded_dspy_rlm_v1(
    *,
    task_query: str | None = None,
    context_manifest: Mapping[str, Any],
    scoped_readback: ScopedAceReadbackV1 | None = None,
    token_counter: Any | None = None,
    max_iterations: int = 3,
    max_llm_calls: int = 4,
    max_output_chars: int = 2048,
    max_chunks: int = 4,
) -> dict[str, Any]:
    """Instantiate a bounded DSPy RLM after scoped ACE rows pass readback checks."""
    if not 1 <= max_iterations <= 4 or not 1 <= max_llm_calls <= 6 or not 256 <= max_output_chars <= 4096:
        raise ValueError("INVALID_RLM_BUDGET")
    tools_bundle = build_bounded_rlm_tools_v1(
        context_manifest,
        scoped_readback=scoped_readback,
        task_query=task_query,
        token_counter=token_counter,
        max_chunks=max_chunks,
    )
    rlm = dspy.RLM(
        AceGroundedRecommendationSignature,
        max_iters=max_iterations,
        max_llm_calls=max_llm_calls,
        max_output_chars=max_output_chars,
        tools=[tools_bundle["search_manifest_chunks"], tools_bundle["verify_utf8_span"]],
    )
    return {
        "rlm": rlm,
        "tools": tools_bundle,
        "contextManifestJson": json.dumps(tools_bundle["context_manifest"], sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        "budgets": {
            "maxIterations": max_iterations,
            "maxSubLlmCalls": max_llm_calls,
            "maxOutputChars": max_output_chars,
            "maxChunks": max_chunks,
            "maxEvidenceTokens": tools_bundle["tokenBudget"],
            "initialEvidenceTokens": tools_bundle["initialTokens"],
            "maxToolOutputBytes": 8192,
            "readOnlyToolsOnly": True,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def run_bounded_dspy_rlm_v1(
    *,
    runtime: Mapping[str, Any],
    task_query: str,
    lm: Any | None = None,
    base_url: str = "http://127.0.0.1:8090",
    model_revision: str | None = None,
    max_output_chars: int = 2048,
) -> dict[str, Any]:
    """Run the bounded RLM and accept only a citation replayed against its readback rows."""
    def refuse(reason: str) -> dict[str, Any]:
        return {
            "schema": "atlas.dspy-rlm-ace-recommendation.v1",
            "status": "REFUSED",
            "reason": reason,
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    tools = runtime.get("tools")
    if not isinstance(tools, Mapping) or runtime.get("rlm") is None:
        return refuse("BOUNDED_RLM_RUNTIME_REQUIRED")
    manifest = tools.get("context_manifest")
    records = tools.get("records")
    if not isinstance(manifest, Mapping) or not isinstance(records, list):
        return refuse("ACE_VERIFIED_READBACK_ROWS_REQUIRED")
    if not isinstance(task_query, str) or not task_query.strip():
        return refuse("TASK_QUERY_REQUIRED")
    v1 = manifest.get("v1")
    if not isinstance(v1, Mapping) or task_query.strip() != str(v1.get("query") or "").strip():
        return refuse("ACE_CONTEXT_QUERY_MISMATCH")
    try:
        validated_manifest, validated_records = validate_ace_context_readback_rows_v1(
            records=records,
            context_manifest=manifest,
            max_chunks=int((runtime.get("budgets") or {}).get("maxChunks", 4)),
        )
        current_rows_checksum = hashlib.sha256(
            json.dumps(
                {"manifest": validated_manifest, "records": validated_records},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        ).hexdigest()
        if current_rows_checksum != tools.get("readbackRowsChecksum"):
            return refuse("ACE_VERIFIED_READBACK_MUTATED")
    except Exception:
        return refuse("ACE_VERIFIED_READBACK_INVALID")
    if not 1 <= max_output_chars <= 4096:
        return refuse("INVALID_RLM_OUTPUT_BUDGET")

    active_lm = lm
    active_model_id = model_revision
    try:
        if active_lm is None:
            active_model_id = resolve_live_model_id_v1(base_url=base_url)
            active_lm = build_native_dspy_lm_v1(base_url=base_url, requested_model_id=active_model_id)
        if not active_model_id:
            return refuse("MODEL_REVISION_REQUIRED_FOR_INJECTED_LM")
        with dspy.context(lm=active_lm):
            prediction = runtime["rlm"](
                task_query=task_query,
                context_manifest_json=runtime.get("contextManifestJson", ""),
            )
        get_value = lambda name: prediction.get(name) if isinstance(prediction, Mapping) else getattr(prediction, name, None)
        recommendation = get_value("recommendation")
        cited_chunk_id = get_value("cited_chunk_id")
        exact_quote = get_value("exact_quote")
        if (not isinstance(recommendation, str) or not recommendation.strip()
                or not isinstance(cited_chunk_id, str) or not isinstance(exact_quote, str)
                or len(recommendation) + len(exact_quote) > max_output_chars
                or not exact_quote or len(exact_quote.encode("utf-8")) > 1200):
            return refuse("RLM_OUTPUT_INVALID_OR_OVER_BUDGET")
        by_chunk = {str(row["chunkId"]): row for row in records}
        row = by_chunk.get(cited_chunk_id)
        if row is None:
            return refuse("RLM_CITATION_OUTSIDE_ADMITTED_CONTEXT")
        char_start = str(row["text"]).find(exact_quote)
        if char_start < 0:
            return refuse("RLM_QUOTE_NOT_IN_ADMITTED_CHUNK")
        start_byte = len(str(row["text"])[:char_start].encode("utf-8"))
        end_byte = start_byte + len(exact_quote.encode("utf-8"))
        citation = read_verified_source_span(by_chunk, cited_chunk_id, start_byte, end_byte, exact_quote)
        evidence = {"recommendation": recommendation.strip(), "citation": citation}
        receipt = {
            "schema": "atlas.dspy-rlm-ace-recommendation.v1",
            "status": "CITATION_VERIFIED",
            "taskQuery": task_query,
            "modelId": active_model_id,
            "contextManifestChecksum": manifest["identityChecksum"],
            "evidenceTokensUsed": (tools.get("tokenState") or {}).get("used"),
            "recommendation": recommendation.strip(),
            "citation": citation,
            "budgets": dict(runtime.get("budgets") or {}),
            "citationVerified": True,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        receipt["receiptChecksum"] = "sha256:" + hashlib.sha256(
            json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        return receipt
    except Exception as error:
        # Keep model/interpreter exception text out of the receipt; it may contain prompts or private traces.
        return refuse(f"RLM_EXECUTION_FAILED:{type(error).__name__}")


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
