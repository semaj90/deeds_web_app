from __future__ import annotations

import gc
import sys
from pathlib import Path

bridge_directory = Path(sys.argv[1]).resolve()
repository_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(bridge_directory))
sys.path.insert(0, str(repository_root / "python" / "atlas_corpus_lib"))

import torch
import pyarrow as pa

import _atlas_aten_bridge
from atlas_corpus_lib import (
    build_ast_index_payload_v1,
    build_candidate_ordinal_map_v1,
    build_lod_tile_arrow_record_v1,
    build_source_bound_observation_from_8095_chunk,
    decode_lod_tiles_arrow_ipc,
    encode_lod_tiles_arrow_ipc,
)


def main() -> None:
    source = b"export function loadTile() { return 1; }\n"
    source_revision = "sha256:" + __import__("hashlib").sha256(source).hexdigest()
    ast_record = build_source_bound_observation_from_8095_chunk(
        response={
            "schema": "atlas.ast.evidence.v1",
            "engine": "treesitter-chunker",
            "engine_version": "4.0.0",
            "language": "typescript",
            "file_path": "src/load-tile.ts",
            "source_revision": source_revision,
            "chunks": [],
        },
        chunk={
            "node_type": "function_declaration",
            "kind": "function",
            "name": "loadTile",
            "signature_text": "export function loadTile()",
            "start_byte": source.index(b"function"),
            "end_byte": len(source.rstrip()),
        },
        source_ref="src/load-tile.ts",
        source_bytes=source,
        workspace_revision="sha256:" + "b" * 64,
        language_resolver_revision="atlas.8095-language-resolver.v1",
        feature_binding={
            "feature_id": "feature:retrieval",
            "feature_label": "Retrieval Ranking",
            "taxonomy_revision": "sha256:" + "a" * 64,
        },
    )
    payload = build_ast_index_payload_v1(ast_record)
    arrow_rows = [
        build_lod_tile_arrow_record_v1(
            payload,
            mrl128_values=[float(index) for index in range(128)],
            candidate_ordinal=9,
            som_bmu_id=4,
            kmeans_cluster_id=2,
        ),
        build_lod_tile_arrow_record_v1(
            payload,
            mrl128_values=[float((index * 11) % 97) for index in range(128)],
            candidate_ordinal=2,
            som_bmu_id=3,
            kmeans_cluster_id=1,
        ),
    ]
    encoded_ipc = encode_lod_tiles_arrow_ipc(arrow_rows)
    ipc_owner = pa.py_buffer(encoded_ipc)
    ipc_table = pa.ipc.open_file(ipc_owner).read_all()
    tile_values = ipc_table.column("tile_block").chunk(0).buffers()[1]
    ipc_start = ipc_owner.address
    ipc_end = ipc_start + ipc_owner.size
    assert ipc_start <= tile_values.address < ipc_end
    assert tile_values.address + tile_values.size <= ipc_end
    decoded_rows = decode_lod_tiles_arrow_ipc(encoded_ipc)
    ordinal_map = build_candidate_ordinal_map_v1(decoded_rows)
    tensor = _atlas_aten_bridge.materialize_lod_blocks_cpu([row.tile_block for row in decoded_rows])
    expected_bytes = b"".join(row.tile_block for row in decoded_rows)
    assert [row.candidate_ordinal for row in decoded_rows] == [2, 9]
    assert [entry.candidate_ordinal for entry in ordinal_map.entries] == [2, 9]
    assert ordinal_map.workspace_revision == decoded_rows[0].ast_payload.workspace_revision
    assert tensor.device.type == "cpu"
    assert tensor.dtype == torch.uint8
    assert tuple(tensor.shape) == (2, 128)
    assert tensor.is_contiguous()
    assert tensor.data_ptr() % 64 == 0
    assert tensor.data_ptr() != tile_values.address
    del decoded_rows
    gc.collect()
    assert tensor.numpy().tobytes() == expected_bytes
    print(f"Arrow IPC payload view + ATen LOD tile bridge PASS (torch={torch.__version__}, rows=2, alignment=64, arrow_buffer_view_zero_copy=true, aten_tensor_uses_aligned_copy=true)")


if __name__ == "__main__":
    main()
