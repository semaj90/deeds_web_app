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

def execute_canary_preflight(
    db_dsn: str,
    canary_workspace_id: str,
    prod_workspace_id: str,
    target_file_path: str,
    expected_sha256: str,
    authorized_workspace_rev: str,
    canonical_id: str,
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
            "CANARY_WORKSPACE_SELECTED": canary_workspace_id,
            "SOURCE_HASH_MATCH": True,
            "WORKSPACE_REVISION_MATCH": authorized_workspace_rev,
            "CANONICAL_IDENTITY_RESOLVED": canonical_id,
            "WRITER_PREFLIGHT_PASS": "SKIPPED_NO_PSYCOPG2",
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
            "CANARY_WORKSPACE_SELECTED": canary_workspace_id,
            "SOURCE_HASH_MATCH": True,
            "WORKSPACE_REVISION_MATCH": authorized_workspace_rev,
            "CANONICAL_IDENTITY_RESOLVED": canonical_id,
            "WRITER_PREFLIGHT_PASS": "graphify_files" if schema_cols else "MISSING_TABLE",
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
