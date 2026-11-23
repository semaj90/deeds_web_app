"""ACE packet proposal adapter (advisory / shadow only).

Closes three gaps found by the 2026-10-17 audit, without creating a second owner:

* ACE-FEATURE-01  Python tuples -> deterministic feature matrix -> payload shaped as the EXISTING
                  `atlas.feature-signal-alignment.v1` contract (packages/parent-atlas/src/core/feature-signal-alignment.ts).
* ACE-PROMPT-01   Fail-closed validation of a DSPy-composed `atlas.ace-packet-proposal.v1`, plus a lazy DSPy signature.
                  Proposals only: they compile into the existing ContextManifestV2 -> PromptPlanV1 path (AFC-04), they never
                  replace it and never carry a prompt budget of their own.
* ACE-OUTCOME-01  Immutable, hash-chained outcome receipts. `writesPerformed` is always false here.

Hard rules kept: advisory only, canonicalAuthority false, no hidden reasoning / KV / tensor state persisted, every evidence
ref must come from the supplied ContextManifest allowlist, revisions are required (never defaulted).

Stdlib only. torch is optional and used only by `verify_torch_parity`.
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
from typing import Any, Mapping, Sequence

FEATURE_NAMES_V1: tuple[str, ...] = (
    "semantic_score", "lexical_score", "graph_score", "dependency_score",
    "recency_score", "breadth_score", "risk_score", "provenance_score",
)
ALIGNMENT_SCHEMA = "atlas.feature-signal-alignment.v1"
PROPOSAL_SCHEMA = "atlas.ace-packet-proposal.v1"
OUTCOME_SCHEMA = "atlas.ace-outcome-receipt.v1"
REPAIR_OUTPUT_SCHEMA = "atlas.dspy-repair-output.v1"
TASK_KINDS = ("diagnose", "repair_plan", "summarize")
OUTCOME_STATUSES = ("SUCCEEDED", "FAILED", "REJECTED")
# Persisting any of these is prohibited by AGENTS.md ("No hidden thoughts").
FORBIDDEN_KEYS = frozenset({"hiddenthoughts", "chainofthought", "kv_cache", "kvcache", "tensor", "reasoning_content"})


# ---------------------------------------------------------------- canonical encoding
def stable(value: Any) -> str:
    """Mirror of `stable()` in feature-signal-alignment.ts (sorted keys, JSON scalars).

    Limit: JS `localeCompare` and Python ordering agree for lowercase snake_case keys without digits, which is all this
    module emits. The cross-runtime test in test_ace_packet_proposal_v1.py proves the TS checksum equals this one.
    """
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(stable(v) for v in value) + "]"
    if isinstance(value, Mapping):
        return "{" + ",".join(
            f"{json.dumps(k, ensure_ascii=False)}:{stable(value[k])}" for k in sorted(value)
        ) + "}"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def sha256_hex(text: str | bytes) -> str:
    data = text.encode("utf-8") if isinstance(text, str) else text
    return hashlib.sha256(data).hexdigest()


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def _require_sha256_prefixed(value: Any, label: str) -> str:
    text = _require_text(value, label)
    if len(text) != 71 or not text.startswith("sha256:") or any(c not in "0123456789abcdef" for c in text[7:]):
        raise ValueError(f"{label} must be sha256:<64 lowercase hex>")
    return text


# ---------------------------------------------------------------- ACE-FEATURE-01
def build_feature_rows_v1(tuples: Sequence[Sequence[Any]]) -> list[dict[str, Any]]:
    """`(packet_key, evidence_ref, f1..f8)` tuples -> canonical rows.

    Positional tuples are the transport form (cf. RawOaklibTuple); identity is preserved beside every row. Values must be
    finite floats in [0, 1] or None. None becomes 0.0 with presence=0 ("zero_and_mask"): a missing value is never silently
    treated as a measured zero. Rows are sorted by (packet_key, evidence_ref); duplicates fail closed.
    """
    width = 2 + len(FEATURE_NAMES_V1)
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    for i, t in enumerate(tuples):
        if isinstance(t, (str, bytes)) or len(t) != width:
            raise ValueError(f"tuple[{i}] must have {width} items (packet_key, evidence_ref, {len(FEATURE_NAMES_V1)} features)")
        key = (_require_text(t[0], f"tuple[{i}].packet_key"), _require_text(t[1], f"tuple[{i}].evidence_ref"))
        if key in rows:
            raise ValueError(f"DUPLICATE_ROW_IDENTITY: {key}")
        values: list[float] = []
        presence: list[int] = []
        for name, raw in zip(FEATURE_NAMES_V1, t[2:]):
            if raw is None:
                values.append(0.0)
                presence.append(0)
                continue
            if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw) or not 0.0 <= float(raw) <= 1.0:
                raise ValueError(f"tuple[{i}].{name} must be a finite number in [0,1] or None, got {raw!r}")
            values.append(float(raw))
            presence.append(1)
        rows[key] = {"packet_key": key[0], "evidence_ref": key[1], "values": values, "presence": presence}
    if not rows:
        raise ValueError("at least one feature row is required")
    return [rows[k] for k in sorted(rows)]


def row_identity_checksum_v1(rows: Sequence[Mapping[str, Any]]) -> str:
    return sha256_hex(stable([[r["packet_key"], r["evidence_ref"]] for r in rows]))


def tensor_checksum_v1(flat: Sequence[float | int], dtype: str) -> str:
    """sha256 of the little-endian row-major bytes (float32 or uint8)."""
    if dtype == "float32":
        return sha256_hex(struct.pack(f"<{len(flat)}f", *[float(v) for v in flat]))
    if dtype == "uint8":
        return sha256_hex(bytes(int(v) for v in flat))
    raise ValueError(f"unsupported dtype {dtype}")


def to_alignment_payload_v1(
    rows: Sequence[Mapping[str, Any]], *, alignment_revision: str, feature_snapshot_revision: str,
    producer_revision: str, source_snapshot_revision: str,
) -> dict[str, Any]:
    """Payload accepted by `featureSignalAlignmentSchema` (zod .strict()); canonical_authority is always false."""
    for label, value in (("alignment_revision", alignment_revision), ("feature_snapshot_revision", feature_snapshot_revision),
                         ("producer_revision", producer_revision), ("source_snapshot_revision", source_snapshot_revision)):
        _require_text(value, label)
    n, d = len(rows), len(FEATURE_NAMES_V1)
    ident = row_identity_checksum_v1(rows)
    values = [v for r in rows for v in r["values"]]
    presence = [p for r in rows for p in r["presence"]]
    blocks = [
        {
            "block_id": "ace_features", "block_revision": f"{feature_snapshot_revision}:ace_features", "kind": "continuous",
            "row_identity_checksum": ident, "row_count": n, "dimensions": d, "dtype": "float32", "normalization": "none",
            "tensor_checksum": tensor_checksum_v1(values, "float32"), "source_snapshot_revision": source_snapshot_revision,
            "canonical_authority": False, "metadata": {"feature_names": list(FEATURE_NAMES_V1), "range": "unit_interval"},
        },
        {
            "block_id": "ace_presence", "block_revision": f"{feature_snapshot_revision}:ace_presence", "kind": "binary_mask",
            "row_identity_checksum": ident, "row_count": n, "dimensions": d, "dtype": "uint8", "normalization": "binary_01",
            "tensor_checksum": tensor_checksum_v1(presence, "uint8"), "source_snapshot_revision": source_snapshot_revision,
            "canonical_authority": False, "metadata": {"missing_policy": "zero_and_mask"},
        },
    ]
    body = {
        "schema": ALIGNMENT_SCHEMA, "alignment_revision": alignment_revision, "feature_snapshot_revision": feature_snapshot_revision,
        "row_identity_checksum": ident, "row_count": n, "blocks": blocks, "concatenated_dimensions": 2 * d,
        "producer_revision": producer_revision, "canonical_authority": False,
    }
    return {**body, "output_checksum": sha256_hex(stable(body))}


def verify_torch_parity(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Build real torch tensors from the rows and prove their bytes hash to the payload checksums."""
    import torch  # optional dependency

    values = torch.tensor([r["values"] for r in rows], dtype=torch.float32)
    presence = torch.tensor([r["presence"] for r in rows], dtype=torch.uint8)
    flat_v, flat_p = values.reshape(-1).tolist(), presence.reshape(-1).tolist()
    return {
        "shape": list(values.shape),
        "valuesChecksumMatches": sha256_hex(values.contiguous().numpy().tobytes()) == tensor_checksum_v1(flat_v, "float32"),
        "presenceChecksumMatches": sha256_hex(presence.contiguous().numpy().tobytes()) == tensor_checksum_v1(flat_p, "uint8"),
        "torch": torch.__version__,
    }


