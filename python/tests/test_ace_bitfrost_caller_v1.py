from __future__ import annotations

import sys
from pathlib import Path

import pytest

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.ace_bitfrost_caller_v1 import (
    build_pg18_chunk_body_scoped_readback_v1,
    build_pg18_scoped_readback_v1,
    canonical_sha256_hex,
    pack_cutile_ace_residency_key_v1,
    verify_manifest_row_v1,
)

WS_REV = "sha256:" + "a" * 64
SNAP_REV = "sha256:" + "b" * 64
ID_HEX = "c" * 64
GRANT_REV = "sha256:" + "d" * 64


def test_cutile_ace_residency_key_and_fail_closed_gates() -> None:
    key1 = pack_cutile_ace_residency_key_v1(
        workspace_revision=WS_REV,
        candidate_snapshot_revision=SNAP_REV,
        identity_checksum=ID_HEX,
    )
    key2 = pack_cutile_ace_residency_key_v1(
        workspace_revision=WS_REV,
        candidate_snapshot_revision=SNAP_REV,
        identity_checksum=ID_HEX,
    )
    assert key1 == key2
    assert key1.startswith("ace:residency:hot_l1:")

    with pytest.raises(ValueError, match="INVALID_REVISION_FORMAT"):
        pack_cutile_ace_residency_key_v1(
            workspace_revision="bad",
            candidate_snapshot_revision=SNAP_REV,
            identity_checksum=ID_HEX,
        )

    manifest = {
        "schema": "atlas.context-manifest.v2",
        "v1": {"requestId": "req-1", "snapshotId": "snap-1"},
        "identityChecksum": ID_HEX,
    }
    good_row = {
        "identity_checksum": ID_HEX,
        "manifest_json": manifest,
        "manifest_payload_checksum": canonical_sha256_hex(manifest),
    }
    ok = verify_manifest_row_v1(good_row, ID_HEX, workspace_revision=WS_REV, candidate_snapshot_revision=SNAP_REV)
    assert ok.status == "VERIFIED"
    assert ok.residency_key == key1
    assert ok.canonical_authority is False
    assert ok.writes_performed is False

    tampered = {**good_row, "manifest_payload_checksum": "0" * 64}
    bad = verify_manifest_row_v1(tampered, ID_HEX, workspace_revision=WS_REV, candidate_snapshot_revision=SNAP_REV)
    assert bad.status == "BLOCKED"
    assert bad.reason == "PAYLOAD_CHECKSUM_MISMATCH"
    assert bad.residency_key is None

    missing = verify_manifest_row_v1(None, ID_HEX, workspace_revision=WS_REV, candidate_snapshot_revision=SNAP_REV)
    assert missing.status == "BLOCKED"
    assert missing.reason == "MANIFEST_NOT_FOUND"

    cb = build_pg18_scoped_readback_v1(workspace_revision=WS_REV, candidate_snapshot_revision=SNAP_REV)
    assert cb("not-a-sha256") is None


def test_pg18_chunk_body_scoped_readback_queries_chunk_index_and_fails_closed(monkeypatch) -> None:
    import hashlib
    import psycopg

    chunk_text = "export const guard = 'PG18 chunk body';"
    chunk_sha = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
    manifest = {
        "schema": "atlas.context-manifest.v2",
        "v1": {
            "requestId": "req-1",
            "snapshotId": "snap-1",
            "selectedNodeKeys": ["chunk-1"],
            "evidenceRefs": ["src/guard.ts"],
        },
        "identityChecksum": ID_HEX,
    }
    manifest_sha = canonical_sha256_hex(manifest)
    transaction_first_sql: list[str] = []

    class _FakeCursor:
        def __init__(self, mode: str) -> None:
            self.mode = mode
            self._rows = []
            self._has_statement = False

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql: str, params=()):
            if not self._has_statement:
                transaction_first_sql.append(sql.strip())
                self._has_statement = True
            if "atlas_context_manifest_v2_readbacks" in sql:
                self._rows = [(ID_HEX, manifest, manifest_sha)]
            elif "atlas_actor_workspace_source_grants_v1" in sql:
                if self.mode in ("unauthorized", "revoked"):
                    self._rows = []
                else:
                    assert params == ("actor-1", "00000000-0000-0000-0000-000000000001", GRANT_REV, WS_REV)
                    self._rows = [("repo-1", ["src/guard.ts"])]
            elif "codebase_chunk_index" in sql:
                assert "atlas_packet_chunk_lineage" in sql
                assert "atlas_workspace_source_bindings" in sql
                assert params[2] == "repo-1"
                assert params[3] == ["src/guard.ts"]
                good = ("chunk-1", "src/guard.ts", "sha256:" + "d" * 64, WS_REV,
                        chunk_text, chunk_sha, "e" * 64, "e" * 64, True,
                        ["src/guard.ts"], "EXACT_SINGLE_MEMBER", "PROVEN")
                if self.mode == "missing":
                    self._rows = []
                elif self.mode == "tampered":
                    self._rows = [(*good[:4], chunk_text + "!", *good[5:])]
                elif self.mode == "bad_digest":
                    self._rows = [(*good[:5], "0" * 64, *good[6:])]
                elif self.mode == "stale_workspace":
                    self._rows = [(*good[:3], "sha256:" + "f" * 64, *good[4:])]
                elif self.mode == "extra":
                    self._rows = [good, good]
                elif self.mode == "missing_hash":
                    self._rows = [(*good[:5], None, *good[6:])]
                elif self.mode == "out_of_scope":
                    self._rows = [(good[0], "src/other.ts", *good[2:])]
                else:
                    self._rows = [good]

        def fetchall(self):
            return self._rows

    class _FakeConn:
        def __init__(self, mode: str) -> None:
            self.mode = mode

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return _FakeCursor(self.mode)

    mode_box = {"mode": "ok"}
    monkeypatch.setattr(psycopg, "connect", lambda *a, **kw: _FakeConn(mode_box["mode"]))

    cb = build_pg18_chunk_body_scoped_readback_v1(
        actor_id="actor-1",
        workspace_id="00000000-0000-0000-0000-000000000001",
        actor_grant=GRANT_REV,
        workspace_revision=WS_REV,
        candidate_snapshot_revision=SNAP_REV,
        dsn="postgresql://fixture",
    )
    out = cb(ID_HEX)
    assert out is not None
    _, rows = out
    assert len(rows) == 1
    assert rows[0]["text"] == chunk_text
    assert rows[0]["chunkSha256"] == chunk_sha
    assert rows[0]["pgReadbackStatus"] == "PROVEN"
    assert rows[0]["lineageMembershipStatus"] == "EXACT_SINGLE_MEMBER"
    assert rows[0]["lineageRevisionStatus"] == "PROVEN"
    assert "admissionStatus" not in rows[0]
    assert transaction_first_sql[0] == "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"

    mode_box["mode"] = "missing"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "tampered"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "revoked"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "bad_digest"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "stale_workspace"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "extra"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "missing_hash"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "unauthorized"
    assert cb(ID_HEX) is None

    mode_box["mode"] = "out_of_scope"
    assert cb(ID_HEX) is None

    with pytest.raises(ValueError, match="WORKSPACE_ID_INVALID"):
        build_pg18_chunk_body_scoped_readback_v1(
            actor_id="actor-1",
            workspace_id="ws-1",
            actor_grant=GRANT_REV,
            workspace_revision=WS_REV,
            candidate_snapshot_revision=SNAP_REV,
            dsn="postgresql://fixture",
        )
