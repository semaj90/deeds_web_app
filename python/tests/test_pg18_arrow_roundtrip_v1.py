"""Integration tests for PG18 <-> Arrow IPC <-> ARPC <-> Rejoin round-trip."""

from __future__ import annotations

import pytest
from dataclasses import replace

from python.atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    decode_rpc_packet_v1,
    encode_rpc_packet_v1,
)
from python.atlas_graph_runtime.pg18_arrow_ipc_roundtrip_v1 import (
    build_frozen_feature_batch_ipc_v1,
    compute_filtered_topk_from_arrow_ipc_v1,
    extract_live_pg18_frozen_batch_v1,
    rejoin_and_verify_ordinals_v1,
)

WORKSPACE_REV = "74ac7d8983e"


def _sample_pg18_rows() -> list[dict]:
    return [
        {
            "candidate_uuid": "11111111-1111-4111-8111-111111111111",
            "source_revision": WORKSPACE_REV,
            "task_id": "task:001",
            "presence_mask": 0b1011,
            "feature_score": 0.42,
            "embedding": [0.1, 0.2, 0.3, 0.4],
        },
        {
            "candidate_uuid": "22222222-2222-4222-8222-222222222222",
            "source_revision": WORKSPACE_REV,
            "task_id": "task:002",
            "presence_mask": 0b1111,
            "feature_score": 0.91,
            "embedding": [0.5, 0.6, 0.7, 0.8],
        },
        {
            "candidate_uuid": "33333333-3333-4333-8333-333333333333",
            "source_revision": WORKSPACE_REV,
            "task_id": "task:003",
            "presence_mask": 0b0011,
            "feature_score": 0.77,
            "embedding": [0.2, 0.4, 0.6, 0.8],
        },
    ]


def test_pg18_arrow_ipc_roundtrip_preserves_ordinals_and_uuids():
    rows = _sample_pg18_rows()
    # Mask out ordinal 0 via lsb0 bitmask: only ordinals 1 and 2 are active
    bundle = build_frozen_feature_batch_ipc_v1(
        rows=rows,
        workspace_revision=WORKSPACE_REV,
        active_ordinals=[1, 2],
    )

    checksum, ws_rev, ranked, arpc_bytes = compute_filtered_topk_from_arrow_ipc_v1(
        bundle.ipc_bytes,
        bitmask_bytes=bundle.bitmask_bytes,
        top_k=2,
        compression="zlib",
    )

    assert checksum == bundle.snapshot_checksum
    assert ws_rev == WORKSPACE_REV
    # Ordinal 0 was masked out; ordinal 1 (0.91) ranks #1, ordinal 2 (0.77) ranks #2
    assert [o for o, _, _ in ranked] == [1, 2]
    assert [score for _, score, _ in ranked] == pytest.approx([0.91, 0.77])
    packet = decode_rpc_packet_v1(arpc_bytes)
    assert packet["canonical_authority"] is False
    assert all("verifiedClaim" not in row for row in packet["ranked_ordinals"])

    rejoined = rejoin_and_verify_ordinals_v1(
        expected_snapshot_checksum=bundle.snapshot_checksum,
        expected_workspace_revision=WORKSPACE_REV,
        ordinal_map=bundle.ordinal_map,
        bitmask_bytes=bundle.bitmask_bytes,
        arpc_bytes=arpc_bytes,
    )

    assert len(rejoined) == 2
    assert rejoined[0]["candidate_uuid"] == "22222222-2222-4222-8222-222222222222"
    assert rejoined[0]["rank"] == 1
    assert rejoined[1]["candidate_uuid"] == "33333333-3333-4333-8333-333333333333"
    assert rejoined[1]["rank"] == 2
    assert all(r["workspace_revision"] == WORKSPACE_REV for r in rejoined)


def test_live_pg18_shortcut_fails_closed_instead_of_synthesizing_identity_or_score():
    with pytest.raises(RuntimeError, match="PG18_QUALIFIED_CANDIDATE_QUERY_REQUIRED"):
        extract_live_pg18_frozen_batch_v1("unused", workspace_revision=WORKSPACE_REV)


def test_pg18_arrow_ipc_roundtrip_fails_closed_on_drift_and_orphans():
    bundle = build_frozen_feature_batch_ipc_v1(
        rows=_sample_pg18_rows(),
        workspace_revision=WORKSPACE_REV,
        active_ordinals=[0, 1, 2],
    )
    _, _, _, arpc_bytes = compute_filtered_topk_from_arrow_ipc_v1(
        bundle.ipc_bytes,
        bitmask_bytes=bundle.bitmask_bytes,
        top_k=3,
    )

    # 1. Snapshot checksum mismatch fails closed
    with pytest.raises(ValueError, match="SNAPSHOT_CHECKSUM_MISMATCH"):
        rejoin_and_verify_ordinals_v1(
            expected_snapshot_checksum="0" * 64,
            expected_workspace_revision=WORKSPACE_REV,
            ordinal_map=bundle.ordinal_map,
            bitmask_bytes=bundle.bitmask_bytes,
            arpc_bytes=arpc_bytes,
        )

    # 2. Workspace revision drift fails closed
    with pytest.raises(ValueError, match="WORKSPACE_REVISION_DRIFT"):
        rejoin_and_verify_ordinals_v1(
            expected_snapshot_checksum=bundle.snapshot_checksum,
            expected_workspace_revision="deadbeef",
            ordinal_map=bundle.ordinal_map,
            bitmask_bytes=bundle.bitmask_bytes,
            arpc_bytes=arpc_bytes,
        )

    # 3. Orphaned ordinal fails closed
    forged_arpc = encode_rpc_packet_v1(
        {
            "schema": "atlas.pg18-arrow-compute-result.v1",
            "workspace_revision": WORKSPACE_REV,
            "snapshot_checksum": bundle.snapshot_checksum,
            "ordinal_map_checksum": bundle.ordinal_map_checksum,
            "ranked_ordinals": [{"candidate_ordinal": 99, "score": 0.99, "rank": 1}],
        }
    )
    with pytest.raises(ValueError, match="ORPHANED_CANDIDATE_ORDINAL:99"):
        rejoin_and_verify_ordinals_v1(
            expected_snapshot_checksum=bundle.snapshot_checksum,
            expected_workspace_revision=WORKSPACE_REV,
            ordinal_map=bundle.ordinal_map,
            bitmask_bytes=bundle.bitmask_bytes,
            arpc_bytes=forged_arpc,
        )

    # Source revision and task identity are bound by the packet's ordinal-map checksum.
    changed_map = list(bundle.ordinal_map)
    changed_map[0] = replace(changed_map[0], source_revision="sha256:" + "f" * 64)
    with pytest.raises(ValueError, match="ORDINAL_MAP_IDENTITY_CHECKSUM_DRIFT"):
        rejoin_and_verify_ordinals_v1(
            expected_snapshot_checksum=bundle.snapshot_checksum,
            expected_workspace_revision=WORKSPACE_REV,
            ordinal_map=changed_map,
            bitmask_bytes=bundle.bitmask_bytes,
            arpc_bytes=arpc_bytes,
        )


def test_frozen_batch_rejects_duplicate_candidate_identity():
    rows = _sample_pg18_rows()
    rows[1]["candidate_uuid"] = rows[0]["candidate_uuid"]
    with pytest.raises(ValueError, match="FROZEN_BATCH_DUPLICATE_CANDIDATE_UUID"):
        build_frozen_feature_batch_ipc_v1(rows=rows, workspace_revision=WORKSPACE_REV)