# ---------------------------------------------------------------- ACE-PROMPT-01
def _reject_forbidden_keys(value: Any, path: str = "$") -> None:
    if isinstance(value, Mapping):
        for k, v in value.items():
            if str(k).lower().replace("-", "").replace("_", "") in {x.replace("_", "") for x in FORBIDDEN_KEYS}:
                raise ValueError(f"FORBIDDEN_KEY at {path}.{k}")
            _reject_forbidden_keys(v, f"{path}.{k}")
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            _reject_forbidden_keys(v, f"{path}[{i}]")


def validate_ace_packet_proposal_v1(
    proposal: Mapping[str, Any], *, context_manifest_checksum: str, allowed_evidence_refs: Sequence[str],
    allowed_packet_keys: Sequence[str], alignment_output_checksum: str | None = None, max_instruction_chars: int = 2000,
) -> dict[str, Any]:
    """Fail closed. Returns the normalized proposal plus `proposalChecksum`; never authorizes a write or an edit."""
    expected = {
        "schema", "packetKey", "workspaceRevision", "sourceRevision", "contextManifestChecksum",
        "featureSignalAlignmentChecksum", "modelRevision", "policyRevision", "evidenceRefs", "task", "advisoryOnly",
    }
    if not isinstance(proposal, Mapping) or set(proposal) != expected:
        raise ValueError(f"proposal must contain exactly {sorted(expected)}")
    _reject_forbidden_keys(proposal)
    if proposal["schema"] != PROPOSAL_SCHEMA:
        raise ValueError(f"schema must be {PROPOSAL_SCHEMA}")
    if proposal["advisoryOnly"] is not True:
        raise ValueError("advisoryOnly must be true")
    if _require_sha256_prefixed(proposal["contextManifestChecksum"], "contextManifestChecksum") != \
            _require_sha256_prefixed(context_manifest_checksum, "expected context_manifest_checksum"):
        raise ValueError("CONTEXT_MANIFEST_CHECKSUM_MISMATCH")
    align = _require_text(proposal["featureSignalAlignmentChecksum"], "featureSignalAlignmentChecksum")
    if len(align) != 64 or any(c not in "0123456789abcdef" for c in align):
        raise ValueError("featureSignalAlignmentChecksum must be 64 lowercase hex")
    if alignment_output_checksum is not None and align != alignment_output_checksum:
        raise ValueError("FEATURE_ALIGNMENT_CHECKSUM_MISMATCH")
    for field in ("workspaceRevision", "sourceRevision", "modelRevision", "policyRevision"):
        _require_text(proposal[field], field)  # revisions are required, never defaulted
    keys = set(allowed_packet_keys)
    refs_allowed = set(allowed_evidence_refs)
    if not keys or not refs_allowed:
        raise ValueError("allowlists must be non-empty")
    packet_key = _require_text(proposal["packetKey"], "packetKey")
    if packet_key not in keys:
        raise ValueError(f"UNAUTHORIZED_PACKET_KEY: {packet_key}")
    refs = proposal["evidenceRefs"]
    if not isinstance(refs, list) or not refs or any(not isinstance(r, str) or not r.strip() for r in refs):
        raise ValueError("evidenceRefs must be a non-empty list of strings")
    if len(refs) != len(set(refs)):
        raise ValueError("evidenceRefs contains duplicates")
    unknown = sorted(set(refs) - refs_allowed)
    if unknown:
        raise ValueError(f"UNAUTHORIZED_EVIDENCE_REF: {unknown}")
    task = proposal["task"]
    if not isinstance(task, Mapping) or set(task) != {"kind", "instruction", "expectedOutputSchema"}:
        raise ValueError("task must contain exactly kind, instruction, expectedOutputSchema")
    if task["kind"] not in TASK_KINDS:
        raise ValueError(f"task.kind must be one of {TASK_KINDS}")
    instruction = _require_text(task["instruction"], "task.instruction")
    if len(instruction) > max_instruction_chars:
        raise ValueError("task.instruction exceeds max_instruction_chars")
    if task["expectedOutputSchema"] != REPAIR_OUTPUT_SCHEMA:
        raise ValueError(f"task.expectedOutputSchema must be {REPAIR_OUTPUT_SCHEMA}")
    normalized = {
        "schema": PROPOSAL_SCHEMA, "packetKey": packet_key, "workspaceRevision": proposal["workspaceRevision"].strip(),
        "sourceRevision": proposal["sourceRevision"].strip(), "contextManifestChecksum": proposal["contextManifestChecksum"],
        "featureSignalAlignmentChecksum": align, "modelRevision": proposal["modelRevision"].strip(),
        "policyRevision": proposal["policyRevision"].strip(), "evidenceRefs": sorted(refs),
        "task": {"kind": task["kind"], "instruction": instruction, "expectedOutputSchema": REPAIR_OUTPUT_SCHEMA},
        "advisoryOnly": True,
    }
    return {**normalized, "canonicalAuthority": False, "proposalChecksum": "sha256:" + sha256_hex(stable(normalized))}


