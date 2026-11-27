from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

SCHEMA_CALLER_V1 = "atlas.ace-bitfrost-caller.v1"
SHA256_HEX_RE = re.compile(r"^[a-f0-9]{64}$")
REV_SHA256_RE = re.compile(r"^sha256:[a-f0-9]{64}$")


def canonical_sha256_hex(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def pack_cutile_ace_residency_key_v1(
    *,
    workspace_revision: str,
    candidate_snapshot_revision: str,
    identity_checksum: str,
    tier: str = "HOT_L1",
) -> str:
    """Deterministic CUTILE-ACE-01 residency key packing without persisting hidden state or tensors."""
    if not workspace_revision.startswith("sha256:") or not candidate_snapshot_revision.startswith("sha256:"):
        raise ValueError("INVALID_REVISION_FORMAT")
    if not SHA256_HEX_RE.match(identity_checksum):
        raise ValueError("IDENTITY_CHECKSUM_INVALID")
    digest = hashlib.sha256(
        f"cutile-ace-01|{tier}|{workspace_revision}|{candidate_snapshot_revision}|{identity_checksum}".encode("utf-8")
    ).hexdigest()
    return f"ace:residency:{tier.lower()}:{digest[:32]}"


@dataclass(frozen=True)
class AceBitfrostReadbackResultV1:
    schema: str
    status: str
    reason: Optional[str]
    identity_checksum: Optional[str]
    payload_checksum: Optional[str]
    residency_key: Optional[str]
    canonical_authority: bool
    writes_performed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def verify_manifest_row_v1(
    row: Optional[dict[str, Any]],
    expected_identity_checksum: str,
    *,
    workspace_revision: str,
    candidate_snapshot_revision: str,
) -> AceBitfrostReadbackResultV1:
    if not SHA256_HEX_RE.match(expected_identity_checksum):
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="IDENTITY_CHECKSUM_INVALID",
            identity_checksum=None,
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    if row is None:
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="MANIFEST_NOT_FOUND",
            identity_checksum=expected_identity_checksum,
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    if row.get("identity_checksum") != expected_identity_checksum:
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="IDENTITY_CHECKSUM_MISMATCH",
            identity_checksum=row.get("identity_checksum"),
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    manifest_obj = row.get("manifest_json")
    if (
        not isinstance(manifest_obj, dict)
        or manifest_obj.get("schema") != "atlas.context-manifest.v2"
        or manifest_obj.get("identityChecksum") != expected_identity_checksum
    ):
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="MANIFEST_PAYLOAD_INVALID",
            identity_checksum=expected_identity_checksum,
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    computed_payload = canonical_sha256_hex(manifest_obj)
    stored_payload = str(row.get("manifest_payload_checksum") or "")
    if computed_payload != stored_payload:
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="PAYLOAD_CHECKSUM_MISMATCH",
            identity_checksum=expected_identity_checksum,
            payload_checksum=stored_payload,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    residency_key = pack_cutile_ace_residency_key_v1(
        workspace_revision=workspace_revision,
        candidate_snapshot_revision=candidate_snapshot_revision,
        identity_checksum=expected_identity_checksum,
    )
    return AceBitfrostReadbackResultV1(
        schema=SCHEMA_CALLER_V1,
        status="VERIFIED",
        reason=None,
        identity_checksum=expected_identity_checksum,
        payload_checksum=computed_payload,
        residency_key=residency_key,
        canonical_authority=False,
        writes_performed=False,
    )


def read_context_manifest_v2_readonly_v1(
    identity_checksum: str,
    *,
    workspace_revision: str,
    candidate_snapshot_revision: str,
    dsn: Optional[str] = None,
) -> AceBitfrostReadbackResultV1:
    if not SHA256_HEX_RE.match(identity_checksum):
        return verify_manifest_row_v1(
            None,
            identity_checksum,
            workspace_revision=workspace_revision,
            candidate_snapshot_revision=candidate_snapshot_revision,
        )
    import psycopg

    db_url = dsn or os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
    try:
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT identity_checksum, manifest_json, manifest_payload_checksum
                    FROM public.atlas_context_manifest_v2_readbacks
                    WHERE identity_checksum = %s
                    """,
                    (identity_checksum,),
                )
                rows = cur.fetchall()
    except Exception:
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="MANIFEST_READBACK_OWNER_UNAVAILABLE",
            identity_checksum=identity_checksum,
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    if len(rows) > 1:
        return AceBitfrostReadbackResultV1(
            schema=SCHEMA_CALLER_V1,
            status="BLOCKED",
            reason="IDENTITY_CHECKSUM_AMBIGUOUS",
            identity_checksum=identity_checksum,
            payload_checksum=None,
            residency_key=None,
            canonical_authority=False,
            writes_performed=False,
        )
    row = (
        {
            "identity_checksum": rows[0][0],
            "manifest_json": rows[0][1],
            "manifest_payload_checksum": rows[0][2],
        }
        if rows
        else None
    )
    return verify_manifest_row_v1(
        row,
        identity_checksum,
        workspace_revision=workspace_revision,
        candidate_snapshot_revision=candidate_snapshot_revision,
    )


def build_pg18_scoped_readback_v1(
    *,
    workspace_revision: str,
    candidate_snapshot_revision: str,
    dsn: Optional[str] = None,
):
    """Return a fail-closed `scoped_readback(checksum)` callback for `dspy_predict_ace_recommender_v1`."""
    import psycopg

    db_url = dsn or os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")

    def _scoped_readback(checksum: str) -> Optional[tuple[dict[str, Any], list[dict[str, Any]]]]:
        if not SHA256_HEX_RE.match(checksum):
            return None
        try:
            with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                    cur.execute(
                        """
                        SELECT identity_checksum, manifest_json, manifest_payload_checksum
                        FROM public.atlas_context_manifest_v2_readbacks
                        WHERE identity_checksum = %s
                        """,
                        (checksum,),
                    )
                    rows = cur.fetchall()
                    if len(rows) != 1:
                        return None
                    row_dict = {
                        "identity_checksum": rows[0][0],
                        "manifest_json": rows[0][1],
                        "manifest_payload_checksum": rows[0][2],
                    }
                    verified = verify_manifest_row_v1(
                        row_dict,
                        checksum,
                        workspace_revision=workspace_revision,
                        candidate_snapshot_revision=candidate_snapshot_revision,
                    )
                    if verified.status != "VERIFIED":
                        return None
                    manifest_obj = row_dict["manifest_json"]
                    v1 = manifest_obj.get("v1") if isinstance(manifest_obj, dict) else None
                    selected = v1.get("selectedNodeKeys") if isinstance(v1, dict) else None
                    if not isinstance(selected, list) or not selected:
                        return None
                    cur.execute(
                        """
                        SELECT packet_key, source_ref, source_revision, coalesce(summary, '')
                        FROM atlas_packets
                        WHERE packet_key = ANY(%s)
                        ORDER BY packet_key
                        """,
                        ([str(k) for k in selected],),
                    )
                    records = [
                        {
                            "chunkId": r[0],
                            "manifestNodeKey": r[0],
                            "sourceRef": r[1],
                            "sourceRevision": r[2],
                            "text": r[3],
                            "residencyKey": verified.residency_key,
                        }
                        for r in cur.fetchall()
                    ]
                    return (manifest_obj, records) if records else None
        except Exception:
            return None

    return _scoped_readback


def build_pg18_chunk_body_scoped_readback_v1(
    *,
    actor_id: str,
    workspace_id: str,
    actor_grant: str,
    workspace_revision: str,
    candidate_snapshot_revision: str,
    dsn: Optional[str] = None,
):
    """Read selected code chunks from one read-only PG snapshot and verify canonical lineage."""
    import psycopg

    if not actor_id or not actor_id.strip():
        raise ValueError("ACTOR_ID_REQUIRED")
    if not workspace_id or not workspace_id.strip():
        raise ValueError("WORKSPACE_ID_REQUIRED")
    try:
        workspace_id = str(uuid.UUID(workspace_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError("WORKSPACE_ID_INVALID") from error
    if not REV_SHA256_RE.match(actor_grant):
        raise ValueError("ACTOR_GRANT_REVISION_INVALID")
    if not REV_SHA256_RE.match(workspace_revision) or not REV_SHA256_RE.match(candidate_snapshot_revision):
        raise ValueError("INVALID_REVISION_FORMAT")

    db_url = dsn or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL_REQUIRED")

    def _scoped_readback(checksum: str) -> Optional[tuple[dict[str, Any], list[dict[str, Any]]]]:
        if not SHA256_HEX_RE.match(checksum):
            return None
        try:
            with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                    cur.execute(
                        """
                        SELECT identity_checksum, manifest_json, manifest_payload_checksum
                        FROM public.atlas_context_manifest_v2_readbacks
                        WHERE identity_checksum = %s
                        """,
                        (checksum,),
                    )
                    manifest_rows = cur.fetchall()
                    if len(manifest_rows) != 1:
                        return None
                    row_dict = {
                        "identity_checksum": manifest_rows[0][0],
                        "manifest_json": manifest_rows[0][1],
                        "manifest_payload_checksum": manifest_rows[0][2],
                    }
                    verified = verify_manifest_row_v1(
                        row_dict,
                        checksum,
                        workspace_revision=workspace_revision,
                        candidate_snapshot_revision=candidate_snapshot_revision,
                    )
                    if verified.status != "VERIFIED":
                        return None
                    manifest_obj = row_dict["manifest_json"]
                    v1 = manifest_obj.get("v1") if isinstance(manifest_obj, dict) else None
                    selected = (v1.get("selectedChunkIds") or v1.get("selectedNodeKeys")) if isinstance(v1, dict) else None
                    if not isinstance(selected, list) or not selected:
                        return None
                    requested_ids = [str(k) for k in selected]
                    if len(requested_ids) != len(set(requested_ids)) or any(not item for item in requested_ids):
                        return None
                    cur.execute(
                        """
                        SELECT repository_id, permitted_source_refs
                        FROM public.atlas_actor_workspace_source_grants_v1
                        WHERE actor_id = %s
                          AND workspace_id = %s
                          AND grant_revision = %s
                          AND workspace_revision = %s
                          AND status = 'GRANTED'
                          AND revoked_at IS NULL
                          AND (expires_at IS NULL OR expires_at > now())
                        """,
                        (actor_id, workspace_id, actor_grant, workspace_revision),
                    )
                    grant_rows = cur.fetchall()
                    if (len(grant_rows) != 1
                            or not isinstance(grant_rows[0][0], str)
                            or not isinstance(grant_rows[0][1], (list, tuple))):
                        return None
                    repository_id = grant_rows[0][0]
                    permitted_source_refs = {ref for ref in grant_rows[0][1] if isinstance(ref, str) and ref}
                    if not permitted_source_refs:
                        return None
                    cur.execute(
                        """
                        SELECT c.chunk_id, l.source_ref, l.source_revision,
                               b.workspace_revision, c.content, c.content_hash,
                               c.file_content_hash, b.content_digest, c.embedding_eligible,
                               l.evidence_refs, l.membership_status, l.revision_status
                        FROM unnest(%s::text[]) AS selected(chunk_id)
                        JOIN public.codebase_chunk_index c
                          ON c.chunk_id = selected.chunk_id
                        JOIN public.atlas_packet_chunk_lineage l
                          ON l.chunk_row_id = c.id
                         AND l.canonical_chunk_id = c.chunk_id
                         AND l.source_ref = c.source_ref
                         AND l.revision_status = 'PROVEN'
                         AND l.membership_status IN ('EXACT_SINGLE_MEMBER', 'EXACT_MULTI_MEMBER')
                        JOIN public.atlas_workspace_source_bindings b
                          ON b.canonical_source_ref = l.source_ref
                         AND b.workspace_revision = %s
                         AND b.source_revision = l.source_revision
                         AND b.repo_id = %s
                         AND b.content_digest = c.file_content_hash
                        WHERE l.source_ref = ANY(%s::text[])
                        ORDER BY c.chunk_id
                        """,
                        (requested_ids, workspace_revision, repository_id, sorted(permitted_source_refs)),
                    )
                    fetched = cur.fetchall()
                    if len(fetched) != len(set(requested_ids)):
                        return None
                    records: list[dict[str, Any]] = []
                    seen_ids: set[str] = set()
                    manifest_ev_refs = v1.get("evidenceRefs")
                    if not isinstance(manifest_ev_refs, list) or any(not isinstance(ref, str) for ref in manifest_ev_refs):
                        return None
                    manifest_ev_ref_set = set(manifest_ev_refs)
                    observed_ev_refs: set[str] = set()
                    for (chunk_id, source_ref, src_rev, ws_rev, content, content_hash,
                         file_content_hash, binding_content_digest, eligible, evidence_refs,
                         membership_status, revision_status) in fetched:
                        if not isinstance(chunk_id, str) or chunk_id in seen_ids:
                            return None
                        seen_ids.add(chunk_id)
                        if not isinstance(source_ref, str) or source_ref not in permitted_source_refs:
                            return None
                        if not eligible or not isinstance(content, str) or not content:
                            return None
                        if not isinstance(src_rev, str) or not REV_SHA256_RE.match(src_rev):
                            return None
                        if ws_rev != workspace_revision:
                            return None
                        computed_sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
                        if (not isinstance(content_hash, str)
                                or not SHA256_HEX_RE.match(content_hash)
                                or computed_sha != content_hash):
                            return None
                        if (not isinstance(file_content_hash, str)
                                or not isinstance(binding_content_digest, str)
                                or file_content_hash != binding_content_digest
                                or not SHA256_HEX_RE.match(binding_content_digest)):
                            return None
                        if (revision_status != "PROVEN"
                                or membership_status not in ("EXACT_SINGLE_MEMBER", "EXACT_MULTI_MEMBER")
                                or not isinstance(evidence_refs, (list, tuple))):
                            return None
                        row_ev_refs = sorted({ref for ref in evidence_refs if isinstance(ref, str) and ref})
                        if not row_ev_refs or any(ref not in manifest_ev_ref_set for ref in row_ev_refs):
                            return None
                        observed_ev_refs.update(row_ev_refs)
                        records.append(
                            {
                                "chunkId": chunk_id,
                                "manifestNodeKey": chunk_id,
                                "sourceRef": source_ref,
                                "sourceRevision": src_rev,
                                "workspaceRevision": ws_rev,
                                "workspaceId": workspace_id,
                                "actorGrantRevision": actor_grant,
                                "text": content,
                                "chunkSha256": computed_sha,
                                "pgReadbackStatus": "PROVEN",
                                "lineageMembershipStatus": membership_status,
                                "lineageRevisionStatus": revision_status,
                                "evidenceRefs": row_ev_refs,
                                "residencyKey": verified.residency_key,
                            }
                        )
                    if seen_ids != set(requested_ids) or observed_ev_refs != manifest_ev_ref_set:
                        return None
                    return (manifest_obj, records) if records else None
        except Exception:
            return None

    return _scoped_readback
