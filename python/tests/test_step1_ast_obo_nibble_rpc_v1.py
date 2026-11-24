"""Unit tests for Step 1 AST/rg/OBO -> Nibble Bitset + Mode-7 + ARPC + Arrow IPC bundle."""

from __future__ import annotations

import pytest

from python.atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import decode_rpc_packet_v1
from python.atlas_graph_runtime.pg18_arrow_ipc_roundtrip_v1 import (
    compute_filtered_topk_from_arrow_ipc_v1,
    rejoin_and_verify_ordinals_v1,
)
from python.atlas_graph_runtime.step1_ast_obo_nibble_rpc_v1 import (
    build_step1_obo_nibble_rpc_bundle_v1,
    pack_nibbles_v1,
    unpack_nibbles_v1,
)


def test_nibble_pack_unpack_roundtrip():
    vals = [0, 5, 10, 15, 7]
    packed = pack_nibbles_v1(vals)
    assert len(packed) == 3
    assert unpack_nibbles_v1(packed, len(vals)) == vals


def test_step1_ast_obo_nibble_rpc_and_arrow_roundtrip():
    src = b"export function trainPolicyReranker() { return 1; }\n"
    cu_src = b"__global__ void warpTileKernel() {}\n"
    extractions = [
        {
            "source_ref": "sveltekit-frontend/src/lib/gpu/hypergraph-vertex-client.ts",
            "symbol_name": "streamHypergraphVerticesToWorker",
            "symbol_kind": "function",
            "domain_id": "ATLASDOM:gpu_compute",
            "source_bytes": src,
            "start_byte": 7,
            "end_byte": 37,
            "score": 0.92,
            "active": True,
            "tile_u": 1.0,
            "tile_v": 2.0,
        },
        {
            "source_ref": "kernels/warp_tile.cu",
            "symbol_name": "warpTileKernel",
            "symbol_kind": "cuda_kernel",
            "domain_id": "ATLASDOM:gpu_compute",
            "source_bytes": cu_src,
            "start_byte": 11,
            "end_byte": 30,
            "score": 0.60,
            "active": True,
            "tile_u": 2.0,
            "tile_v": 3.0,
        },
        {
            "source_ref": "sveltekit-frontend/src/lib/components/ui/TypewriterPrompt.svelte",
            "symbol_name": "TypewriterPrompt",
            "symbol_kind": "svelte_component",
            "domain_id": "ATLASDOM:ui",
            "score": 0.25,
            "active": False,  # masked out in lsb0 bitmask
            "tile_u": 3.0,
            "tile_v": 4.0,
        },
    ]

    bundle = build_step1_obo_nibble_rpc_bundle_v1(
        extractions=extractions,
        workspace_revision="74ac7d8983e",
        mode7_affine=(2.0, 0.0, 10.0, 0.0, 2.0, -4.0),
    )

    assert bundle.canonical_authority is False
    assert bundle.lod_tiers == ("LOD_1_5", "LOD_6_14", "LOD_15_20")
    assert bundle.mode7_world_coords[0] == (12.0, 0.0)
    assert unpack_nibbles_v1(bundle.nibble_bytes, 3) == [14, 9, 4]

    # Verify ARPC packet decodes cleanly
    decoded_rpc = decode_rpc_packet_v1(bundle.arpc_packet_bytes)
    assert decoded_rpc["schema"] == "atlas.step1-obo-nibble-rpc.v1"
    assert decoded_rpc["tuples"][1]["lang_id"] == "ATLASLANG:cuda_cpp"

    # Verify Arrow IPC + lsb0 bitmask + PUCT + 1:1 rejoin roundtrip
    chk, rev, ranked, res_arpc = compute_filtered_topk_from_arrow_ipc_v1(
        bundle.arrow_bundle.ipc_bytes,
        bitmask_bytes=bundle.bitmask_bytes,
        top_k=5,
    )
    # Ordinal 2 was active=False so only ordinals 0 and 1 survive
    assert [o for o, _, _ in ranked] == [0, 1]
    rejoined = rejoin_and_verify_ordinals_v1(
        expected_snapshot_checksum=chk,
        expected_workspace_revision=rev,
        ordinal_map=bundle.arrow_bundle.ordinal_map,
        bitmask_bytes=bundle.bitmask_bytes,
        arpc_bytes=res_arpc,
    )
    assert len(rejoined) == 2