def build_compose_program_v1() -> Any:
    """DSPy program that PROPOSES task text from supplied evidence ids. Lazy: DSPy is only needed when this is called.

    Install DSPy only in the experiment venv (/home/james/.venvs/atlas-dspy-exp). The LM is injected by the caller
    (e.g. a dspy.BaseLM subclass that calls Bifrost); nothing here selects or contacts a model.
    """
    try:
        import dspy as dp  # type: ignore
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("DSPy is not installed in this interpreter; use the atlas-dspy-exp venv") from exc

    class ComposeAcePacketProposal(dp.Signature):
        """Propose an advisory ACE task for one packet. Cite ONLY evidence ids from allowed_evidence_refs. Never invent ids."""

        packet_key: str = dp.InputField()
        evidence_summary: str = dp.InputField()
        allowed_evidence_refs: list[str] = dp.InputField()
        task_kind: str = dp.OutputField(desc="one of: diagnose, repair_plan, summarize")
        instruction: str = dp.OutputField(desc="short imperative instruction, no hidden reasoning")
        evidence_refs: list[str] = dp.OutputField(desc="subset of allowed_evidence_refs")

    return dp.Predict(ComposeAcePacketProposal)


def proposal_from_prediction_v1(
    prediction: Any, *, packet_key: str, workspace_revision: str, source_revision: str, context_manifest_checksum: str,
    alignment_output_checksum: str, model_revision: str, policy_revision: str,
) -> dict[str, Any]:
    """Wrap a DSPy prediction into a proposal dict. It is NOT trusted until validate_ace_packet_proposal_v1 passes."""
    return {
        "schema": PROPOSAL_SCHEMA, "packetKey": packet_key, "workspaceRevision": workspace_revision,
        "sourceRevision": source_revision, "contextManifestChecksum": context_manifest_checksum,
        "featureSignalAlignmentChecksum": alignment_output_checksum, "modelRevision": model_revision,
        "policyRevision": policy_revision, "evidenceRefs": list(prediction.evidence_refs),
        "task": {"kind": str(prediction.task_kind).strip(), "instruction": str(prediction.instruction),
                 "expectedOutputSchema": REPAIR_OUTPUT_SCHEMA},
        "advisoryOnly": True,
    }


