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
