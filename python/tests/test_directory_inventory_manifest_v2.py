from __future__ import annotations

import hashlib
import json
from pathlib import Path

from atlas_compute.directory_inventory_manifest_v2 import (
    SCHEMA_ENRICHMENT_HINT_V2,
    SCHEMA_INVENTORY_MANIFEST_V2,
    build_inventory_manifest_and_hints_v2,
    compute_producer_revision_v2,
    resolve_admitted_workspace_revision_v2,
    verify_directory_hint_readback_v2,
)


def test_inventory_manifest_and_readback_verifier(tmp_path: Path) -> None:
    d = tmp_path / "src" / "pkg"
    d.mkdir(parents=True)
    f1 = d / "a.ts"
    f2 = d / "b.py"
    f1.write_bytes(b"export const x = 1;\n")
    f2.write_bytes(b"def y():\n    return 2\n")

    producer_rev = compute_producer_revision_v2([], {"scope": "unit-test"})
    manifest, hints = build_inventory_manifest_and_hints_v2(
        tmp_path,
        {"src/pkg": ["src/pkg/a.ts", "src/pkg/b.py"]},
        card_digest_by_dir={"src/pkg": "sha256:" + "d" * 64},
        producer_revision=producer_rev,
        embedding_representation_revision="eg2-onnx-q8:768:cos",
        workspace_revision=None,
    )

    assert manifest["schema"] == SCHEMA_INVENTORY_MANIFEST_V2
    assert len(hints) == 1
    hint = hints[0]
    assert hint["schema"] == SCHEMA_ENRICHMENT_HINT_V2
    assert hint["member_count"] == 2
    assert manifest["members"][0]["byteLength"] == len(b"export const x = 1;\n")
    assert manifest["members"][0]["sourceRevision"] == "sha256:" + hashlib.sha256(b"export const x = 1;\n").hexdigest()

    store = {manifest["inventoryManifestDigest"]: manifest}
    ok_proposal = verify_directory_hint_readback_v2(hint, store.get)
    assert ok_proposal["ok"] is True
    assert ok_proposal["status"] == "PROPOSAL_UNBOUND_LOCAL_WORKTREE"

    refused_admitted = verify_directory_hint_readback_v2(
        hint, store.get, require_admitted_workspace_revision=True
    )
    assert refused_admitted["ok"] is False
    assert refused_admitted["errorCode"] == "WORKSPACE_REVISION_UNBOUND"

    # Tampering a member byteLength must fail closed on inventory digest mismatch
    bad_manifest = json.loads(json.dumps(manifest))
    bad_manifest["members"][0]["byteLength"] += 1
    bad_res = verify_directory_hint_readback_v2(hint, lambda _: bad_manifest)
    assert bad_res["ok"] is False
    assert bad_res["errorCode"] == "INVENTORY_DIGEST_MISMATCH"


def test_admitted_workspace_revision_fails_closed_on_stale_receipt(tmp_path: Path) -> None:
    receipt = tmp_path / "frame.json"
    receipt.write_text(
        json.dumps(
            {
                "status": "EXECUTION_AUTHORITY_UNAVAILABLE",
                "admittedWorkspaceRevision": "sha256:" + "a" * 64,
                "cohortLineageWorkspaceRevisionMatchesSelector": False,
                "sourceAuthority": {"safeToPromote": False, "requiresSnapshotRefresh": True},
            }
        ),
        encoding="utf-8",
    )
    assert resolve_admitted_workspace_revision_v2(receipt) is None