# ---------------------------------------------------------------- ACE-OUTCOME-01
def build_outcome_receipt_v1(
    *, proposal_checksum: str, prompt_plan_checksum: str | None, model_revision: str, status: str,
    validator_verdict: str, previous_receipt_checksum: str | None, tests_passed: bool | None = None,
) -> dict[str, Any]:
    """Hash-chained, immutable outcome record. This adapter never writes; `writesPerformed` is hard-wired to false.

    `prompt_plan_checksum` is the checksum of the EXISTING PromptPlanV1 this proposal compiled into, or None when no
    prompt was compiled (REJECTED before compilation). Reward/label use must stay offline and shadow-only.
    """
    if status not in OUTCOME_STATUSES:
        raise ValueError(f"status must be one of {OUTCOME_STATUSES}")
    _require_sha256_prefixed(proposal_checksum, "proposal_checksum")
    if prompt_plan_checksum is not None:
        _require_text(prompt_plan_checksum, "prompt_plan_checksum")
    if previous_receipt_checksum is not None:
        _require_sha256_prefixed(previous_receipt_checksum, "previous_receipt_checksum")
    body = {
        "schema": OUTCOME_SCHEMA, "proposalChecksum": proposal_checksum, "promptPlanChecksum": prompt_plan_checksum,
        "modelRevision": _require_text(model_revision, "model_revision"), "status": status,
        "validatorVerdict": _require_text(validator_verdict, "validator_verdict"), "testsPassed": tests_passed,
        "previousReceiptChecksum": previous_receipt_checksum, "writesPerformed": False, "canonicalAuthority": False,
    }
    return {**body, "receiptChecksum": "sha256:" + sha256_hex(stable(body))}


