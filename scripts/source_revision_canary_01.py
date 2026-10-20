# scripts/source_revision_canary_01.py
import hashlib
import json
import os
import sys
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

@dataclass(frozen=True)
class TaskEvidenceHandoffV1:
    schema: str
    taskId: str
    taskSourceRef: str
    taskSourceRevision: str
    workspaceRevision: str
    canonicalId: str
    packetKey: str
    evidenceRefs: List[str]
    admissionReceiptId: str
    contextManifestChecksum: str
    actionProposalId: Optional[str] = None
    actionExecutionId: Optional[str] = None
    verificationReceiptIds: Optional[List[str]] = None

def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def compare_graphify_file_readback(
    rows: List[Dict[str, Any]],
    workspace_id: str,
    workspace_revision: str,
    source_ref: str,
    source_sha256: str,
    byte_length: int,
) -> Dict[str, Any]:
    identity_rows = [
        row for row in rows
        if str(row.get("workspace_id")) == str(workspace_id)
        and str(row.get("source_ref")) == source_ref
    ]
    reasons: List[str] = []
    if not identity_rows:
        reasons.append("SOURCE_ROW_NOT_FOUND")
    elif len(identity_rows) != 1:
        reasons.append("SOURCE_ROW_AMBIGUOUS")
    else:
        row = identity_rows[0]
        if str(row.get("workspace_revision")) != workspace_revision:
            reasons.append("WORKSPACE_REVISION_ROW_MISMATCH")
        if str(row.get("code_source_revision")) != f"sha256:{source_sha256}":
            reasons.append("SOURCE_REVISION_ROW_MISMATCH")
        content_hash = str(row.get("content_hash") or "").strip().lower()
        if content_hash.removeprefix("sha256:") != source_sha256.lower():
            reasons.append("CONTENT_HASH_ROW_MISMATCH")
        try:
            row_byte_length = int(row.get("byte_length"))
        except (TypeError, ValueError):
            row_byte_length = -1
        if row_byte_length != byte_length:
            reasons.append("BYTE_LENGTH_ROW_MISMATCH")

    return {
        "SOURCE_ROW_MATCHED": not reasons,
        "WORKSPACE_REVISION_ROW_MATCHED": (
            len(identity_rows) == 1
            and not any(reason.startswith("WORKSPACE_REVISION") for reason in reasons)
        ),
        "READBACK_REASONS": reasons,
    }

def execute_canary_preflight(
    db_dsn: str,
    canary_workspace_id: str,
    prod_workspace_id: str,
    target_file_path: str,
    expected_sha256: str,
    authorized_workspace_rev: str,
    canonical_id: str,
    source_ref: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Dict[str, Any]:
    if canary_workspace_id == prod_workspace_id:
        raise PermissionError("ABORT: Canary workspace cannot equal production workspace.")

    if not os.path.exists(target_file_path):
        raise FileNotFoundError(f"Target file not found: {target_file_path}")

    actual_sha256 = compute_sha256(target_file_path)
    if actual_sha256 != expected_sha256:
        raise ValueError(f"SOURCE_HASH_MATCH failed: {actual_sha256} != {expected_sha256}")

    if psycopg2 is None:
        return {
            "CANARY_WORKSPACE_CLAIM": canary_workspace_id,
            "SOURCE_HASH_MATCH": True,
            "SOURCE_CONTENT_HASH": f"sha256:{actual_sha256}",
            "WORKSPACE_REVISION_CLAIM": authorized_workspace_rev,
            "WORKSPACE_REVISION_VERIFIED": False,
            "SOURCE_ROW_MATCHED": False,
            "WORKSPACE_REVISION_ROW_MATCHED": False,
            "READBACK_REASONS": ["DATABASE_UNAVAILABLE"],
            "CANONICAL_IDENTITY_CLAIM": canonical_id,
            "CANONICAL_IDENTITY_RESOLVED": False,
            "WRITER_PREFLIGHT_PASS": "NOT_CHECKED_NO_PSYCOPG2",
            "databaseRead": False,
            "writesPerformed": False,
            "schema_columns": {},
        }

    conn = psycopg2.connect(db_dsn)
    try:
        # 1. Read-Only Schema & Identity Inspection
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SET TRANSACTION READ ONLY;")
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = 'graphify_files'
                ORDER BY ordinal_position;
            """)
            schema_cols = {r["column_name"]: r["data_type"] for r in cur.fetchall()}
        conn.rollback()

        return {
            "CANARY_WORKSPACE_CLAIM": canary_workspace_id,
            "SOURCE_HASH_MATCH": True,
            "SOURCE_CONTENT_HASH": f"sha256:{actual_sha256}",
            "WORKSPACE_REVISION_CLAIM": authorized_workspace_rev,
            "WORKSPACE_REVISION_VERIFIED": False,
            "CANONICAL_IDENTITY_CLAIM": canonical_id,
            "CANONICAL_IDENTITY_RESOLVED": False,
            "WRITER_PREFLIGHT_PASS": "SCHEMA_ONLY_NOT_CHECKED" if schema_cols else "MISSING_TABLE",
            "databaseRead": True,
            "writesPerformed": False,
            "schema_columns": schema_cols,
        }
    finally:
        conn.close()

if __name__ == "__main__":
    target = os.path.join(os.getcwd(), "tasks.md")
    if os.path.exists(target):
        digest = compute_sha256(target)
        print(f"tasks.md SHA-256: {digest}")
    print("source_revision_canary_01 loaded successfully.")
