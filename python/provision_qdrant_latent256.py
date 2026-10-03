"""Retired latent-256 projection entrypoint; currently diagnostic-only and fail-closed.

The historical 55,169-row Qdrant mirror is not evidence for the current candidate
architecture or its input lineage. The candidate is 768 -> 512 -> 256 -> 128, with
latent_64 derived from latent_128. Do not copy historical Postgres latent columns to
Qdrant as if they were outputs of that candidate.

Follows this repo's Qdrant API hard rule (root CLAUDE.md, "Qdrant API Strategy"): REST API with
the vectors kept in memory and serialized once per batch, never shell/docker exec/curl for bulk
vector payloads (that's the documented ENOBUFS failure mode).

Qdrant point IDs are projection identifiers, not packet/source identity or CandidateOrdinal. The
candidate point contract keeps the physical chunk UUID and canonical packet_key separately in
payload; an admitted, stable projection-ID owner is still required before any upsert.

The candidate payload binds the complete source/workspace and semantic-input lineage, training
receipt/input snapshot, checkpoint, representation revisions, and each named vector digest. The
legacy collection's one-vector layout is not compatible with this candidate family.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import uuid
COLLECTION_NAME = "codebase_chunks_latent256"
CANDIDATE_COLLECTION_NAME = "codebase_chunks_latent_family_v2"
CANDIDATE_COLLECTION_REVISION = "atlas.qdrant.latent-family.v2"
CANDIDATE_VECTOR_DIMS = {"latent_256": 256, "latent_128": 128, "latent_64": 64}
CANDIDATE_PAYLOAD_SCHEMA = "atlas.latent-qdrant-point-payload.v3"


def build_candidate_point(row: dict) -> dict:
    """Build one fully revision-bound named-vector point; never performs I/O.

    This serializer is the candidate Qdrant projection boundary. The caller must
    supply data already selected and read back from the canonical Postgres cohort.
    The CLI remains blocked until that authority chain and the collection layout are
    separately admitted.
    """
    required = (
        "projection_id", "chunk_row_id", "packet_key", "source_ref", "source_revision",
        "workspace_revision", "source_digest", "semantic_input_digest",
        "semantic_model_revision", "tokenizer_revision", "checkpoint_digest",
        "training_receipt_digest", "training_input_snapshot_checksum",
        "tokenizer_revision_status", "architecture_revision", "producer_revision",
        "projection_revision", "representation_revisions", "vectors",
    )
    missing = [key for key in required if row.get(key) is None or row.get(key) == ""]
    if missing:
        raise ValueError(f"candidate point missing required fields: {','.join(missing)}")
    try:
        projection_id = str(uuid.UUID(str(row["projection_id"])))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("projection_id must be a UUID projection key") from exc

    if row["architecture_revision"] != "atlas.latent-ae.768-512-256-128.v2":
        raise ValueError("candidate architecture revision mismatch")
    if not str(row["packet_key"]).strip() or not str(row["source_ref"]).strip():
        raise ValueError("packet_key and source_ref must be non-empty")
    try:
        chunk_row_id = str(uuid.UUID(str(row["chunk_row_id"])))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("chunk_row_id must be the canonical physical chunk UUID") from exc

    for name in (
        "source_digest", "semantic_input_digest", "checkpoint_digest",
        "training_receipt_digest", "training_input_snapshot_checksum",
    ):
        digest = str(row[name])
        if len(digest) != 71 or not digest.startswith("sha256:") or any(char not in "0123456789abcdef" for char in digest[7:]):
            raise ValueError(f"{name} must be a lowercase sha256 digest")
    if row["tokenizer_revision_status"] not in {"CONFIGURED_NOT_RUNTIME_ATTESTED", "RUNTIME_ATTESTED"}:
        raise ValueError("tokenizer_revision_status must state the actual attestation level")

    representation_revisions = row["representation_revisions"]
    if set(representation_revisions) != set(CANDIDATE_VECTOR_DIMS):
        raise ValueError("representation_revisions must bind exactly latent_256/128/64")
    vectors = row["vectors"]
    if set(vectors) != set(CANDIDATE_VECTOR_DIMS):
        raise ValueError("vectors must contain exactly latent_256/128/64 named vectors")
    normalized_vectors: dict[str, list[float]] = {}
    vector_digests: dict[str, str] = {}
    for name, dimensions in CANDIDATE_VECTOR_DIMS.items():
        revision = representation_revisions[name]
        if not isinstance(revision, str) or not revision.strip():
            raise ValueError(f"missing representation revision for {name}")
        values = [float(value) for value in vectors[name]]
        if len(values) != dimensions or not all(math.isfinite(value) for value in values):
            raise ValueError(f"{name} must be a finite {dimensions}-dimensional vector")
        norm = math.sqrt(sum(value * value for value in values))
        if not math.isclose(norm, 1.0, rel_tol=0.0, abs_tol=0.02):
            raise ValueError(f"{name} must be L2-normalized; observed norm={norm:.6f}")
        normalized_vectors[name] = values
        encoded = json.dumps(values, separators=(",", ":"), allow_nan=False).encode("utf-8")
        vector_digests[name] = "sha256:" + hashlib.sha256(encoded).hexdigest()

    latent128_prefix = normalized_vectors["latent_128"][: CANDIDATE_VECTOR_DIMS["latent_64"]]
    prefix_norm = math.sqrt(sum(value * value for value in latent128_prefix))
    if prefix_norm <= 0.0:
        raise ValueError("latent_128 prefix cannot be zero when deriving latent_64")
    expected_latent64 = [value / prefix_norm for value in latent128_prefix]
    if any(
        not math.isclose(actual, expected, rel_tol=0.0, abs_tol=1e-5)
        for actual, expected in zip(normalized_vectors["latent_64"], expected_latent64, strict=True)
    ):
        raise ValueError("latent_64 must be the L2-normalized 64-coordinate prefix of latent_128")

    packet_key = str(row["packet_key"])
    payload = {
        "payload_schema": CANDIDATE_PAYLOAD_SCHEMA,
        "canonical_id": packet_key,
        "packet_key": packet_key,
        "chunk_row_id": chunk_row_id,
        "projection_id": projection_id,
        "source_ref": str(row["source_ref"]),
        "source_revision": str(row["source_revision"]),
        "workspace_revision": str(row["workspace_revision"]),
        "source_digest": row["source_digest"],
        "semantic_input_digest": row["semantic_input_digest"],
        "input_representation": "semantic_768",
        "input_dimensions": 768,
        "canonical_input_column": "codebase_chunk_index.content_embedding_768",
        "semantic_model_revision": str(row["semantic_model_revision"]),
        "tokenizer_revision": str(row["tokenizer_revision"]),
        "tokenizer_revision_status": row["tokenizer_revision_status"],
        "representation_family": "LATENT_AUTOENCODER",
        "architecture_revision": row["architecture_revision"],
        "producer_revision": row["producer_revision"],
        "training_receipt_digest": row["training_receipt_digest"],
        "training_input_snapshot_checksum": row["training_input_snapshot_checksum"],
        "representation_revisions": representation_revisions,
        "representation_definitions": {
            "latent_256": {"dimensions": 256, "origin": "LEARNED_INTERMEDIATE", "normalization": "L2_UNIT"},
            "latent_128": {"dimensions": 128, "origin": "LEARNED_BOTTLENECK", "normalization": "L2_UNIT"},
            "latent_64": {"dimensions": 64, "origin": "NORMALIZED_PREFIX_OF_LATENT_128", "normalization": "L2_UNIT"},
        },
        "vector_dimensions": CANDIDATE_VECTOR_DIMS,
        "vector_digests": vector_digests,
        "checkpoint_digest": row["checkpoint_digest"],
        "projection_revision": str(row["projection_revision"]),
        "canonical_authority": False,
    }
    payload_checksum = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    ).hexdigest()
    payload["payload_checksum"] = "sha256:" + payload_checksum
    return {"id": projection_id, "vector": normalized_vectors, "payload": payload}


def build_candidate_upsert_request(rows: list[dict]) -> dict:
    """Build the Qdrant 1.19 REST request envelope without performing network I/O.

    Each item is a complete point, so the default upsert replacement behavior cannot
    accidentally drop one of the family vectors or provenance payload fields.
    """
    if not rows:
        raise ValueError("candidate upsert request must contain at least one point")
    points = [build_candidate_point(row) for row in rows]
    ids = [point["id"] for point in points]
    if len(ids) != len(set(ids)):
        raise ValueError("candidate upsert batch contains duplicate projection IDs")
    return {
        "method": "PUT",
        "path": f"/collections/{CANDIDATE_COLLECTION_NAME}/points?wait=true",
        "body": {"points": points},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", help="accepted for CLI compatibility; this planner never connects")
    parser.add_argument("--qdrant-url", help="accepted for CLI compatibility; this planner never connects")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=0, help="0 = all eligible rows")
    parser.add_argument("--apply", action="store_true", help="disabled until candidate input lineage and projection readback are admitted")
    args = parser.parse_args()

    plan = {
        "schema": "atlas.latent-qdrant-projection-plan.v1",
        "status": "PROJECTION_BLOCKED",
        "reason": "CANDIDATE_TRAINING_INPUT_LINEAGE_AND_POSTGRES_READBACK_NOT_PROVEN",
        "candidateArchitectureRevision": "atlas.latent-ae.768-512-256-128.v2",
        "input": {"representation": "semantic_768", "column": "codebase_chunk_index.content_embedding_768", "dimensions": 768},
        "outputs": {
            "latent_256": {"dimensions": 256, "origin": "LEARNED_INTERMEDIATE"},
            "latent_128": {"dimensions": 128, "origin": "LEARNED_BOTTLENECK"},
            "latent_64": {"dimensions": 64, "origin": "NORMALIZED_PREFIX_OF_LATENT_128"},
            "topology4d": {"origin": "SEPARATE_REVISIONED_PROJECTION_FROM_LATENT_256"},
        },
        "postgresVectorContract": {
            "canonicalInput": {
                "table": "codebase_chunk_index",
                "column": "content_embedding_768",
                "pgType": "vector(768)",
                "drizzleBuilder": "vector",
                "dimensions": 768,
                "role": "CANONICAL_SEMANTIC_INPUT",
            },
            "derivedStorageDeclarations": {
                "latent_256": {"pgType": "halfvec(256)", "drizzleBuilder": "halfvec", "dimensions": 256},
                "latent_128": {"pgType": "halfvec(128)", "drizzleBuilder": "halfvec", "dimensions": 128},
                "latent_64": {"pgType": "vector(64)", "drizzleBuilder": "vector", "dimensions": 64},
            },
            "status": "DRIZZLE_DECLARATIONS_MATCH_VERIFIED_POSTGRES_TYPES; ROW_PROVENANCE_AND_WRITES_NOT_PROVEN",
            "migrationRequired": False,
        },
        "legacyCollection": {"name": COLLECTION_NAME, "vectorDimensions": 256, "candidateCompatible": False},
        "candidateCollection": {
            "name": CANDIDATE_COLLECTION_NAME,
            "revision": CANDIDATE_COLLECTION_REVISION,
            "serverVersion": "1.19.0",
            "status": "PLAN_ONLY_NOT_CREATED",
            "vectors": {
                name: {"size": dimensions, "distance": "Cosine"}
                for name, dimensions in CANDIDATE_VECTOR_DIMS.items()
            },
            "excludedOutputs": {"semantic_768": "canonical source lane, stored separately", "topology4d": "separate revisioned projection"},
        },
        "candidateVectorLayout": {
            "kind": "named_dense_vectors",
            "dimensions": CANDIDATE_VECTOR_DIMS,
            "collectionRevision": CANDIDATE_COLLECTION_REVISION,
        },
        "upsertContract": {
            "pointShape": "{id: projection_uuid, vector: all_three_named_vectors, payload: complete_payload_v3}",
            "operation": "QDRANT_POINTS_UPSERT",
            "updateMode": "UPSERT",
            "wait": True,
            "updateSemantics": "SAME_POINT_ID_IS_OVERWRITTEN; send all named vectors and the complete payload on every upsert",
            "targetCollection": CANDIDATE_COLLECTION_NAME,
            "targetCollectionCreated": False,
            "readbackRequired": ["projection_id", "canonical_id", "packet_key", "source_ref", "source_revision", "workspace_revision", "all_vector_dimensions", "all_vector_digests", "payload_checksum"],
            "executable": False,
            "blockedUntil": ["SEMANTIC_OWNER_PROVEN", "TRAINING_INPUT_LINEAGE_AND_CHECKPOINT_RECEIPT", "POSTGRES_CANDIDATE_ROW_READBACK", "STABLE_PROJECTION_ID_OWNER", "QDRANT_COLLECTION_LAYOUT_PREFLIGHT"],
        },
        "serializerStatus": "PURE_COMPLETE_POINT_BUILDER_DEFINED; APPLY_STILL_BLOCKED",
        "requiredPayload": [
            "canonical_id", "packet_key", "chunk_row_id", "projection_id", "source_ref",
            "source_revision", "workspace_revision", "source_digest", "semantic_input_digest",
            "input_representation", "input_dimensions", "canonical_input_column",
            "semantic_model_revision", "tokenizer_revision", "tokenizer_revision_status",
            "architecture_revision", "producer_revision", "training_receipt_digest",
            "training_input_snapshot_checksum", "representation_revisions",
            "representation_definitions", "vector_dimensions", "vector_digests",
            "checkpoint_digest", "projection_revision", "payload_checksum", "canonical_authority",
        ],
        "writes": {"postgres": False, "qdrant": False, "redisValkey": False},
        "qdrantServerVersion": {"status": "LIVE_READ_ONLY_VERSION_CHECKED_1.19.0", "composeDeclared": "1.19.0"},
    }
    print(json.dumps(plan, sort_keys=True))
    if args.apply:
        print(json.dumps({"event": "apply_rejected", "exitCode": 78, "reason": plan["reason"]}, sort_keys=True))
        raise SystemExit(78)
    return


if __name__ == "__main__":
    main()