def verify_receipt_chain_v1(receipts: Sequence[Mapping[str, Any]]) -> bool:
    """True iff every receipt hashes to its own checksum and links to its predecessor."""
    prev: str | None = None
    for r in receipts:
        body = {k: v for k, v in r.items() if k != "receiptChecksum"}
        if r.get("receiptChecksum") != "sha256:" + sha256_hex(stable(body)) or r.get("previousReceiptChecksum") != prev:
            return False
        prev = r["receiptChecksum"]
    return True


# ---------------------------------------------------------------- bounded adaptive refine loop
REFINE_MAX_PASSES_CEILING = 2  # RLM-05 (crime-scene-reconstruction): at most two proposal/validation/refinement passes


def recommendation_context_v1(ranked: Mapping[str, Any], *, k: int) -> tuple[str, list[str], list[str]]:
    """Take the first k entries of an owner-ranked `atlas.topk.v1` result (python/atlas_compute/topk_paginator.stable_topk).

    Ordering is NOT re-derived here: this only verifies the owner's invariant (non-increasing finite scores, unique
    canonicalIds) and slices. Returns (evidence_summary, allowed_evidence_refs, canonical_ids). Raw vectors and hidden
    state are never included; only ids, scores, ordinals and evidence refs.
    """
    if not isinstance(ranked, Mapping) or ranked.get("schema") != "atlas.topk.v1":
        raise ValueError("ranked must be an atlas.topk.v1 result")
    if ranked.get("order") != "SCORE_DESC_ORDINAL_ASC_ID_ASC":
        raise ValueError("ranked.order must be SCORE_DESC_ORDINAL_ASC_ID_ASC")
    if not isinstance(k, int) or k < 1:
        raise ValueError("k must be a positive int")
    candidates = list(ranked.get("candidates") or [])[:k]
    if not candidates:
        raise ValueError("ranked result has no candidates")
    lines: list[str] = []
    refs: set[str] = set()
    ids: list[str] = []
    prev = math.inf
    for c in candidates:
        cid = _require_text(c.get("canonicalId"), "candidate.canonicalId")
        if cid in ids:
            raise ValueError(f"DUPLICATE_CANONICAL_ID: {cid}")
        score = c.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(float(score)):
            raise ValueError("candidate.score must be finite")
        if float(score) > prev:
            raise ValueError("RANKING_NOT_CANONICAL: scores must be non-increasing")
        prev = float(score)
        cand_refs = c.get("evidenceRefs")
        if not isinstance(cand_refs, list) or not cand_refs or any(not isinstance(r, str) or not r.strip() for r in cand_refs):
            raise ValueError(f"candidate {cid} needs a non-empty evidenceRefs list")
        refs.update(r.strip() for r in cand_refs)
        ids.append(cid)
        lines.append(f"- {cid} score={float(score):.6f} ordinal={int(c['candidateOrdinal'])}")
    summary = "Ranked recommendations (owner order):\n" + "\n".join(lines)
    return summary, sorted(refs), ids


def recommend_refine_v1(ranked: Mapping[str, Any], *, k: int, packet_key: str, predict: Any, header: Mapping[str, str],
                        max_passes: int = 2) -> dict[str, Any]:
    """Top-k recommendation context -> DSPy proposer -> bounded refine loop -> validated advisory proposal + receipts.

    The validator's allowlists are derived from the top-k evidence refs only. A proposal citing anything outside them
    fails closed and is retried at most `max_passes` times.
    """
    summary, allowed_refs, ids = recommendation_context_v1(ranked, k=k)
    propose = make_proposer_v1(predict, packet_key=packet_key, evidence_summary=summary,
                               allowed_evidence_refs=allowed_refs, header=header)
    validate_kwargs = dict(
        context_manifest_checksum=header["context_manifest_checksum"],
        allowed_evidence_refs=allowed_refs,
        allowed_packet_keys=[packet_key],
        alignment_output_checksum=header["alignment_output_checksum"],
    )
    out = refine_proposal_v1(propose, validate_kwargs=validate_kwargs, max_passes=max_passes)
    return {**out, "topKCanonicalIds": ids, "allowedEvidenceRefs": allowed_refs}


