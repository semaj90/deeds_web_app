"""Bounded read-only API & codebase recommender for DOC-14.

Enforces explicit iteration, model-call, result-count, and output-byte budgets
(`max_iters=6`, `max_llm_calls=8`, `max_output_chars=3000`) and exposes only
authorized read-only tools (`search_admitted_chunks`, `read_verified_source_span`)
backed by PostgreSQL-PROVEN chunks (`docs/reports/doc14-admitted-chunks.jsonl`).
Every cited source span is independently verified against exact UTF-8 bytes.
The default path is deterministic retrieval with a template answer; optional DSPy
Predict synthesis is a separate, explicit path. This module does not execute RLM.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import struct
import unicodedata
import urllib.request
from pathlib import Path
from contextlib import nullcontext
from typing import Any, Callable, Mapping, Sequence, TypedDict

from .api_document_fact_v1 import verify_source_span

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_./-]{3,}")


class Doc14SupportingClaimV1(TypedDict):
    claim: str
    chunkId: str
    quote: str


def _canonical_encode_v1(value: Any) -> str:
    """Python implementation of the Atlas canonical scalar/object encoding."""
    if value is None:
        return "n;"
    if isinstance(value, bool):
        return "b1;" if value else "b0;"
    if isinstance(value, str):
        normalized = unicodedata.normalize("NFC", value)
        return f"s{len(normalized.encode('utf-8'))}:{normalized};"
    if isinstance(value, (int, float)):
        number = float(value)
        if number == 0:
            number = 0.0
        if not math.isfinite(number):
            raise ValueError("ACE_MANIFEST_CANONICAL_NUMBER_INVALID")
        return f"f{struct.pack('>d', number).hex()};"
    if isinstance(value, (list, tuple)):
        return f"a{len(value)}[{''.join(_canonical_encode_v1(item) for item in value)}]"
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for raw_key, item in value.items():
            if not isinstance(raw_key, str):
                raise ValueError("ACE_MANIFEST_CANONICAL_KEY_INVALID")
            key = unicodedata.normalize("NFC", raw_key)
            if key in normalized:
                raise ValueError("ACE_MANIFEST_CANONICAL_KEY_COLLISION")
            normalized[key] = item
        keys = sorted(normalized)
        body = "".join(
            f"k{len(key.encode('utf-8'))}:{key};{_canonical_encode_v1(normalized[key])}"
            for key in keys
        )
        return f"o{len(keys)}{{{body}}}"
    raise ValueError("ACE_MANIFEST_CANONICAL_TYPE_INVALID")


def _canonical_sha256_v1(value: Any) -> str:
    return hashlib.sha256(_canonical_encode_v1(value).encode("utf-8")).hexdigest()


def _validate_context_manifest_v2(manifest: Mapping[str, Any]) -> dict[str, Any]:
    if manifest.get("schema") != "atlas.context-manifest.v2":
        raise ValueError("ACE_CONTEXT_MANIFEST_V2_REQUIRED")
    v1 = manifest.get("v1")
    identity = manifest.get("identityInput")
    if not isinstance(v1, Mapping) or not isinstance(identity, Mapping):
        raise ValueError("ACE_CONTEXT_MANIFEST_IDENTITY_REQUIRED")
    for key in ("schema", "requestId", "snapshotId", "query", "candidateBucket", "candidateCount", "tokenBudget", "selectedNodeKeys", "evidenceRefs", "producerRevision"):
        if key not in v1:
            raise ValueError(f"ACE_CONTEXT_MANIFEST_FIELD_REQUIRED:{key}")
    selected_nodes, evidence_refs = v1["selectedNodeKeys"], v1["evidenceRefs"]
    if (
        v1["schema"] != "atlas.context-manifest.v1"
        or not isinstance(v1["requestId"], str) or not v1["requestId"]
        or not isinstance(v1["snapshotId"], str) or not v1["snapshotId"]
        or not isinstance(v1["query"], str)
        or not isinstance(v1["producerRevision"], str) or not v1["producerRevision"]
        or ("graphRevision" in v1 and v1["graphRevision"] is not None and (not isinstance(v1["graphRevision"], str) or not v1["graphRevision"]))
        or not isinstance(v1["candidateBucket"], int) or isinstance(v1["candidateBucket"], bool) or v1["candidateBucket"] < 1
        or not isinstance(selected_nodes, list)
        or any(not isinstance(item, str) or not item for item in selected_nodes)
        or len(set(selected_nodes)) != len(selected_nodes)
        or not isinstance(evidence_refs, list)
        or any(not isinstance(item, str) or not item for item in evidence_refs)
        or len(set(evidence_refs)) != len(evidence_refs)
        or not isinstance(v1["tokenBudget"], int)
        or isinstance(v1["tokenBudget"], bool)
        or v1["tokenBudget"] <= 0
        or not isinstance(v1["candidateCount"], int)
        or isinstance(v1["candidateCount"], bool)
        or v1["candidateCount"] < 0
        or v1["candidateCount"] != len(selected_nodes)
    ):
        raise ValueError("ACE_CONTEXT_MANIFEST_ALLOWLIST_INVALID")
    identity_keys = {
        "selectedOrdinalSetChecksum", "evidenceRevisions", "ordinalMapChecksum",
        "retrievalPolicyRevision", "acePlaybookRevision",
    }
    if not identity_keys.issubset(identity) or set(identity) - identity_keys - {"orderedSelectionChecksum"}:
        raise ValueError("ACE_CONTEXT_MANIFEST_IDENTITY_SHAPE_INVALID")
    revisions = identity.get("evidenceRevisions")
    revision_keys = {
        "sourceRevision", "representationRevision", "featureRevision",
        "ontologyRevision", "modelRevision", "promptTemplateRevision",
    }
    if (
        not isinstance(revisions, Mapping)
        or set(revisions) != revision_keys
        or any(value is not None and (not isinstance(value, str) or not value) for value in revisions.values())
        or not isinstance(identity.get("selectedOrdinalSetChecksum"), str)
        or not identity["selectedOrdinalSetChecksum"]
        or not isinstance(identity.get("ordinalMapChecksum"), str)
        or not identity["ordinalMapChecksum"]
        or not isinstance(identity.get("retrievalPolicyRevision"), str)
        or not identity["retrievalPolicyRevision"]
        or not isinstance(identity.get("acePlaybookRevision"), str)
        or not identity["acePlaybookRevision"]
        or ("orderedSelectionChecksum" in identity and (not isinstance(identity["orderedSelectionChecksum"], str) or not identity["orderedSelectionChecksum"]))
    ):
        raise ValueError("ACE_CONTEXT_MANIFEST_SOURCE_REVISION_REQUIRED")
    payload = {
        "schema": "atlas.context-manifest-v2-identity.v1",
        "v1RequestId": v1["requestId"],
        "v1SnapshotId": v1["snapshotId"],
        "v1CandidateBucket": v1["candidateBucket"],
        **dict(identity),
    }
    checksum = _canonical_sha256_v1(payload)
    if manifest.get("identityChecksum") != checksum:
        raise ValueError("ACE_CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
    return {"v1": dict(v1), "identityInput": dict(identity), "identityChecksum": checksum}


def search_admitted_chunks(
    records: Sequence[dict[str, Any]],
    query: str,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Bounded read-only search over PostgreSQL-PROVEN chunks."""
    capped_limit = max(1, min(10, int(limit)))
    q_tokens = {t.lower() for t in _TOKEN_RE.findall(query)}
    scored: list[tuple[int, dict[str, Any]]] = []
    for rec in records:
        if rec.get("pgReadbackStatus") != "PROVEN" or rec.get("admissionStatus") != "INDEX_ELIGIBLE":
            continue
        haystack = f"{rec.get('sourceRef', '')} {rec.get('text', '')}".lower()
        hits = sum(1 for t in q_tokens if t in haystack)
        if hits > 0:
            scored.append((hits, rec))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("chunkId", ""))))
    return [
        {
            "chunkId": r["chunkId"],
            "sourceRef": r["sourceRef"],
            "sourceRevision": r["sourceRevision"],
            "chunkSha256": r["chunkSha256"],
            "score": s,
        }
        for s, r in scored[:capped_limit]
    ]


