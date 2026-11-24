from __future__ import annotations

import sys
from pathlib import Path

import pytest

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.ace_bitfrost_caller_v1 import (
    build_pg18_scoped_readback_v1,
    canonical_sha256_hex,
    pack_cutile_ace_residency_key_v1,
    verify_manifest_row_v1,
)

WS_REV = "sha256:" + "a" * 64
SNAP_REV = "sha256:" + "b" * 64
ID_HEX = "c" * 64


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

    manifest = {"v1": {"requestId": "req-1", "snapshotId": "snap-1"}, "identityChecksum": ID_HEX}
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