def make_proposer_v1(predict: Any, *, packet_key: str, evidence_summary: str, allowed_evidence_refs: Sequence[str],
                     header: Mapping[str, str]) -> Any:
    """Adapt an injected DSPy predictor (build_compose_program_v1) to refine_proposal_v1's `propose(prior_error)`.

    The validator error is appended to the evidence summary on retry; nothing else from the prior draft is fed back.
    `header` must carry workspace_revision, source_revision, context_manifest_checksum, alignment_output_checksum,
    model_revision and policy_revision. They are passed through unchanged and validated downstream, never defaulted.
    """
    required = {"workspace_revision", "source_revision", "context_manifest_checksum", "alignment_output_checksum",
                "model_revision", "policy_revision"}
    if set(header) != required:
        raise ValueError(f"header must contain exactly {sorted(required)}")

    def propose(prior_error: str | None) -> dict[str, Any]:
        summary = evidence_summary if prior_error is None else f"{evidence_summary}\nVALIDATOR_FEEDBACK: {prior_error}"
        prediction = predict(packet_key=packet_key, evidence_summary=summary,
                             allowed_evidence_refs=list(allowed_evidence_refs))
        return proposal_from_prediction_v1(
            prediction, packet_key=packet_key, workspace_revision=header["workspace_revision"],
            source_revision=header["source_revision"], context_manifest_checksum=header["context_manifest_checksum"],
            alignment_output_checksum=header["alignment_output_checksum"], model_revision=header["model_revision"],
            policy_revision=header["policy_revision"],
        )

    return propose


def refine_proposal_v1(propose: Any, *, validate_kwargs: Mapping[str, Any], max_passes: int = 2) -> dict[str, Any]:
    """Bounded propose -> validate -> refine loop. The deterministic validator is the only gate.

    `propose(prior_error)` is injected (for example a DSPy predictor wrapper); it receives None on the first pass and
    ONLY the validator's error string on later passes. It never receives raw evidence, hidden reasoning or prior drafts.
    Every attempt writes one hash-chained outcome receipt (writesPerformed=false). Nothing is persisted here.
    """
    if not isinstance(max_passes, int) or not 1 <= max_passes <= REFINE_MAX_PASSES_CEILING:
        raise ValueError(f"max_passes must be an int in [1, {REFINE_MAX_PASSES_CEILING}]")
    receipts: list[dict[str, Any]] = []
    prior_error: str | None = None
    for attempt in range(1, max_passes + 1):
        proposal = propose(prior_error)
        proposal_checksum = "sha256:" + sha256_hex(stable(proposal))
        prev = receipts[-1]["receiptChecksum"] if receipts else None
        model_revision = proposal.get("modelRevision") if isinstance(proposal, Mapping) else None
        if not isinstance(model_revision, str) or not model_revision.strip():
            model_revision = "unrecorded:proposal-missing-modelRevision"  # explicit marker, never a silent default
        try:
            validated = validate_ace_packet_proposal_v1(proposal, **validate_kwargs)
        except ValueError as exc:
            prior_error = str(exc)
            receipts.append(build_outcome_receipt_v1(
                proposal_checksum=proposal_checksum, prompt_plan_checksum=None, model_revision=model_revision,
                status="REJECTED", validator_verdict=prior_error, previous_receipt_checksum=prev,
            ))
            continue
        receipts.append(build_outcome_receipt_v1(
            proposal_checksum=proposal_checksum, prompt_plan_checksum=None, model_revision=model_revision,
            status="SUCCEEDED", validator_verdict="PASS", previous_receipt_checksum=prev,
        ))
        return {"status": "VALIDATED", "attempts": attempt, "validated": validated, "receipts": receipts,
                "chainOk": verify_receipt_chain_v1(receipts)}
    return {"status": "EXHAUSTED", "attempts": max_passes, "validated": None, "receipts": receipts,
            "chainOk": verify_receipt_chain_v1(receipts)}