def read_verified_source_span(
    records_by_id: dict[str, dict[str, Any]],
    chunk_id: str,
    start_byte: int,
    end_byte: int,
    expected_text: str,
) -> dict[str, Any]:
    """Read and independently verify an exact UTF-8 byte span from a PROVEN chunk."""
    rec = records_by_id.get(chunk_id)
    if rec is None:
        raise ValueError(f"CHUNK_NOT_ADMITTED:{chunk_id}")
    raw = str(rec["text"]).encode("utf-8")
    if hashlib.sha256(raw).hexdigest() != rec.get("chunkSha256"):
        raise ValueError(f"CHUNK_SHA256_MISMATCH:{chunk_id}")
    if not verify_source_span(raw, start_byte, end_byte, expected_text):
        raise ValueError(f"SOURCE_SPAN_VERIFICATION_FAILED:{chunk_id}")
    return {
        "chunkId": chunk_id,
        "sourceRef": rec["sourceRef"],
        "sourceRevision": rec["sourceRevision"],
        "startByte": start_byte,
        "endByte": end_byte,
        "verifiedText": expected_text,
    }


def select_bounded_evidence_span_v1(
    text: str,
    query: str,
    *,
    max_span_bytes: int = 1200,
) -> tuple[int, int, str]:
    """Select a useful, source-exact context window instead of citing one token."""
    if not isinstance(text, str) or max_span_bytes < 1:
        raise ValueError("INVALID_EVIDENCE_SPAN_INPUT")
    raw = text.encode("utf-8")
    if len(raw) <= max_span_bytes:
        return 0, len(raw), text

    query_tokens = [token.lower() for token in _TOKEN_RE.findall(query) if len(token) >= 4]
    lines = text.splitlines(keepends=True)
    if not lines:
        return 0, 0, ""

    line_scores = [
        sum(1 for token in set(query_tokens) if token in line.lower())
        for line in lines
    ]
    anchor = max(range(len(lines)), key=lambda index: (line_scores[index], -index))
    left = max(0, anchor - 2)
    right = min(len(lines), anchor + 4)
    while left < right:
        selected = "".join(lines[left:right])
        if len(selected.encode("utf-8")) <= max_span_bytes:
            start_byte = len("".join(lines[:left]).encode("utf-8"))
            return start_byte, start_byte + len(selected.encode("utf-8")), selected
        if anchor - left > right - anchor - 1:
            left += 1
        elif right - anchor > 1:
            right -= 1
        else:
            break

    # A single unusually long source line can exceed the byte cap. Slice by
    # Unicode characters around the strongest matching token; then calculate
    # coordinates from encoded prefixes so every returned offset is UTF-8 exact.
    token_match = next(
        (match for token in sorted(set(query_tokens), key=lambda value: (-len(value), value))
         if (match := re.search(re.escape(token), text, re.IGNORECASE))),
        None,
    )
    anchor_char = token_match.start() if token_match else 0
    char_budget = max(1, max_span_bytes // 4)
    start_char = max(0, anchor_char - char_budget // 2)
    end_char = min(len(text), start_char + char_budget)
    start_char = max(0, end_char - char_budget)
    selected = text[start_char:end_char]
    while len(selected.encode("utf-8")) > max_span_bytes and end_char > start_char:
        end_char -= 1
        selected = text[start_char:end_char]
    start_byte = len(text[:start_char].encode("utf-8"))
    return start_byte, start_byte + len(selected.encode("utf-8")), selected


def run_bounded_rlm_recommendation_v1(
    *,
    question: str,
    records: Sequence[dict[str, Any]],
    max_iters: int = 6,
    max_llm_calls: int = 8,
    max_output_chars: int = 3000,
    synthesizer: Callable[[str, list[dict[str, Any]]], Any] | None = None,
) -> dict[str, Any]:
    """Run bounded read-only retrieval/synthesis with independent span verification.

    Historical function name retained for caller compatibility. The retrieval
    loop is not DSPy RLM; DSPy Predict is available through the optional
    ``make_dspy_predict_synthesizer_v1`` adapter below.
    """
    if max_iters < 1 or max_llm_calls < 1 or max_output_chars < 64:
        raise ValueError("INVALID_RLM_BUDGET")

    by_id = {str(r["chunkId"]): r for r in records}
    hits = search_admitted_chunks(records, question, limit=5)
    if not hits:
        return {
            "schema": "atlas.doc14-rlm-recommendation.v1",
            "status": "NO_ADMITTED_EVIDENCE",
            "question": question,
            "answer": None,
            "citations": [],
            "itersUsed": 1,
            "llmCallsUsed": 0,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    verified_citations: list[dict[str, Any]] = []
    iters_used = 0
    for hit in hits:
        if iters_used >= max_iters:
            break
        iters_used += 1
        rec = by_id[hit["chunkId"]]
        raw = str(rec["text"]).encode("utf-8")
        matched_span = select_bounded_evidence_span_v1(str(rec["text"]), question)

        verified = read_verified_source_span(
            by_id,
            hit["chunkId"],
            matched_span[0],
            matched_span[1],
            matched_span[2],
        )
        verified_citations.append(verified)
        if len(verified_citations) >= 3:
            break

    llm_calls_used = 0
    synthesis_provenance: dict[str, Any] = {"engine": "DETERMINISTIC_TEMPLATE"}
    selected_citations = verified_citations
    if synthesizer is not None and llm_calls_used < max_llm_calls:
        llm_calls_used += 1
        synthesized = synthesizer(question, verified_citations)
        if isinstance(synthesized, dict):
            raw_answer = str(synthesized.get("answer") or "").strip()
            cited_ids = synthesized.get("supportingChunkIds")
            if not isinstance(cited_ids, list) or not cited_ids:
                raise ValueError("SYNTHESIS_SUPPORTING_CHUNK_IDS_REQUIRED")
            normalized_ids = [str(value) for value in cited_ids]
            allowed_ids = {str(citation["chunkId"]) for citation in verified_citations}
            if len(set(normalized_ids)) != len(normalized_ids) or any(value not in allowed_ids for value in normalized_ids):
                raise ValueError("SYNTHESIS_CITATION_OUTSIDE_VERIFIED_CONTEXT")
            selected_citations = [citation for citation in verified_citations if citation["chunkId"] in set(normalized_ids)]
            synthesis_provenance = dict(getattr(synthesizer, "provenance", {"engine": "CUSTOM_STRUCTURED_SYNTHESIZER"}))
            synthesis_provenance["supportingChunkIds"] = normalized_ids
            claim_evidence = synthesized.get("claimEvidence")
            if synthesis_provenance.get("engine") == "DSPY_PREDICT":
                if not isinstance(claim_evidence, list) or not claim_evidence or len(claim_evidence) > 12:
                    raise ValueError("DSPY_CLAIM_EVIDENCE_REQUIRED")
                allowed_citations = {str(citation["chunkId"]): citation for citation in verified_citations}
                for item in claim_evidence:
                    if not isinstance(item, dict):
                        raise ValueError("DSPY_CLAIM_EVIDENCE_INVALID")
                    chunk_id = item.get("chunkId")
                    claim = item.get("claim")
                    quote = item.get("quote")
                    if (
                        not isinstance(chunk_id, str) or chunk_id not in allowed_citations
                        or not isinstance(claim, str) or not claim.strip()
                        or not isinstance(quote, str) or not quote
                    ):
                        raise ValueError("DSPY_CLAIM_EVIDENCE_INVALID")
                    citation = allowed_citations[chunk_id]
                    quote_position = citation["verifiedText"].find(quote)
                    if quote_position < 0:
                        raise ValueError("DSPY_CLAIM_QUOTE_NOT_IN_VERIFIED_CONTEXT")
                    quote_start = citation["startByte"] + len(citation["verifiedText"][:quote_position].encode("utf-8"))
                    quote_end = quote_start + len(quote.encode("utf-8"))
                    if (
                        item.get("sourceRef") != citation["sourceRef"]
                        or item.get("sourceRevision") != citation["sourceRevision"]
                        or item.get("startByte") != quote_start
                        or item.get("endByte") != quote_end
                    ):
                        raise ValueError("DSPY_CLAIM_QUOTE_BINDING_MISMATCH")
                if raw_answer != " ".join(item["claim"].strip() for item in claim_evidence):
                    raise ValueError("DSPY_ANSWER_CLAIMS_MISMATCH")
                synthesis_provenance["claimEvidence"] = claim_evidence
                synthesis_provenance["claimSupportStatus"] = "EXACT_QUOTE_MATCH_REVIEW_REQUIRED"
        else:
            raw_answer = str(synthesized)
            synthesis_provenance = dict(getattr(synthesizer, "provenance", {"engine": "CUSTOM_SYNTHESIZER"}))
    else:
        refs = ", ".join(f"{c['sourceRef']} [{c['startByte']}:{c['endByte']}]" for c in verified_citations)
        raw_answer = f"Verified admitted evidence for '{question}': {refs}"

    bounded_answer = raw_answer[:max_output_chars]
    receipt = {
        "schema": "atlas.doc14-rlm-recommendation.v1",
        "status": "VERIFIED_CITATIONS_READY",
        "question": question,
        "answer": bounded_answer,
        "citations": selected_citations,
        "synthesis": synthesis_provenance,
        "budgets": {
            "maxIters": max_iters,
            "maxLlmCalls": max_llm_calls,
            "maxOutputChars": max_output_chars,
        },
        "itersUsed": iters_used,
        "llmCallsUsed": llm_calls_used,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("utf-8")
    receipt["receiptChecksum"] = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    return receipt


def make_dspy_predict_synthesizer_v1(
    *,
    lm: Any = None,
    lm_resolver: Callable[[], Any] | None = None,
    dspy_module: Any = None,
    model_revision: str,
    program_revision: str,
    max_evidence_bytes: int = 32_000,
    max_output_chars: int = 3_000,
) -> Callable[[str, list[dict[str, Any]]], dict[str, Any]]:
    """Build an actual, single-call DSPy Predict adapter over verified evidence.

    DSPy is imported lazily so the deterministic/caller-injected path does not
    acquire a mandatory dependency. The predictor has no tools or interpreter.
    Its chunk selections are allowlisted against the exact verified citations.
    """
    if dspy_module is None:
        try:
            import dspy as dspy_module  # type: ignore[no-redef]
        except ImportError as exc:
            raise RuntimeError("DSPY_DEPENDENCY_UNAVAILABLE") from exc
    if not model_revision.strip() or not program_revision.strip():
        raise ValueError("DSPY_MODEL_AND_PROGRAM_REVISIONS_REQUIRED")
    if max_evidence_bytes < 256 or max_output_chars < 64:
        raise ValueError("DSPY_PREDICT_BUDGET_INVALID")

    class Doc14RecommendationSignature(dspy_module.Signature):
        """Return only concise, atomic claims grounded in supplied verified spans.

        Do not include private reasoning or analysis. supporting_claims must
        contain objects with exactly claim, chunkId, and quote fields.
        Each quote must be copied exactly from that chunk's verifiedText. The
        answer must equal the claim strings joined by one space. Select only
        chunk IDs present in the supplied evidence. If evidence is insufficient,
        do not invent a quote or claim.
        """

        question: str = dspy_module.InputField()
        verified_evidence_json: str = dspy_module.InputField()
        answer: str = dspy_module.OutputField()

        supporting_claims: list[Doc14SupportingClaimV1] = dspy_module.OutputField()

    predictor = dspy_module.Predict(Doc14RecommendationSignature)

    def synthesize(question: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
        evidence_json = json.dumps(
            [
                {
                    "chunkId": c["chunkId"],
                    "sourceRef": c["sourceRef"],
                    "sourceRevision": c["sourceRevision"],
                    "startByte": c["startByte"],
                    "endByte": c["endByte"],
                    "verifiedText": c["verifiedText"],
                }
                for c in citations
            ],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        if len(evidence_json.encode("utf-8")) > max_evidence_bytes:
            raise ValueError("DSPY_EVIDENCE_BYTE_BUDGET_EXCEEDED")
        active_lm = lm
        if active_lm is None:
            if lm_resolver is None:
                # Reuse the existing live ACE model-discovery owner. Import
                # lazily so deterministic and injected paths need no DSPy.
                try:
                    from .dspy_predict_ace_recommender_v1 import build_native_dspy_lm_v1
                except ImportError as exc:
                    raise RuntimeError("DSPY_NATIVE_LM_RESOLVER_UNAVAILABLE") from exc
                active_lm = build_native_dspy_lm_v1(dspy_module=dspy_module)
            else:
                active_lm = lm_resolver()
            if active_lm is None:
                raise RuntimeError("DSPY_NATIVE_LM_RESOLUTION_EMPTY")
        context_options: dict[str, Any] = {"lm": active_lm}
        json_adapter = getattr(dspy_module, "JSONAdapter", None)
        if callable(json_adapter):
            try:
                context_options["adapter"] = json_adapter(use_native_function_calling=False)
            except TypeError:
                context_options["adapter"] = json_adapter()
        context = dspy_module.context(**context_options) if context_options else nullcontext()
        with context:
            prediction = predictor(question=question, verified_evidence_json=evidence_json)
        answer = str(getattr(prediction, "answer", "")).strip()
        claims_value = getattr(prediction, "supporting_claims", None)
        if not answer or len(answer) > max_output_chars:
            raise ValueError("DSPY_ANSWER_INVALID_OR_OVER_BUDGET")
        if not isinstance(claims_value, list) or len(claims_value) > 12:
            raise ValueError("DSPY_SUPPORTING_CLAIMS_REQUIRED")
        claims = [dict(item) if isinstance(item, Mapping) else item for item in claims_value]
        claims_bytes = len(json.dumps(claims, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        if claims_bytes > max_output_chars * 2:
            raise ValueError("DSPY_SUPPORTING_CLAIMS_OVER_BUDGET")
        if not claims:
            raise ValueError("DSPY_SUPPORTING_CLAIMS_INVALID_SHAPE")
        allowed = {str(c["chunkId"]): c for c in citations}
        normalized_claims: list[dict[str, str]] = []
        for item in claims:
            if not isinstance(item, dict):
                raise ValueError("DSPY_SUPPORTING_CLAIM_INVALID")
            if set(item) != {"claim", "chunkId", "quote"}:
                raise ValueError("DSPY_SUPPORTING_CLAIM_FIELDS_INVALID")
            claim = item.get("claim")
            chunk_id = item.get("chunkId")
            quote = item.get("quote")
            if (
                not isinstance(claim, str) or not claim.strip() or len(claim) > 1000
                or not isinstance(chunk_id, str) or chunk_id not in allowed
                or not isinstance(quote, str) or not quote or len(quote.encode("utf-8")) > 1200
                or quote not in allowed[chunk_id]["verifiedText"]
            ):
                raise ValueError("DSPY_CLAIM_QUOTE_NOT_IN_VERIFIED_CONTEXT")
            citation = allowed[chunk_id]
            quote_start = citation["verifiedText"].index(quote)
            quote_start_byte = citation["startByte"] + len(citation["verifiedText"][:quote_start].encode("utf-8"))
            quote_end_byte = quote_start_byte + len(quote.encode("utf-8"))
            normalized_claims.append({
                "claim": claim.strip(),
                "chunkId": chunk_id,
                "quote": quote,
                "sourceRef": citation["sourceRef"],
                "sourceRevision": citation["sourceRevision"],
                "startByte": quote_start_byte,
                "endByte": quote_end_byte,
            })
        claim_answer = " ".join(item["claim"] for item in normalized_claims)
        if answer != claim_answer or len(claim_answer) > max_output_chars:
            raise ValueError("DSPY_ANSWER_CLAIMS_MISMATCH")
        normalized_ids = list(dict.fromkeys(item["chunkId"] for item in normalized_claims))
        return {
            "answer": claim_answer,
            "supportingChunkIds": normalized_ids,
            "claimEvidence": normalized_claims,
        }

    synthesize.provenance = {
        "engine": "DSPY_PREDICT",
        "modelRevision": model_revision,
        "programRevision": program_revision,
        "maxEvidenceBytes": max_evidence_bytes,
        "maxOutputChars": max_output_chars,
        "toolCount": 0,
    }
    return synthesize


def run_bounded_dspy_recommendation_with_ace_manifest_v1(
    *,
    question: str,
    records: Sequence[dict[str, Any]],
    context_manifest: Mapping[str, Any],
    model_revision: str,
    program_revision: str,
    token_counter: Callable[[str], int],
    dspy_module: Any = None,
    lm: Any = None,
    lm_resolver: Callable[[], Any] | None = None,
    max_context_tokens: int | None = None,
    max_evidence_bytes: int = 32_000,
    max_output_chars: int = 3_000,
) -> dict[str, Any]:
    """Run DSPy Predict only over the exact selected rows of a validated ACE manifest.

    `manifestNodeKey` and `evidenceRefs` are explicit bridge fields supplied by
    the server-side ContextManifest/evidence binding owner. This function does
    not retrieve, authorize, persist, or promote evidence.
    """
    manifest = _validate_context_manifest_v2(context_manifest)
    v1 = manifest["v1"]
    identity = manifest["identityInput"]
    if not isinstance(question, str) or question.strip() != str(v1.get("query") or "").strip():
        raise ValueError("ACE_CONTEXT_QUERY_MISMATCH")
    node_allowlist = set(v1["selectedNodeKeys"])
    evidence_allowlist = set(v1["evidenceRefs"])

    by_node: dict[str, dict[str, Any]] = {}
    chunk_ids: set[str] = set()
    for row in records:
        node_key = row.get("manifestNodeKey")
        if not isinstance(node_key, str) or node_key not in node_allowlist:
            raise ValueError("ACE_CONTEXT_ROW_OUTSIDE_SELECTION")
        if node_key in by_node:
            raise ValueError(f"ACE_CONTEXT_DUPLICATE_NODE_BINDING:{node_key}")
        chunk_id = row.get("chunkId")
        if not isinstance(chunk_id, str) or not chunk_id or chunk_id in chunk_ids:
            raise ValueError(f"ACE_CONTEXT_CHUNK_ID_INVALID_OR_DUPLICATE:{node_key}")
        chunk_ids.add(chunk_id)
        row_evidence = row.get("evidenceRefs")
        if not isinstance(row_evidence, list) or not row_evidence:
            raise ValueError(f"ACE_CONTEXT_EVIDENCE_BINDING_REQUIRED:{node_key}")
        if any(not isinstance(ref, str) or ref not in evidence_allowlist for ref in row_evidence):
            raise ValueError(f"ACE_CONTEXT_EVIDENCE_OUTSIDE_MANIFEST:{node_key}")
        if row.get("pgReadbackStatus") != "PROVEN" or row.get("admissionStatus") != "INDEX_ELIGIBLE":
            raise ValueError(f"ACE_CONTEXT_ROW_NOT_ADMITTED:{node_key}")
        text = row.get("text")
        if not isinstance(text, str) or hashlib.sha256(text.encode("utf-8")).hexdigest() != row.get("chunkSha256"):
            raise ValueError(f"ACE_CONTEXT_ROW_CHECKSUM_MISMATCH:{node_key}")
        source_revision = row.get("sourceRevision")
        if not isinstance(source_revision, str) or not source_revision:
            raise ValueError(f"ACE_CONTEXT_SOURCE_REVISION_REQUIRED:{node_key}")
        by_node[node_key] = dict(row)

    if set(by_node) != node_allowlist:
        raise ValueError("ACE_CONTEXT_SELECTED_NODE_BINDING_INCOMPLETE")
    observed_refs = {ref for row in by_node.values() for ref in row["evidenceRefs"]}
    if observed_refs != evidence_allowlist:
        raise ValueError("ACE_CONTEXT_EVIDENCE_SET_MISMATCH")
    source_revisions = sorted({str(row["sourceRevision"]) for row in by_node.values()})
    expected_source_revision_set = _canonical_sha256_v1({
        "schema": "atlas.ace-context-source-revision-set.v1",
        "revisions": source_revisions,
    })
    if identity["evidenceRevisions"]["sourceRevision"] != expected_source_revision_set:
        raise ValueError("ACE_CONTEXT_SOURCE_REVISION_SET_MISMATCH")

    joined_records = [by_node[node] for node in v1["selectedNodeKeys"]]
    predictor = make_dspy_predict_synthesizer_v1(
        lm=lm,
        lm_resolver=lm_resolver,
        dspy_module=dspy_module,
        model_revision=model_revision,
        program_revision=program_revision,
        max_evidence_bytes=max_evidence_bytes,
        max_output_chars=max_output_chars,
    )
    token_budget = min(v1["tokenBudget"], max_context_tokens) if max_context_tokens is not None else v1["tokenBudget"]
    if token_budget < 1:
        raise ValueError("ACE_CONTEXT_TOKEN_BUDGET_INVALID")

    def bounded_predict(query: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
        evidence_json = json.dumps(
            [
                {key: citation[key] for key in ("chunkId", "sourceRef", "sourceRevision", "startByte", "endByte", "verifiedText")}
                for citation in citations
            ],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        tokens = token_counter(query + "\n" + evidence_json)
        if not isinstance(tokens, int) or tokens < 0 or tokens > token_budget:
            raise ValueError("ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED")
        return predictor(query, citations)

    bounded_predict.provenance = dict(predictor.provenance)
    receipt = run_bounded_rlm_recommendation_v1(
        question=question,
        records=joined_records,
        max_iters=6,
        max_llm_calls=1,
        max_output_chars=max_output_chars,
        synthesizer=bounded_predict,
    )
    receipt["schema"] = "atlas.doc14-ace-dspy-predict-recommendation.v1"
    receipt["contextManifestChecksum"] = manifest["identityChecksum"]
    receipt["contextAdmission"] = "ACE_CONTEXT_MANIFEST_IDENTITY_VERIFIED"
    receipt["canonicalAuthority"] = False
    receipt["writesPerformed"] = False
    receipt.pop("receiptChecksum", None)
    encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    receipt["receiptChecksum"] = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    return receipt


def make_gemma4_8090_synthesizer(
    endpoint: str = "http://127.0.0.1:8090",
    *,
    max_tokens: int = 256,
) -> Callable[[str, list[dict[str, Any]]], str]:
    """Bounded read-only synthesizer calling live :8090 llama-server (resolves model from /v1/models)."""
    def _synth(question: str, citations: list[dict[str, Any]]) -> str:
        models_resp = json.loads(urllib.request.urlopen(f"{endpoint.rstrip('/')}/v1/models", timeout=5).read().decode("utf-8"))
        model_id = ((models_resp.get("data") or [{}])[0]).get("id") or "gemma4-legal-iq4xs-direct.gguf"
        evidence_lines = "\n".join(
            f"- {c['sourceRef']} [{c['startByte']}:{c['endByte']}] ({c['sourceRevision']}): {c['verifiedText']}"
            for c in citations
        )
        body = json.dumps({
            "model": model_id,
            "temperature": 0.1,
            "max_tokens": max_tokens,
            "messages": [
                {
                    "role": "system",
                    "content": "Answer concisely using ONLY the verified source citations below. Cite exact sourceRef paths.",
                },
                {"role": "user", "content": f"Question: {question}\n\nVerified Evidence:\n{evidence_lines}"},
            ],
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{endpoint.rstrip('/')}/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
        return str((((resp.get("choices") or [{}])[0]).get("message") or {}).get("content") or "").strip()

    return _synth


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Bounded DOC-14 RLM recommendation runner.")
    parser.add_argument("--question", required=True)
    parser.add_argument("--manifest", type=Path, default=Path("docs/reports/doc14-admitted-chunks.jsonl"))
    parser.add_argument("--live-llm", action="store_true")
    parser.add_argument("--llm-url", default="http://127.0.0.1:8090")
    args = parser.parse_args()

    recs = [json.loads(l) for l in args.manifest.read_text(encoding="utf-8").splitlines() if l.strip()]
    synth = make_gemma4_8090_synthesizer(args.llm_url) if args.live_llm else None
    out = run_bounded_rlm_recommendation_v1(question=args.question, records=recs, synthesizer=synth)
    print(json.dumps(out, indent=2))
