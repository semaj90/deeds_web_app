from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np

LIB_ROOT = Path(__file__).resolve().parent / "atlas_corpus_lib"
if str(LIB_ROOT) not in sys.path:
    sys.path.insert(0, str(LIB_ROOT))

from atlas_corpus_lib import (  # noqa: E402
    LodTexturePacketEnvelopeV1,
    RfcDomainRouteV1,
    TensorTileDescriptorV1,
    assemble_lod_texture_block_128b,
    bitset128_hamming_similarity,
    bitset128_jaccard_similarity,
    decode_lod_packet_protobuf_fields_1_to_20,
    encode_lod_packet_protobuf_fields_1_to_20,
    encode_tensor_tile_v1,
    fsm_detect_with_insert_stop,
    pack_turbovec_mrl128_bytes,
    radix_sort_som_candidates,
    reconcile_missing_source_ref,
    rtx_interpolate_vectors,
    single_vector_svd_som_recommend,
    stream_lod_blocks_to_pytorch_blob,
    unpack_turbovec_2bit_bitshift,
    unpack_turbovec_4bit_bitshift,
)

REV_A = "sha256:" + ("a" * 64)
REV_B = "sha256:" + ("b" * 64)


def test_bitset_bytea_bitshift_protobuf_and_lod_texture_streaming() -> None:
    # 1. C-FSM insert-stop on 'detect'
    route = RfcDomainRouteV1(
        rfc_id="RFC-7519",
        domain_topic="auth_jwt",
        concept_id="concept:auth:jwt",
        feature_id="feature:auth:jwt_claims",
        feature_label="JWT Claims Verification",
        trigger_phrases=("rfc7519", "jwt claims"),
    )
    fsm_res = fsm_detect_with_insert_stop("detect rfc7519 token validation\0ignored", [route])
    assert fsm_res.matched is True
    assert fsm_res.route is not None
    assert fsm_res.route.rfc_id == "RFC-7519"

    # 2. Missing source_ref reconciliation
    assert reconcile_missing_source_ref(REV_A, {REV_A: "src/lib/auth.ts"}) == "src/lib/auth.ts"

    # 3. 128-d MRL 2-bit (32B), 4-bit (64B), 128-bit sign bitset (16B) & bitshift unpack
    mrl_128 = np.linspace(-1.0, 1.0, 128, dtype=np.float32).tolist()
    block_128b, packed2, packed4 = assemble_lod_texture_block_128b(
        mrl128_values=mrl_128,
        candidate_ordinal=7,
        som_bmu_id=240,
        kmeans_cluster_id=3,
    )
    assert len(block_128b) == 128

    # Self Hamming similarity on 128-bit sign bitset must be 1.0
    sim = bitset128_hamming_similarity(packed4.sign_bitset_128_hex, packed4.sign_bitset_128_hex)
    assert sim == 1.0

    unpacked_2bit = unpack_turbovec_2bit_bitshift(packed2.bytea_hex, packed2.minimum, packed2.maximum)
    unpacked_4bit = unpack_turbovec_4bit_bitshift(packed4.bytea_hex, packed4.minimum, packed4.maximum)
    assert len(unpacked_2bit) == 128
    assert len(unpacked_4bit) == 128
    assert unpacked_4bit[0] < 0.0 < unpacked_4bit[-1]

    # 4. Protobuf $1..$20 binary wire framing roundtrip
    block_digest = "sha256:" + hashlib.sha256(block_128b).hexdigest()
    env = LodTexturePacketEnvelopeV1(
        field_1_packet_uuid="550e8400-e29b-41d4-a716-446655440000",
        field_2_tree_node_id="node:src/lib/auth.ts:validateJwt",
        field_3_source_ref="src/lib/auth.ts",
        field_4_source_revision=REV_A,
        field_5_workspace_revision=REV_B,
        field_6_feature_id="feature:auth:jwt_claims",
        field_7_feature_label="JWT Claims Verification",
        field_8_language_id="typescript",
        field_9_rfc_id="RFC-7519",
        field_10_symbol_name="validateJwt",
        field_11_candidate_ordinal=7,
        field_12_kmeans_cluster_id=3,
        field_13_som_bmu_id=240,
        field_14_tile_index=0,
        field_15_lod0_sign_bitset_16b_hex=packed4.sign_bitset_128_hex,
        field_16_lod1_turbovec_2bit_32b_hex=packed2.bytea_hex,
        field_17_lod2_turbovec_4bit_64b_hex=packed4.bytea_hex,
        field_18_quant_minimum=packed4.minimum,
        field_19_scale_4bit=(packed4.maximum - packed4.minimum) / 15.0 if packed4.maximum != packed4.minimum else 0.0,
        field_20_lod_block_sha256=block_digest,
    )
    wire_bytes = encode_lod_packet_protobuf_fields_1_to_20(env)
    decoded_env = decode_lod_packet_protobuf_fields_1_to_20(wire_bytes)
    assert decoded_env == env

    # 5. PyTorch `from_blob` / `from_numpy` 128-byte LOD texture tile streaming
    tensor_or_arr = stream_lod_blocks_to_pytorch_blob([block_128b, block_128b])
    assert tuple(tensor_or_arr.shape) == (2, 128)

    # 6. Bitset Jaccard similarity & C++ TensorTileV1 Protobuf wire parity
    assert abs(bitset128_jaccard_similarity(packed4.sign_bitset_128_hex, packed4.sign_bitset_128_hex) - 1.0) < 1e-6
    tile_desc = TensorTileDescriptorV1(
        workspace_revision="sha256:" + ("1" * 64),
        source_snapshot_digest="sha256:" + ("2" * 64),
        ordinal_map_digest="sha256:" + ("3" * 64),
        representation_revision="fixture-repr.v1",
        quantization=2,
        layout=2,
        payload_hex="\\x" + bytes(range(32)).hex(),
        payload_sha256="sha256:" + hashlib.sha256(bytes(range(32))).hexdigest(),
        candidate_ordinal=7,
    )
    encoded_tile = encode_tensor_tile_v1(tile_desc)
    assert encoded_tile[0] == 0x0A
    assert len(encoded_tile.hex()) == 752
    assert encoded_tile.hex().startswith("0a1461746c61732e74656e736f722d74696c652e763112477368613235363a31")


