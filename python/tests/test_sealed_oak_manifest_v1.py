"""Unit tests for Sealed ContextManifest + OaK kernel handoff builder."""
from __future__ import annotations

import pytest

from atlas_graph_runtime.sealed_oak_manifest_v1 import (
    build_sealed_oak_manifest_v1,
    verify_sealed_oak_manifest_v1,
)


def test_build_and_verify_sealed_oak_manifest_v1() -> None:
    manifest = build_sealed_oak_manifest_v1(
        task_id="task-oak-001",
        source_refs=["src/lib/server/db/migrate.ts", "docs/atlas/db-schema-migration-guidelines.md"],
        source_revision="git:abc1234",
        workspace_revision="ws:rev-42",
        graph_snapshot_revision="graph:snap-7",
        allowed_oak_ops=["lookup", "search"],
        prefill_hits=[{"chunkId": "c1", "relativePath": "src/lib/server/db/migrate.ts", "cosineSimilarity": 0.81}],
    )
    assert manifest["canonicalAuthority"] is False
    assert manifest["writesPerformed"] is False
    assert manifest["hiddenStatePersisted"] is False
    assert manifest["manifestChecksum"].startswith("sha256:")
    assert verify_sealed_oak_manifest_v1(manifest) is True

    tampered = {**manifest, "sourceRefs": ["evil.ts"]}
    assert verify_sealed_oak_manifest_v1(tampered) is False


def test_sealed_oak_manifest_fails_closed_on_missing_revision_or_mutation_op() -> None:
    with pytest.raises(ValueError, match="MANIFEST_REVISION_MISSING"):
        build_sealed_oak_manifest_v1(
            task_id="task-oak-002",
            source_refs=["a.ts"],
            source_revision="",
            workspace_revision="ws:1",
            graph_snapshot_revision="graph:1",
        )

    with pytest.raises(ValueError, match="MANIFEST_OAK_OP_NOT_ALLOWLISTED"):
        build_sealed_oak_manifest_v1(
            task_id="task-oak-003",
            source_refs=["a.ts"],
            source_revision="git:1",
            workspace_revision="ws:1",
            graph_snapshot_revision="graph:1",
            allowed_oak_ops=["lookup", "admit_edge"],
        )
