"""Task-bound ACE prefill packets and human-review handoff for QLoRA.

This is an offline/proposal bridge. It consumes an already sealed ContextManifest
and its independently read-back rows, attaches unsupervised features as hints,
and emits review candidates. It never invents grades or writes to a datastore.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any, Mapping, Sequence

from .ace_compiler import compile_ace_packet_from_proposal
from atlas_graph_runtime.doc14_bounded_rlm_recommender_v1 import validate_ace_context_readback_rows_v1

_SHA256 = re.compile(r"^(?:sha256:)?[a-f0-9]{64}$")
_TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_UNSUPERVISED_FIELDS = {
    "clusterId", "clusterRevision", "topicIds", "domainId",
    "domainModelRevision", "pagerankScore", "prefillScore",
}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _valid_revision(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _SHA256.fullmatch(value):
        raise ValueError(f"{label}_MUST_BE_SHA256")
    return value if value.startswith("sha256:") else f"sha256:{value}"


def _feature_map(value: Mapping[str, Any] | None) -> dict[str, Any]:
    features = dict(value or {})
    unknown = sorted(set(features) - _UNSUPERVISED_FIELDS)
    if unknown:
        raise ValueError(f"UNSUPPORTED_UNSUPERVISED_FEATURES:{','.join(unknown)}")
    for key, item in features.items():
        if key in {"pagerankScore", "prefillScore"}:
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
                raise ValueError(f"INVALID_NUMERIC_FEATURE:{key}")
        elif key == "topicIds":
            if not isinstance(item, list) or len(item) > 32 or any(not isinstance(v, str) or not v.strip() for v in item):
                raise ValueError("INVALID_TOPIC_IDS")
        elif not isinstance(item, str) or not item.strip():
            raise ValueError(f"INVALID_UNSUPERVISED_FEATURE:{key}")
    return features


def build_task_prefill_ace_qlora_packet_v1(
    *,
    task_id: str,
    query: str,
    concept_id: str,
    instruction: str,
    context_manifest: Mapping[str, Any],
    readback_rows: Sequence[Mapping[str, Any]],
    unsupervised_features_by_source: Mapping[str, Mapping[str, Any]] | None = None,
    domain: str = "general",
    created_at: str,
) -> dict[str, Any]:
    """Build a sealed ACE JSON packet plus ungraded, human-review QLoRA candidates.

    `readback_rows` must be the selected rows returned by the existing ACE/PG18
    readback owner. Text is used only to verify its supplied chunk hash and is
    never copied into the returned packet.
    """
    if not isinstance(task_id, str) or not _TASK_ID.fullmatch(task_id):
        raise ValueError("INVALID_TASK_ID")
    if not isinstance(query, str) or not query.strip() or len(query.encode("utf-8")) > 4096:
        raise ValueError("INVALID_QUERY")
    if not isinstance(concept_id, str) or not concept_id.strip():
        raise ValueError("INVALID_CONCEPT_ID")
    if not isinstance(instruction, str) or not instruction.strip() or len(instruction.encode("utf-8")) > 2048:
        raise ValueError("INVALID_INSTRUCTION")
    if not isinstance(created_at, str) or not created_at.strip():
        raise ValueError("CREATED_AT_REQUIRED_FOR_DETERMINISM")

    manifest, verified_rows = validate_ace_context_readback_rows_v1(
        records=[dict(row) for row in readback_rows],
        context_manifest=context_manifest,
        max_chunks=20,
    )
    identity_checksum = manifest.get("identityChecksum")
    if not isinstance(identity_checksum, str) or not re.fullmatch(r"[a-f0-9]{64}", identity_checksum):
        raise ValueError("INVALID_CONTEXT_MANIFEST_IDENTITY_CHECKSUM")
    v1 = manifest.get("v1")
    if not isinstance(v1, Mapping):
        raise ValueError("CONTEXT_MANIFEST_V1_BODY_REQUIRED")
    if v1.get("query", "").strip() != query.strip():
        raise ValueError("CONTEXT_MANIFEST_QUERY_MISMATCH")
    identity = manifest["identityInput"]
    task_binding = identity.get("taskBinding")
    if task_binding is not None and task_binding.get("logicalTaskKey") != task_id:
        raise ValueError("CONTEXT_MANIFEST_TASK_BINDING_MISMATCH")
    workspace_revision = _valid_revision(v1.get("workspaceRevision"), "WORKSPACE_REVISION")
    selected = v1.get("selectedNodeKeys")
    evidence_refs = v1.get("evidenceRefs")
    if not isinstance(selected, list) or not selected or any(not isinstance(x, str) or not x for x in selected):
        raise ValueError("CONTEXT_MANIFEST_SELECTED_KEYS_REQUIRED")
    if not isinstance(evidence_refs, list) or not evidence_refs or any(not isinstance(x, str) or not x for x in evidence_refs):
        raise ValueError("CONTEXT_MANIFEST_EVIDENCE_REFS_REQUIRED")

    features = unsupervised_features_by_source or {}
    rows_by_key: dict[str, Mapping[str, Any]] = {}
    for row in verified_rows:
        key = row.get("manifestNodeKey")
        if isinstance(key, str):
            if key in rows_by_key:
                raise ValueError("DUPLICATE_MANIFEST_READBACK_KEY")
            rows_by_key[key] = row
    if set(selected) - set(rows_by_key):
        raise ValueError("CONTEXT_MANIFEST_READBACK_ROWS_MISSING")

    compiled: list[dict[str, Any]] = []
    review_candidates: list[dict[str, Any]] = []
    manifest_refs = sorted(set(evidence_refs))
    for node_key in selected:
        row = rows_by_key[node_key]
        if row.get("lineageMembershipStatus") != "EXACT_SINGLE_MEMBER":
            raise ValueError("ACE_READBACK_REQUIRES_EXACT_SINGLE_MEMBER")
        source_ref = row.get("sourceRef")
        if not isinstance(source_ref, str) or source_ref not in manifest_refs:
            raise ValueError("READBACK_SOURCE_NOT_IN_CONTEXT_MANIFEST")
        source_revision = _valid_revision(row.get("sourceRevision"), "SOURCE_REVISION")
        row_workspace = _valid_revision(row.get("workspaceRevision"), "WORKSPACE_REVISION")
        if row_workspace != workspace_revision:
            raise ValueError("READBACK_WORKSPACE_REVISION_MISMATCH")
        chunk_id = row.get("chunkId")
        if not isinstance(chunk_id, str) or not chunk_id.strip():
            raise ValueError("READBACK_CHUNK_ID_REQUIRED")
        chunk_sha_raw = row.get("chunkSha256")
        if not isinstance(chunk_sha_raw, str) or not re.fullmatch(r"[a-f0-9]{64}", chunk_sha_raw):
            raise ValueError("CHUNK_SHA256_MUST_BE_HEX")
        chunk_sha = f"sha256:{chunk_sha_raw}"
        text = row.get("text")
        if text is not None:
            if not isinstance(text, str) or "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest() != chunk_sha:
                raise ValueError("READBACK_CHUNK_HASH_MISMATCH")
        row_features = _feature_map(features.get(source_ref))

        manifest_for_compiler = {"checksum": identity_checksum, "evidenceRefs": [source_ref]}
        proposal = {
            "schema": "atlas.ace-packet-proposal.v1",
            "taskId": task_id,
            "conceptId": concept_id,
            "evidenceRefs": [source_ref],
            "instruction": instruction,
            "contextManifestChecksum": identity_checksum,
        }
        ace_packet = compile_ace_packet_from_proposal(
            proposal,
            context_manifest=manifest_for_compiler,
            domain=domain,
            created_at=created_at,
        )
        candidate_key_digest = hashlib.sha256(_canonical_json({
            "taskId": task_id,
            "contextManifestChecksum": identity_checksum,
            "chunkId": chunk_id,
            "sourceRef": source_ref,
            "sourceRevision": source_revision,
        }).encode("utf-8")).hexdigest()[:24]
        review_candidate_key = f"ace:review:{candidate_key_digest}"
        compiled.append({
            "packet": ace_packet,
            "candidatePacketKey": review_candidate_key,
            "sourceRef": source_ref,
            "chunkId": chunk_id,
            "chunkSha256": chunk_sha,
            "sourceRevision": source_revision,
            "workspaceRevision": workspace_revision,
            "unsupervisedFeatures": row_features,
            "featureUse": "PREFILL_HINT_ONLY_NOT_A_LABEL_OR_AUTHORITY",
        })
        review_candidates.append({
            "queryGroupId": task_id,
            "query": query.strip(),
            "candidatePacketKey": review_candidate_key,
            "acePacketId": ace_packet["packet_id"],
            "sourceRef": source_ref,
            "sourceRevision": source_revision,
            "workspaceRevision": workspace_revision,
            "evidenceRef": source_ref,
            "grade": None,
            "reviewerKind": None,
            "reviewerId": None,
            "reviewStatus": "AWAITING_HUMAN_REVIEW",
        })

    body = {
        "schema": "atlas.task-prefill-ace-qlora-packet.v1",
        "taskId": task_id,
        "contextManifestChecksum": identity_checksum,
        "workspaceRevision": workspace_revision,
        "query": query.strip(),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "trainingStatus": "REVIEW_CANDIDATES_ONLY",
        "unsupervisedFeaturesAreLabels": False,
        "acePackets": compiled,
        "qloraReviewCandidates": review_candidates,
    }
    body["checksum"] = "sha256:" + hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    return body


def verify_task_prefill_ace_qlora_packet_v1(packet: Mapping[str, Any]) -> bool:
    """Verify outer packet checksum and non-promotion invariants."""
    if packet.get("schema") != "atlas.task-prefill-ace-qlora-packet.v1":
        return False
    if packet.get("canonicalAuthority") is not False or packet.get("writesPerformed") is not False:
        return False
    if packet.get("trainingStatus") != "REVIEW_CANDIDATES_ONLY" or packet.get("unsupervisedFeaturesAreLabels") is not False:
        return False
    expected = packet.get("checksum")
    if not isinstance(expected, str) or not _SHA256.fullmatch(expected):
        return False
    body = {k: v for k, v in packet.items() if k != "checksum"}
    actual = "sha256:" + hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    return actual == expected


def make_human_reviewed_qlora_sample_v1(
    packet: Mapping[str, Any], *, candidate_packet_key: str, grade: int, reviewer_id: str,
) -> dict[str, Any]:
    """Convert one reviewed candidate into the existing strict QLoRA sample schema."""
    if not verify_task_prefill_ace_qlora_packet_v1(packet):
        raise ValueError("TASK_PREFILL_PACKET_CHECKSUM_OR_STATUS_INVALID")
    if isinstance(grade, bool) or not isinstance(grade, int) or not 0 <= grade <= 3:
        raise ValueError("HUMAN_GRADE_MUST_BE_INTEGER_0_TO_3")
    if not isinstance(reviewer_id, str) or not reviewer_id.strip():
        raise ValueError("HUMAN_REVIEWER_ID_REQUIRED")
    matches = [row for row in packet.get("qloraReviewCandidates", []) if row.get("candidatePacketKey") == candidate_packet_key]
    if len(matches) != 1:
        raise ValueError("QLORA_REVIEW_CANDIDATE_NOT_UNIQUE")
    candidate = matches[0]
    if candidate.get("reviewStatus") != "AWAITING_HUMAN_REVIEW":
        raise ValueError("QLORA_CANDIDATE_NOT_AWAITING_REVIEW")
    sample = {
        "query_group_id": candidate["queryGroupId"],
        "query": candidate["query"],
        "candidate_packet_key": candidate["candidatePacketKey"],
        "source_ref": candidate["sourceRef"],
        "source_revision": candidate["sourceRevision"],
        "workspace_revision": candidate["workspaceRevision"],
        "evidence_ref": candidate["evidenceRef"],
        "grade": grade,
        "reviewer_kind": "HUMAN",
        "reviewer_id": reviewer_id.strip(),
    }
    try:
        from atlas_corpus_lib.schema_validator_qlora import QloraTrainingSampleV1
    except ImportError:
        from atlas_corpus_lib.atlas_corpus_lib.schema_validator_qlora import QloraTrainingSampleV1
    return QloraTrainingSampleV1.model_validate(sample).model_dump(mode="json")
