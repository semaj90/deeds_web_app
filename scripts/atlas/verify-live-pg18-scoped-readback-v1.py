"""Live PG18 Step 2 / Stage 4 proof: 1 scoped test grant + build_pg18_chunk_body_scoped_readback_v1 (self-cleaning)."""

from __future__ import annotations

import hashlib
import json
import pathlib
import uuid
import psycopg

from python.atlas_graph_runtime.ace_bitfrost_caller_v1 import (
    build_pg18_chunk_body_scoped_readback_v1,
    canonical_sha256_hex,
)

WORKSPACE_ID = "625743d2-092b-4fa8-abe0-9dc094920c80"
ACTOR_ID = "atlas-step2-smoke-actor"
CHUNK_ID = "fullrepo:docs/PHASE-85-P9-LANGEXTRACT-AGENTIC-INTEGRATION.md:0"
SOURCE_REF = "docs/PHASE-85-P9-LANGEXTRACT-AGENTIC-INTEGRATION.md"
WS_REV = "sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c"
SNAP_REV = "sha256:e84b63089f3a5abf1eb8c5ae3896694e6d1eb3fbd40403d02fb49690f32084d6"
REPO_ID = "deeds-web-app"
EVIDENCE_REFS = [
    "docs/reports/pkt-lineage-09-fresh-classification-v1.json",
    "docs/reports/pkt-lineage-09-frozen-proposal-v1.json",
]


def _load_dsn() -> str:
    p = pathlib.Path(".env") if pathlib.Path(".env").exists() else pathlib.Path("sveltekit-frontend/.env")
    return [l.split("=", 1)[1].strip().strip("\"'") for l in p.read_text().splitlines() if l.strip().startswith("DATABASE_URL=")][0]


def main() -> None:
    dsn = _load_dsn()
    run_tag = uuid.uuid4().hex[:12]
    grant_rev = f"sha256:{hashlib.sha256(f'grant:{run_tag}'.encode()).hexdigest()}"
    id_hex = hashlib.sha256(f"manifest:{run_tag}".encode()).hexdigest()

    manifest = {
        "schema": "atlas.context-manifest.v2",
        "v1": {
            "requestId": f"step2-smoke-{run_tag}",
            "snapshotId": SNAP_REV,
            "selectedNodeKeys": [CHUNK_ID],
            "evidenceRefs": EVIDENCE_REFS,
        },
        "identityChecksum": id_hex,
    }
    manifest_sha = canonical_sha256_hex(manifest)
    orig_chunk_hash_state = None

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT content, content_hash, content_hash_scope, content_hash_algorithm, content_hash_length, content_hash_version
                    FROM public.codebase_chunk_index
                    WHERE chunk_id = %s
                    """,
                    (CHUNK_ID,),
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError(f"TARGET_CHUNK_NOT_FOUND:{CHUNK_ID}")
                content_text, orig_ch, orig_scope, orig_alg, orig_len, orig_ver = row
                orig_chunk_hash_state = (orig_ch, orig_scope, orig_alg, orig_len, orig_ver)
                utf8_sha = hashlib.sha256(content_text.encode("utf-8")).hexdigest()

                cur.execute(
                    """
                    UPDATE public.codebase_chunk_index
                    SET content_hash = %s,
                        content_hash_scope = 'chunk',
                        content_hash_algorithm = 'sha256',
                        content_hash_length = 64,
                        content_hash_version = 1
                    WHERE chunk_id = %s
                    """,
                    (utf8_sha, CHUNK_ID),
                )
                cur.execute(
                    """
                    INSERT INTO public.atlas_actor_workspace_source_grants_v1
                      (actor_id, workspace_id, workspace_revision, repository_id, permitted_source_refs, grant_revision, status, issued_by)
                    VALUES (%s, %s::uuid, %s, %s, %s, %s, 'GRANTED', 'step2-smoke')
                    """,
                    (ACTOR_ID, WORKSPACE_ID, WS_REV, REPO_ID, [SOURCE_REF], grant_rev),
                )
                cur.execute(
                    """
                    INSERT INTO public.atlas_context_manifest_v2_readbacks
                      (identity_checksum, request_id, snapshot_id, manifest_json, manifest_payload_checksum)
                    VALUES (%s, %s, %s, %s::jsonb, %s)
                    """,
                    (id_hex, f"step2-smoke-{run_tag}", SNAP_REV, json.dumps(manifest), manifest_sha),
                )
            conn.commit()

        cb_ok = build_pg18_chunk_body_scoped_readback_v1(
            actor_id=ACTOR_ID,
            workspace_id=WORKSPACE_ID,
            actor_grant=grant_rev,
            workspace_revision=WS_REV,
            candidate_snapshot_revision=SNAP_REV,
            dsn=dsn,
        )
        out_ok = cb_ok(id_hex)
        if out_ok is None:
            raise RuntimeError("LIVE_PG18_SCOPED_READBACK_RETURNED_NONE")
        _, records = out_ok
        if len(records) != 1 or records[0]["pgReadbackStatus"] != "PROVEN":
            raise RuntimeError(f"LIVE_PG18_SCOPED_READBACK_UNEXPECTED:{records}")

        cb_denied = build_pg18_chunk_body_scoped_readback_v1(
            actor_id="unauthorized-actor",
            workspace_id=WORKSPACE_ID,
            actor_grant=grant_rev,
            workspace_revision=WS_REV,
            candidate_snapshot_revision=SNAP_REV,
            dsn=dsn,
        )
        if cb_denied(id_hex) is not None:
            raise RuntimeError("FAIL_CLOSED_VIOLATION_UNAUTHORIZED_ACTOR_READ_SUCCEEDED")

        rec = records[0]
        receipt = {
            "schema": "atlas.pg18-scoped-readback-live-receipt.v1",
            "status": "PROVEN",
            "workspaceId": WORKSPACE_ID,
            "workspaceRevision": WS_REV,
            "chunkId": rec["chunkId"],
            "sourceRef": rec["sourceRef"],
            "chunkSha256": rec["chunkSha256"],
            "textBytes": len(rec["text"].encode("utf-8")),
            "lineageMembershipStatus": rec["lineageMembershipStatus"],
            "lineageRevisionStatus": rec["lineageRevisionStatus"],
            "unauthorizedActorBlocked": True,
            "cleanedUp": True,
        }
        out_path = pathlib.Path(".tmp/atlas/pg18-scoped-readback-live-receipt-v1.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2))
    finally:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                if orig_chunk_hash_state is not None:
                    cur.execute(
                        """
                        UPDATE public.codebase_chunk_index
                        SET content_hash = %s,
                            content_hash_scope = %s,
                            content_hash_algorithm = %s,
                            content_hash_length = %s,
                            content_hash_version = %s
                        WHERE chunk_id = %s
                        """,
                        (*orig_chunk_hash_state, CHUNK_ID),
                    )
                cur.execute("DELETE FROM public.atlas_context_manifest_v2_readbacks WHERE identity_checksum = %s", (id_hex,))
                cur.execute("DELETE FROM public.atlas_actor_workspace_source_grants_v1 WHERE grant_revision = %s", (grant_rev,))
            conn.commit()


if __name__ == "__main__":
    main()
