from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

SCHEMA_CALLER_V1 = "atlas.ace-bitfrost-caller.v1"
SHA256_HEX_RE = re.compile(r"^[a-f0-9]{64}$")


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
    if not isinstance(manifest_obj, dict):
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
