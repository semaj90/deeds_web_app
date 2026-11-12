"""Fail-closed admission for source-bound low-rank task inputs.

This validates the identity envelope only. It does not establish that a binding
receipt is authentic, that an embedding is semantic, or that a task is executable.
"""
from __future__ import annotations

import re
import math
from typing import Any, Iterable

_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_REQUIRED = (
    "task_id",
    "canonical_task_key",
    "candidate_packet_key",
    "source_ref",
    "source_revision",
    "workspace_revision",
    "candidate_snapshot_revision",
    "ordinal_map_checksum",
    "binding_receipt_sha256",
    "semantic_representation_revision",
    "feature_revision",
    "graph_revision",
    "candidate_ordinal",
    "evidence_refs",
    "semantic_embedding_768",
    "latent_vector_64",
    "latent_representation_id",
    "latent_representation_revision",
    "feature_row",
)


def validate_bound_task_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return rows in input order, rejecting missing, invented, or conflicting bindings."""
    materialized = list(rows)
    if not materialized:
        raise ValueError("LOWRANK_INPUT_EMPTY")

    seen_task_ids: set[str] = set()
    seen_keys: set[str] = set()
    snapshot: str | None = None
    workspace: str | None = None
    for index, row in enumerate(materialized):
        if not isinstance(row, dict):
            raise ValueError(f"LOWRANK_ROW_NOT_OBJECT:{index}")
        missing = [key for key in _REQUIRED if key not in row]
        if missing:
            raise ValueError(f"LOWRANK_BINDING_FIELDS_MISSING:{index}:{','.join(missing)}")
        for key in ("task_id", "canonical_task_key", "candidate_packet_key", "source_ref"):
            value = row[key]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"LOWRANK_BINDING_VALUE_INVALID:{index}:{key}")
        if row["candidate_packet_key"].startswith("packet:"):
            raise ValueError(f"LOWRANK_GENERATED_PACKET_KEY:{index}")
        if row["canonical_task_key"].startswith("task:ordinal:"):
            raise ValueError(f"LOWRANK_GENERATED_TASK_KEY:{index}")
        for key in ("source_revision", "workspace_revision", "candidate_snapshot_revision",
                    "ordinal_map_checksum", "binding_receipt_sha256", "semantic_representation_revision",
                    "feature_revision", "graph_revision"):
            if not isinstance(row[key], str) or not _SHA256.fullmatch(row[key]):
                raise ValueError(f"LOWRANK_REVISION_NOT_SHA256:{index}:{key}")
        ordinal = row["candidate_ordinal"]
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal != index:
            raise ValueError(f"LOWRANK_ORDINAL_MISMATCH:{index}:{ordinal}")
        refs = row["evidence_refs"]
        if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or not ref.strip() for ref in refs):
            raise ValueError(f"LOWRANK_EVIDENCE_REFS_INVALID:{index}")
        embedding = row["semantic_embedding_768"]
        if (not isinstance(embedding, list) or len(embedding) != 768 or
                any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                    for v in embedding)):
            raise ValueError(f"LOWRANK_SEMANTIC_768_INVALID:{index}")
        latent = row["latent_vector_64"]
        if (not isinstance(latent, list) or len(latent) != 64 or
                any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                    for v in latent)):
            raise ValueError(f"LOWRANK_LATENT_64_INVALID:{index}")
        if not isinstance(row["latent_representation_id"], str) or not row["latent_representation_id"].strip():
            raise ValueError(f"LOWRANK_LATENT_REPRESENTATION_ID_INVALID:{index}")
        if not isinstance(row["latent_representation_revision"], str) or not _SHA256.fullmatch(row["latent_representation_revision"]):
            raise ValueError(f"LOWRANK_LATENT_REPRESENTATION_REVISION_INVALID:{index}")
        features = row["feature_row"]
        if (not isinstance(features, list) or len(features) != 10 or
                any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                    for v in features)):
            raise ValueError(f"LOWRANK_FEATURE_ROW_INVALID:{index}")
        if row["task_id"] in seen_task_ids or row["canonical_task_key"] in seen_keys:
            raise ValueError(f"LOWRANK_DUPLICATE_TASK_IDENTITY:{index}")
        seen_task_ids.add(row["task_id"])
        seen_keys.add(row["canonical_task_key"])
        if snapshot is None:
            snapshot = row["candidate_snapshot_revision"]
            workspace = row["workspace_revision"]
        elif (row["candidate_snapshot_revision"] != snapshot or row["workspace_revision"] != workspace or
              row["semantic_representation_revision"] != materialized[0]["semantic_representation_revision"] or
              row["feature_revision"] != materialized[0]["feature_revision"] or
              row["graph_revision"] != materialized[0]["graph_revision"] or
              row["latent_representation_id"] != materialized[0]["latent_representation_id"] or
              row["latent_representation_revision"] != materialized[0]["latent_representation_revision"]):
            raise ValueError(f"LOWRANK_MIXED_SNAPSHOT_OR_WORKSPACE:{index}")
    return materialized
