"""Parent Atlas version-pinned in-repo library (atlas_corpus_lib v0.1.0)."""

from __future__ import annotations

from .rfc_topic_router import (
    ATLAS_FSM_STOP_SENTINEL,
    FsmDetectResultV1,
    RfcDomainRouteV1,
    fsm_detect_with_insert_stop,
    route_query_or_chunk_on_detect,
)
from .ast_chunker_helpers import (
    AstParserObservationV1,
    AstIndexPayloadV1,
    Pg18ByteaTurboVecPayloadV1,
    CanonicalAstChunkRecordV1,
    pack_turbovec_mrl128_bytes,
    build_canonical_ast_chunk_record,
    build_ast_index_payload_v1,
    build_source_bound_structural_observation,
    build_source_bound_observation_from_8095_chunk,
    reconcile_missing_source_ref,
)
from .cudf_kernel_cache import (
    KernelSwapDescriptorV1,
    SomSvdModelManifestV1,
    SomSvdRecommendationV1,
    build_som_svd_model_manifest_v1,
    radix_sort_som_candidates,
    rtx_interpolate_vectors,
    single_vector_svd_som_recommend,
    iter_jsonl_batches,
    load_batch_json_to_gpu_cache,
)
from .schema_validator_qlora import (
    FrozenCorpusValidationReceiptV1,
    QloraTrainingSampleV1,
    encode_qlora_corpus_arrow,
    validate_and_export_qlora_corpus,
)
from .arrow_tile_stream import (
    CandidateOrdinalEntryV1,
    CandidateOrdinalMapV1,
    LodTileArrowRecordV1,
    build_candidate_ordinal_map_v1,
    build_candidate_ordinal_map_from_entries_v1,
    build_lod_tile_arrow_record_v1,
    build_revision_bound_lod_tile_arrow_record_v1,
    verify_native_batch_tile_parity_v1,
    bind_hnsw_hits_to_lod_tile_records_v1,
    encode_lod_tiles_arrow_ipc,
    decode_lod_tiles_arrow_ipc,
    decode_lod_tiles_arrow_to_cpu_tensor_v1,
    decode_lod_tiles_arrow_to_cpu_tensor_view_v1,
)
from .structural_observation_v1 import (
    CanonicalFeatureBindingV1,
    LspSymbolObservationV1,
    StructuralFunctionObservationV1,
)
from .nes_taxonomy_registry import (
    AtlasFeatureRowV1,
    CANONICAL_DOMAIN_IDS,
    DOMAIN_ID_TO_NAME,
    SYMBOL_KIND_IDS,
    SYMBOL_ID_TO_KIND,
    HOT_FEATURE_BITS,
    FEATURE_BIT_TO_NAME,
    compute_feature_mask_from_labels,
)
from .gpu_feature_tile_builder import (
    AtlasGpuFeatureTileV1,
    FeatureCandidateInputV1,
    assemble_gpu_feature_tile,
)


from .lod_blob_streamer import (
    LodTexturePacketEnvelopeV1,
    TensorTileDescriptorV1,
    bitset128_hamming_similarity,
    bitset128_jaccard_similarity,
    unpack_turbovec_2bit_bitshift,
    unpack_turbovec_4bit_bitshift,
    asymmetric_dot_4bit,
    encode_lod_packet_protobuf_fields_1_to_20,
    decode_lod_packet_protobuf_fields_1_to_20,
    encode_tensor_tile_v1,
    assemble_lod_texture_block_128b,
    stream_lod_blocks_to_pytorch_blob,
)
from .pgvector_binary import unpack_pgvector_binary_768

try:
    from . import _atlas_native_core as native_core
except ImportError:
    native_core = None

NATIVE_CORE_AVAILABLE = native_core is not None

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "NATIVE_CORE_AVAILABLE",
    "native_core",
    "ATLAS_FSM_STOP_SENTINEL",
    "FsmDetectResultV1",
    "RfcDomainRouteV1",
    "fsm_detect_with_insert_stop",
    "route_query_or_chunk_on_detect",
    "Pg18ByteaTurboVecPayloadV1",
    "AstParserObservationV1",
    "AstIndexPayloadV1",
    "CanonicalAstChunkRecordV1",
    "pack_turbovec_mrl128_bytes",
    "build_canonical_ast_chunk_record",
    "build_ast_index_payload_v1",
    "build_source_bound_structural_observation",
    "build_source_bound_observation_from_8095_chunk",
    "reconcile_missing_source_ref",
    "KernelSwapDescriptorV1",
    "SomSvdModelManifestV1",
    "SomSvdRecommendationV1",
    "build_som_svd_model_manifest_v1",
    "radix_sort_som_candidates",
    "rtx_interpolate_vectors",
    "single_vector_svd_som_recommend",
    "iter_jsonl_batches",
    "load_batch_json_to_gpu_cache",
    "FrozenCorpusValidationReceiptV1",
    "QloraTrainingSampleV1",
    "encode_qlora_corpus_arrow",
    "validate_and_export_qlora_corpus",
    "LodTileArrowRecordV1",
    "CandidateOrdinalEntryV1",
    "CandidateOrdinalMapV1",
    "build_candidate_ordinal_map_v1",
    "build_candidate_ordinal_map_from_entries_v1",
    "build_lod_tile_arrow_record_v1",
    "build_revision_bound_lod_tile_arrow_record_v1",
    "verify_native_batch_tile_parity_v1",
    "bind_hnsw_hits_to_lod_tile_records_v1",
    "encode_lod_tiles_arrow_ipc",
    "decode_lod_tiles_arrow_ipc",
    "decode_lod_tiles_arrow_to_cpu_tensor_v1",
    "decode_lod_tiles_arrow_to_cpu_tensor_view_v1",
    "CanonicalFeatureBindingV1",
    "LspSymbolObservationV1",
    "StructuralFunctionObservationV1",
    "LodTexturePacketEnvelopeV1",
    "TensorTileDescriptorV1",
    "bitset128_hamming_similarity",
    "bitset128_jaccard_similarity",
    "unpack_turbovec_2bit_bitshift",
    "unpack_turbovec_4bit_bitshift",
    "asymmetric_dot_4bit",
    "unpack_pgvector_binary_768",
    "encode_lod_packet_protobuf_fields_1_to_20",
    "decode_lod_packet_protobuf_fields_1_to_20",
    "encode_tensor_tile_v1",
    "assemble_lod_texture_block_128b",
    "stream_lod_blocks_to_pytorch_blob",
]
