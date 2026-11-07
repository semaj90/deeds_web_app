"""
scripts/retrieval/kag_dag_synthesis_helper.py

KAG / DAG Task Retrieval & Keyframe Synthesis Helper.
Bridges Kanban DAG nodes and evidence exhibits into:
1. Canonical PyTorch ATen 64-byte keyframe chunks (AlignedKeyframeChunk64B).
2. PostgreSQL 18 AIO BIT(256) bitsets & BYTEA packed payloads.
3. Unsupervised K-Means Top-K cluster metadata (JSONB).
4. Direct candidate Drizzle / SQL INSERT generation for atlas_spatial_keyframes_v1.
"""

import sys
import os
import json
import uuid

# Import the PyTorch synthesizer
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "spatial")))
from pytorch_aten_spatial_keyframes import synthesize_spatial_rpc_packet

def synthesize_kag_dag_node(
    dag_task_id: str,
    scene_slug: str,
    evidence_nodes: list,
    k_clusters: int = 3,
    domain: str = "database",
    palette_color: str = "Oxblood"
) -> dict:
    """
    Synthesize a KAG DAG evidence node cluster into a canonical spatial keyframes RPC packet.
    """
    # Deterministic UUIDv7 or UUID generation from DAG task ID
    scene_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"dag.task.{dag_task_id}"))

    packet = synthesize_spatial_rpc_packet(
        scene_id=scene_id,
        title_id=scene_slug,
        exhibits=evidence_nodes,
        k_clusters=k_clusters,
        domain=domain,
        palette_color=palette_color
    )

    # Format candidate SQL INSERT statement for PostgreSQL 18 scratch rehearsal
    bitset_str = packet["postgresql18_aio_bitmap"]["active_slot_bitset"]
    packed_hex = packet["packed_transforms_blob"]["sha256"]
    meta_json = json.dumps(packet["cluster_metadata"])
    int8_hex = packet["quantized_bytea"]["int8_quantized_coords_hex"]
    int4_hex = packet["quantized_bytea"]["int4_quantized_scores_hex"]
    hll_hex = packet["quantized_bytea"]["hyperloglog_sketch_hex"]

    candidate_sql = (
        f"-- Candidate INSERT for atlas_spatial_keyframes_v1 (Rehearsal Only)\n"
        f"INSERT INTO public.atlas_spatial_keyframes_v1 (\n"
        f"    scene_id, title_id, source_sha256, revision_id, active_slot_bitset, packed_transforms_blob, cluster_metadata,\n"
        f"    int8_quantized_coords, int4_quantized_scores, hyperloglog_sketch\n"
        f") VALUES (\n"
        f"    '{packet['scene_id']}',\n"
        f"    '{packet['title_id']}',\n"
        f"    '{packet['source_sha256']}',\n"
        f"    1,\n"
        f"    B'{bitset_str}',\n"
        f"    '\\x{packed_hex}'::bytea,\n"
        f"    '{meta_json}'::jsonb,\n"
        f"    '\\x{int8_hex}'::bytea,\n"
        f"    '\\x{int4_hex}'::bytea,\n"
        f"    '\\x{hll_hex}'::bytea\n"
        f") ON CONFLICT (scene_id, revision_id) DO UPDATE SET\n"
        f"    active_slot_bitset = EXCLUDED.active_slot_bitset,\n"
        f"    packed_transforms_blob = EXCLUDED.packed_transforms_blob,\n"
        f"    cluster_metadata = EXCLUDED.cluster_metadata,\n"
        f"    int8_quantized_coords = EXCLUDED.int8_quantized_coords,\n"
        f"    int4_quantized_scores = EXCLUDED.int4_quantized_scores,\n"
        f"    hyperloglog_sketch = EXCLUDED.hyperloglog_sketch;\n"
    )

    return {
        "packet": packet,
        "candidate_sql": candidate_sql
    }

def main():
    print("[KAG DAG Synthesis Helper] Running demo synthesis for Case #986B5214...")
    dummy_exhibits = [
        {"id": "E-001", "label": "Footprint Tread A", "position": [-1.0, 0.0, 0.5]},
        {"id": "E-002", "label": "Bloodstain 2D Decal", "position": [2.4, 0.01, -1.2]},
        {"id": "E-003", "label": "OBB 3D Caliper Gizmo", "position": [2.4, 0.5, -1.2]},
        {"id": "E-006", "label": "CCTV Node 12", "position": [-3.5, 2.2, 4.0]},
        {"id": "E-009", "label": "Substation 4-B LiDAR Splat", "position": [0.0, 1.0, 0.0]}
    ]

    result = synthesize_kag_dag_node(
        dag_task_id="TASK-986B5214-CRIME-SCENE",
        scene_slug="state-v-johnson-scene-4b",
        evidence_nodes=dummy_exhibits,
        k_clusters=3,
        domain="retrieval",
        palette_color="Oxblood"
    )

    print("\n[Result] PyTorch Backend:", result["packet"]["backend"])
    print("[Result] Scene UUID:", result["packet"]["scene_id"])
    print("[Result] Candidate SQL:")
    print(result["candidate_sql"])

if __name__ == "__main__":
    main()
