import base64
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from atlas_corpus_lib import (
    ATLAS_FSM_STOP_SENTINEL,
    NATIVE_CORE_AVAILABLE,
    native_core,
    asymmetric_dot_4bit,
    CandidateOrdinalEntryV1,
    build_ast_index_payload_v1,
    build_canonical_ast_chunk_record,
    build_lod_tile_arrow_record_v1,
    build_revision_bound_lod_tile_arrow_record_v1,
    verify_native_batch_tile_parity_v1,
    bind_hnsw_hits_to_lod_tile_records_v1,
    TensorTileDescriptorV1,
    encode_tensor_tile_v1,
    LodTexturePacketEnvelopeV1,
    encode_lod_packet_protobuf_fields_1_to_20,
    decode_lod_packet_protobuf_fields_1_to_20,
    build_candidate_ordinal_map_v1,
    build_candidate_ordinal_map_from_entries_v1,
    decode_lod_tiles_arrow_ipc,
    decode_lod_tiles_arrow_to_cpu_tensor_v1,
    decode_lod_tiles_arrow_to_cpu_tensor_view_v1,
    encode_lod_tiles_arrow_ipc,
    KernelSwapDescriptorV1,
    RfcDomainRouteV1,
    SomSvdModelManifestV1,
    SomSvdRecommendationV1,
    build_som_svd_model_manifest_v1,
    fsm_detect_with_insert_stop,
    iter_jsonl_batches,
    load_batch_json_to_gpu_cache,
    pack_turbovec_mrl128_bytes,
    build_source_bound_structural_observation,
    build_source_bound_observation_from_8095_chunk,
    encode_qlora_corpus_arrow,
    radix_sort_som_candidates,
    reconcile_missing_source_ref,
    rtx_interpolate_vectors,
    single_vector_svd_som_recommend,
    validate_and_export_qlora_corpus,
    stream_lod_blocks_to_pytorch_blob,
    unpack_pgvector_binary_768,
)


REVISION_A = f"sha256:{'a' * 64}"
REVISION_B = f"sha256:{'b' * 64}"


def route():
    return RfcDomainRouteV1(
        rfc_id="RFC-ATLAS-SEARCH-01",
        domain_topic="retrieval ranking",
        concept_id="concept:retrieval-ranking",
        feature_id="feature:retrieval",
        feature_label="Retrieval Ranking",
        trigger_phrases=("search runtime", "candidate ranking"),
    )


def sample(index, grade):
    return {
        "query_group_id": f"q-{index // 4}",
        "query": "Find the canonical retrieval owner",
        "candidate_packet_key": f"packet:{index:08d}",
        "source_ref": f"src/module-{index}.ts",
        "source_revision": REVISION_A,
        "workspace_revision": REVISION_B,
        "evidence_ref": f"evidence:{index}",
        "grade": grade,
        "reviewer_kind": "HUMAN",
        "reviewer_id": f"reviewer-{index % 3}",
    }


class CorpusHelpersTests(unittest.TestCase):
    def test_lod_packet_protobuf_decoder_round_trips_and_rejects_malformed_wire(self):
        lod_block = (
            bytes.fromhex("01" * 16)
            + bytes.fromhex("02" * 32)
            + bytes.fromhex("03" * 64)
            + struct.pack("<IHHff", 7, 3, 2, -1.0, 0.5)
        )
        envelope = LodTexturePacketEnvelopeV1(
            field_1_packet_uuid="550e8400-e29b-41d4-a716-446655440000",
            field_2_tree_node_id="tree-node",
            field_3_source_ref="src/a.ts",
            field_4_source_revision=REVISION_A,
            field_5_workspace_revision=REVISION_B,
            field_6_feature_id="feature:retrieval",
            field_7_feature_label="Retrieval Ranking",
            field_8_language_id="typescript",
            field_9_rfc_id="RFC-ATLAS-01",
            field_10_symbol_name="search",
            field_11_candidate_ordinal=7,
            field_12_kmeans_cluster_id=2,
            field_13_som_bmu_id=3,
            field_14_tile_index=4,
            field_15_lod0_sign_bitset_16b_hex="\\x" + "01" * 16,
            field_16_lod1_turbovec_2bit_32b_hex="\\x" + "02" * 32,
            field_17_lod2_turbovec_4bit_64b_hex="\\x" + "03" * 64,
            field_18_quant_minimum=-1.0,
            field_19_scale_4bit=0.5,
            field_20_lod_block_sha256=f"sha256:{hashlib.sha256(lod_block).hexdigest()}",
        )
        encoded = encode_lod_packet_protobuf_fields_1_to_20(envelope)
        self.assertEqual(decode_lod_packet_protobuf_fields_1_to_20(encoded), envelope)
        with self.assertRaisesRegex(ValueError, "TRUNCATED_PROTO_VARINT"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x80")
        with self.assertRaisesRegex(ValueError, "NON_CANONICAL_PROTO_VARINT"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x8a\x00\x01x")
        with self.assertRaisesRegex(ValueError, "LOD_PACKET_PROTO_WIRE_TYPE_MISMATCH"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x0f")
        with self.assertRaisesRegex(ValueError, "LOD_PACKET_PROTOBUF_SIZE_INVALID"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x00" * 4097)
        with self.assertRaisesRegex(ValueError, "LOD_PACKET_PROTO_DUPLICATE_FIELD"):
            decode_lod_packet_protobuf_fields_1_to_20(encoded + encoded[:11])
        with self.assertRaisesRegex(ValueError, "TRUNCATED_PROTO_BYTES_FIELD"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x0a\x05x")
        with self.assertRaisesRegex(ValueError, "TRUNCATED_PROTO_FIXED32_FIELD"):
            decode_lod_packet_protobuf_fields_1_to_20(b"\x95\x01\x00\x00")
        with self.assertRaisesRegex(ValueError, "LOD_PACKET_BLOCK_DIGEST_MISMATCH"):
            encode_lod_packet_protobuf_fields_1_to_20(
                envelope.model_copy(update={"field_20_lod_block_sha256": f"sha256:{'4' * 64}"})
            )

    def test_tensor_tile_encoder_rejects_payload_digest_mismatch(self):
        payload = bytes(range(32))
        tile = TensorTileDescriptorV1(
            workspace_revision=f"sha256:{'1' * 64}",
            source_snapshot_digest=f"sha256:{'2' * 64}",
            ordinal_map_digest=f"sha256:{'3' * 64}",
            representation_revision="fixture-repr.v1",
            logical_dimension=128,
            quantization=2,
            layout=2,
            payload_hex="\\x" + payload.hex(),
            payload_sha256=f"sha256:{hashlib.sha256(payload).hexdigest()}",
            candidate_ordinal=7,
        )
        self.assertTrue(encode_tensor_tile_v1(tile))
        with self.assertRaisesRegex(ValueError, "TENSOR_TILE_PAYLOAD_DIGEST_MISMATCH"):
            encode_tensor_tile_v1(tile.model_copy(update={"payload_sha256": f"sha256:{'4' * 64}"}))

    def test_source_bound_observation_hashes_exact_bytes_and_preserves_proposal_lineage(self):
        source = "fn café() {}".encode("utf-8")
        observation = build_source_bound_structural_observation(
            source_ref="src/cafe.rs",
            source_bytes=source,
            workspace_revision=REVISION_B,
            parser_language="rust",
            language_resolver_revision="atlas.8095-language-resolver.v1",
            extractor_id="treesitter_chunker",
            extractor_version="4.0.0",
            start_byte=0,
            end_byte=len(source),
            symbol_name="café",
        )
        self.assertEqual(observation.file_path, "src/cafe.rs")
        self.assertEqual(observation.source_revision, "sha256:" + hashlib.sha256(source).hexdigest())
        self.assertEqual(observation.source_byte_length, len(source))
        self.assertEqual(observation.authority, "PROPOSAL_ONLY")

    def test_source_bound_observation_rejects_split_utf8_codepoint(self):
        source = "é".encode("utf-8")
        with self.assertRaisesRegex(ValueError, "SOURCE_OR_SPAN_IS_NOT_VALID_UTF8"):
            build_source_bound_structural_observation(
                source_ref="src/cafe.rs",
                source_bytes=source,
                workspace_revision=REVISION_B,
                parser_language="rust",
                language_resolver_revision="resolver.v1",
                extractor_id="treesitter_chunker",
                extractor_version="4.0.0",
                start_byte=0,
                end_byte=1,
                symbol_name="café",
            )

    def test_8095_ast_chunk_fixture_binds_parser_response_and_exact_source_bytes(self):
        source = "export function café() { return 1; }\n".encode("utf-8")
        source_sha256 = hashlib.sha256(source).hexdigest()
        start_byte = source.index(b"function")
        response = {
            "schema": "atlas.ast.evidence.v1",
            "engine": "treesitter-chunker",
            "engine_version": "4.0.0",
            "language": "typescript",
            "file_path": "src/cafe.ts",
            "source_revision": f"sha256:{source_sha256}",
            "chunks": [],
            "syntax_status": "RECOVERED_WITH_ERRORS",
            "scan_completeness": "COMPLETE",
            "parser_observation": {
                "schema": "atlas.ast.parser-observation.v1",
                "source_sha256": source_sha256,
                "utf8_byte_length": len(source),
                "root_has_error": False,
                "error_node_count": 0,
                "missing_node_count": 0,
            },
        }
        chunk = {
            "node_type": "function_declaration",
            "kind": "function",
            "name": "café",
            "signature_text": "function café()",
            "start_byte": start_byte,
            "end_byte": len(source.rstrip()),
        }
        observation = build_source_bound_observation_from_8095_chunk(
            response=response,
            chunk=chunk,
            source_ref="src/cafe.ts",
            source_bytes=source,
            workspace_revision=REVISION_B,
            language_resolver_revision="atlas.8095-language-resolver.v1",
            feature_binding={
                "feature_id": "feature:retrieval",
                "feature_label": "Retrieval Ranking",
                "taxonomy_revision": REVISION_A,
            },
            lsp_observation={
                "server_id": "typescript-language-server",
                "server_version": "fixture.v1",
                "symbol_name": "café",
                "symbol_kind": "function",
                "start_line": 0,
                "start_character_utf16": 16,
                "end_line": 0,
                "end_character_utf16": 20,
            },
        )
        self.assertEqual(observation.parser_language, "typescript")
        self.assertEqual(observation.extractor_id, "treesitter-chunker")
        self.assertEqual(observation.node_type, "function_declaration")
        self.assertEqual(observation.signature, "function café()")
        self.assertEqual(observation.parser_observation.source_sha256, source_sha256)
        self.assertEqual(observation.syntax_status, "RECOVERED_WITH_ERRORS")
        self.assertEqual(observation.scan_completeness, "COMPLETE")
        self.assertEqual(observation.authority, "PROPOSAL_ONLY")
        payload = build_ast_index_payload_v1(observation)
        self.assertEqual(payload.parser_language, "typescript")
        self.assertEqual(payload.feature_label, "Retrieval Ranking")
        self.assertEqual(payload.taxonomy_revision, REVISION_A)
        self.assertEqual(payload.lsp_observation.position_encoding, "UTF16_CODE_UNITS")
        self.assertEqual(payload.source_ref, payload.file_path)
        self.assertEqual(payload.authority, "PROPOSAL_ONLY")
        self.assertEqual(payload.model_dump(mode="json", by_alias=True)["schema"], "atlas.ast-index-payload.v1")

    def test_8095_ast_chunk_fixture_rejects_revision_path_and_span_mismatches(self):
        source = b"function greet() {}"
        digest = hashlib.sha256(source).hexdigest()
        response = {
            "schema": "atlas.ast.evidence.v1",
            "engine": "treesitter-chunker",
            "engine_version": "4.0.0",
            "language": "typescript",
            "file_path": "src/greet.ts",
            "source_revision": f"sha256:{digest}",
            "chunks": [],
        }
        chunk = {"node_type": "function_declaration", "kind": "function", "name": "greet", "start_byte": 0, "end_byte": len(source)}
        args = {
            "response": response,
            "chunk": chunk,
            "source_ref": "src/greet.ts",
            "source_bytes": source,
            "workspace_revision": REVISION_B,
            "language_resolver_revision": "resolver.v1",
        }
        with self.assertRaisesRegex(ValueError, "8095_SOURCE_REVISION_DOES_NOT_MATCH_SOURCE_BYTES"):
            build_source_bound_observation_from_8095_chunk(**{**args, "source_bytes": b"function stale() {}"})
        with self.assertRaisesRegex(ValueError, "8095_FILE_PATH_DOES_NOT_MATCH_SOURCE_REF"):
            build_source_bound_observation_from_8095_chunk(**{**args, "source_ref": "src/other.ts"})
        with self.assertRaisesRegex(ValueError, "UTF8_BYTE_SPAN_OUT_OF_SOURCE_BOUNDS"):
            build_source_bound_observation_from_8095_chunk(**{**args, "chunk": {**chunk, "end_byte": len(source) + 1}})
        stale_parser_receipt = {**response, "parser_observation": {
            "schema": "atlas.ast.parser-observation.v1",
            "source_sha256": "0" * 64,
            "utf8_byte_length": len(source),
            "root_has_error": False,
            "error_node_count": 0,
            "missing_node_count": 0,
        }}
        with self.assertRaisesRegex(ValueError, "8095_PARSER_OBSERVATION_DOES_NOT_MATCH_SOURCE_BYTES"):
            build_source_bound_observation_from_8095_chunk(**{**args, "response": stale_parser_receipt})
        with self.assertRaisesRegex(ValueError, "LSP_SYMBOL_NAME_DOES_NOT_MATCH_AST_CHUNK"):
            build_source_bound_observation_from_8095_chunk(**{
                **args,
                "lsp_observation": {
                    "server_id": "typescript-language-server",
                    "server_version": "fixture.v1",
                    "symbol_name": "differentSymbol",
                    "symbol_kind": "function",
                    "start_line": 0,
                    "start_character_utf16": 0,
                    "end_line": 0,
                    "end_character_utf16": 1,
                },
            })
        with self.assertRaises(ValidationError):
            build_source_bound_observation_from_8095_chunk(**{
                **args,
                "feature_binding": {
                    "feature_id": "feature:retrieval",
                    "feature_label": "Retrieval Ranking",
                    "taxonomy_revision": "not-a-revision",
                },
            })

    def test_ast_index_payload_rejects_parser_or_lsp_lineage_mismatch(self):
        payload_data = {
            "source_ref": "src/lineage.ts",
            "file_path": "src/lineage.ts",
            "source_revision": REVISION_A,
            "workspace_revision": REVISION_B,
            "parser_language": "typescript",
            "language_resolver_revision": "resolver.v1",
            "extractor_id": "treesitter-chunker",
            "extractor_version": "4.0.0",
            "source_byte_length": 20,
            "start_byte": 0,
            "end_byte": 10,
            "symbol_name": "loadThing",
            "node_type": "function_declaration",
            "kind": "function",
            "syntax_status": "CLEAN",
            "scan_completeness": "COMPLETE",
            "parser_observation": {
                "source_sha256": "b" * 64,
                "utf8_byte_length": 20,
                "root_has_error": False,
                "error_node_count": 0,
                "missing_node_count": 0,
            },
        }
        with self.assertRaisesRegex(ValidationError, "AST_PARSER_OBSERVATION_DOES_NOT_MATCH_SOURCE_REVISION"):
            build_ast_index_payload_v1(
                build_canonical_ast_chunk_record(payload_data)
            )
        payload_data["parser_observation"]["source_sha256"] = "a" * 64
        payload_data["lsp_observation"] = {
            "server_id": "typescript-language-server",
            "server_version": "fixture.v1",
            "symbol_name": "anotherSymbol",
            "symbol_kind": "function",
            "start_line": 0,
            "start_character_utf16": 0,
            "end_line": 0,
            "end_character_utf16": 10,
        }
        with self.assertRaisesRegex(ValidationError, "LSP_SYMBOL_NAME_DOES_NOT_MATCH_AST_INDEX_SYMBOL"):
            build_ast_index_payload_v1(build_canonical_ast_chunk_record(payload_data))

    def test_fsm_stops_at_nul_and_returns_proposal_with_utf8_byte_offset(self):
        text = "detect: café; candidate ranking\0search runtime"
        result = fsm_detect_with_insert_stop(text, [route()])
        self.assertTrue(result.matched)
        self.assertEqual(result.route.rfc_id, "RFC-ATLAS-SEARCH-01")
        self.assertEqual(result.byte_offset, len("detect: café; ".encode("utf-8")))
        self.assertEqual(result.stop_byte_offset, len(text.split(ATLAS_FSM_STOP_SENTINEL)[0].encode("utf-8")))
        self.assertEqual(result.status, "PROPOSAL_ONLY")

    def test_fsm_does_not_match_phrase_before_detect_or_after_stop(self):
        self.assertFalse(fsm_detect_with_insert_stop("candidate ranking then detect\0 search runtime", [route()]).matched)
        self.assertFalse(fsm_detect_with_insert_stop("detect now\0 candidate ranking", [route()]).matched)

    def test_source_ref_reconciliation_requires_one_exact_digest_match(self):
        self.assertEqual(reconcile_missing_source_ref(REVISION_A, {REVISION_A: "src/a.ts"}), "src/a.ts")
        self.assertIsNone(reconcile_missing_source_ref(REVISION_A, {REVISION_A: "src/a.ts", "a" * 64: "src/b.ts"}))
        with self.assertRaisesRegex(ValueError, "SOURCE_HASH_MUST_BE_SHA256"):
            reconcile_missing_source_ref("nope", {})

    def test_packs_128_values_to_exact_2_and_4_bit_payload_lengths(self):
        values = [index / 127 for index in range(128)]
        packed4 = pack_turbovec_mrl128_bytes(values, 4)
        packed2 = pack_turbovec_mrl128_bytes(values, 2)
        self.assertEqual(len(bytes.fromhex(packed4.bytea_hex[2:])), 64)
        self.assertEqual(len(bytes.fromhex(packed2.bytea_hex[2:])), 32)
        self.assertEqual(base64.b64decode(packed4.base64_transport), bytes.fromhex(packed4.bytea_hex[2:]))
        self.assertEqual(base64.b32decode(packed2.base32_transport), bytes.fromhex(packed2.bytea_hex[2:]))
        self.assertEqual(packed4.storage_authority, "PROJECTION_PROPOSAL")

    def test_packing_matches_native_high_bit_first_layout(self):
        values = [float(index) for index in range(128)]
        packed4 = pack_turbovec_mrl128_bytes(values, 4)
        packed2 = pack_turbovec_mrl128_bytes(values, 2)
        bytes4 = bytes.fromhex(packed4.bytea_hex[2:])
        bytes2 = bytes.fromhex(packed2.bytea_hex[2:])
        self.assertEqual(bytes4[0], 0x00)
        self.assertEqual(bytes2[0], 0x00)
        self.assertEqual(bytes4[-1], 0xFF)
        self.assertEqual(bytes2[-1], 0xFF)

    def test_pgvector_binary_768_decodes_big_endian_and_rejects_bad_headers(self):
        wire = struct.pack(">HH768f", 768, 0, 1.0, -2.5, *([0.0] * 766))
        values = unpack_pgvector_binary_768(wire)
        self.assertEqual(len(values), 768)
        self.assertEqual(values[:3], [1.0, -2.5, 0.0])
        with self.assertRaisesRegex(ValueError, "PGVECTOR_768_BINARY_LENGTH_INVALID"):
            unpack_pgvector_binary_768(wire[:-1])
        bad_header = struct.pack(">HH", 767, 0) + wire[4:]
        with self.assertRaisesRegex(ValueError, "PGVECTOR_768_BINARY_HEADER_INVALID"):
            unpack_pgvector_binary_768(bad_header)
        nonfinite = struct.pack(">HH768f", 768, 0, float("inf"), *([0.0] * 767))
        with self.assertRaisesRegex(ValueError, "PGVECTOR_768_BINARY_NONFINITE_VALUE"):
            unpack_pgvector_binary_768(nonfinite)

    @unittest.skipUnless(NATIVE_CORE_AVAILABLE, "optional native extension is not built")
    def test_bundled_native_extension_matches_python_packing_and_scoring(self):
        import math

        from atlas_corpus_lib import bitset128_jaccard_similarity

        vectors = [
            [float(index) for index in range(128)],
            [-1.0 if index % 2 == 0 else 1.0 for index in range(128)],
            [math.sin(index * 0.37) for index in range(128)],
        ]
        for values in vectors:
            native = native_core.pack_turbovec_mrl128(values)
            python4 = pack_turbovec_mrl128_bytes(values, 4)
            python2 = pack_turbovec_mrl128_bytes(values, 2)
            self.assertEqual(native["bytea_4bit"], bytes.fromhex(python4.bytea_hex[2:]))
            self.assertEqual(native["bytea_2bit"], bytes.fromhex(python2.bytea_hex[2:]))
            self.assertEqual(native["sign_bitset_128"], bytes.fromhex(python4.sign_bitset_128_hex[2:]))
            self.assertEqual(native["sign_bitset_128_bit_string"], python4.sign_bitset_128_bit_string)

        left = bytes([0b11000000]) + bytes(15)
        right = bytes([0b10100000]) + bytes(15)
        expected_jaccard = bitset128_jaccard_similarity(left.hex(), right.hex())
        self.assertAlmostEqual(native_core.bitset128_jaccard_similarity(left, right), expected_jaccard)

        int2 = bytes([0b00011011]) + bytes(31)
        query = [1.0] * 128
        self.assertEqual(native_core.asymmetric_dot_2bit(query, int2, 0.0, 0.5), 3.0)
        int4 = bytes([0x12]) + bytes(63)
        python_score = asymmetric_dot_4bit(query, "\\x" + int4.hex(), 0.0, 0.5)
        self.assertEqual(python_score, 1.5)
        self.assertAlmostEqual(native_core.asymmetric_dot_4bit(query, int4, 0.0, 0.5), python_score)
        with self.assertRaisesRegex(ValueError, "TURBOVEC_4BIT_INPUT_SHAPE_INVALID"):
            asymmetric_dot_4bit(query, "\\x00", 0.0, 0.5)
        with self.assertRaisesRegex(ValueError, "TURBOVEC_4BIT_QUERY_NONFINITE"):
            asymmetric_dot_4bit([float("inf")] + query[1:], "\\x" + int4.hex(), 0.0, 0.5)
        with self.assertRaisesRegex(ValueError, "TURBOVEC_VECTOR_VALUES_MUST_BE_FINITE"):
            native_core.pack_turbovec_mrl128([float("nan")] + [0.0] * 127)

    def test_arrow_lod_tiles_round_trip_with_source_feature_lineage(self):
        source = b"export function loadThing() { return 7; }\n"
        source_revision = f"sha256:{hashlib.sha256(source).hexdigest()}"
        ast_record = build_source_bound_observation_from_8095_chunk(
            response={
                "schema": "atlas.ast.evidence.v1",
                "engine": "treesitter-chunker",
                "engine_version": "4.0.0",
                "language": "typescript",
                "file_path": "src/load-thing.ts",
                "source_revision": source_revision,
                "chunks": [],
            },
            chunk={
                "node_type": "function_declaration",
                "kind": "function",
                "name": "loadThing",
                "signature_text": "export function loadThing()",
                "start_byte": source.index(b"function"),
                "end_byte": len(source.rstrip()),
            },
            source_ref="src/load-thing.ts",
            source_bytes=source,
            workspace_revision=REVISION_B,
            language_resolver_revision="atlas.8095-language-resolver.v1",
            feature_binding={
                "feature_id": "feature:retrieval",
                "feature_label": "Retrieval Ranking",
                "taxonomy_revision": REVISION_A,
            },
        )
        payload = build_ast_index_payload_v1(ast_record)
        first = build_lod_tile_arrow_record_v1(
            payload,
            mrl128_values=[float(index) for index in range(128)],
            candidate_ordinal=9,
            som_bmu_id=4,
            kmeans_cluster_id=2,
        )
        second = build_lod_tile_arrow_record_v1(
            payload,
            mrl128_values=[float((index * 11) % 97) for index in range(128)],
            candidate_ordinal=2,
            som_bmu_id=3,
            kmeans_cluster_id=1,
        )
        encoded = encode_lod_tiles_arrow_ipc([first, second])
        self.assertEqual(encoded, encode_lod_tiles_arrow_ipc([second, first]))
        decoded = decode_lod_tiles_arrow_ipc(encoded)
        self.assertEqual([row.candidate_ordinal for row in decoded], [2, 9])
        ordinal_map = build_candidate_ordinal_map_v1(decoded)
        self.assertEqual([entry.candidate_ordinal for entry in ordinal_map.entries], [2, 9])
        self.assertEqual(ordinal_map, build_candidate_ordinal_map_v1([first, second]))
        self.assertEqual(len(ordinal_map.digest), 71)
        self.assertEqual(decoded[0].ast_payload.source_ref, "src/load-thing.ts")
        self.assertEqual(decoded[0].ast_payload.source_revision, source_revision)
        self.assertEqual(decoded[0].ast_payload.feature_label, "Retrieval Ranking")
        self.assertEqual(decoded[0].ast_payload.taxonomy_revision, REVISION_A)
        self.assertEqual(len(decoded[0].tile_block), 128)
        self.assertEqual(decoded[0].authority, "PROPOSAL_ONLY")
        bound_payload = payload.model_copy(update={"packet_key": "packet:arrow-bound"})
        bound_values = [float(index) for index in range(128)]
        vector_sha = hashlib.sha256(struct.pack("<128f", *bound_values)).hexdigest()
        identity = {
            "candidateOrdinal": 12,
            "packetKey": bound_payload.packet_key,
            "sourceRef": bound_payload.source_ref,
            "sourceRevision": bound_payload.source_revision,
            "domainId": "domain:retrieval",
            "featureId": bound_payload.feature_id,
            "featureLabel": bound_payload.feature_label,
            "taxonomyRevision": bound_payload.taxonomy_revision,
            "vectorSha256": vector_sha,
        }

        def assignment_artifact(schema, assignment, receipt):
            body = {
                "schema": schema,
                "workspaceRevision": bound_payload.workspace_revision,
                "representationRevision": REVISION_A,
                "receipt": receipt,
                "inputCandidateOrdinals": [12],
                "candidateIdentityBindings": [identity],
                "assignments": [{"candidateOrdinal": 12, **assignment}],
            }
            digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()
            return {
                **body,
                "assignmentRevision": f"sha256:{digest}",
                "authority": "PROPOSAL_ONLY",
                "canonicalAuthority": False,
                "promotionEligible": False,
            }

        kmeans_artifact = assignment_artifact("atlas.kmeans-ordinal-assignments.v1", {"kmeansClusterId": 5}, {"n_clusters": 8})
        som_artifact = assignment_artifact("atlas.som-ordinal-assignments.v1", {"somRow": 2, "somColumn": 3, "somBmuId": 23}, {"grid_rows": 5, "grid_columns": 10})
        bound_record = build_revision_bound_lod_tile_arrow_record_v1(
            bound_payload,
            mrl128_values=bound_values,
            candidate_ordinal=12,
            kmeans_assignment_artifact=kmeans_artifact,
            som_assignment_artifact=som_artifact,
        )
        self.assertEqual(bound_record.kmeans_cluster_id, 5)
        self.assertEqual(bound_record.som_bmu_id, 23)
        hnsw_hit = {
            "id": "qdrant-projection-point-99",
            "score": 0.91,
            "payload": {
                "packet_key": bound_payload.packet_key,
                "source_ref": bound_payload.source_ref,
                "source_revision": bound_payload.source_revision,
                "workspace_revision": bound_payload.workspace_revision,
                "feature_id": bound_payload.feature_id,
                "feature_label": bound_payload.feature_label,
                "taxonomy_revision": bound_payload.taxonomy_revision,
                "parser_language": bound_payload.parser_language,
                "language_resolver_revision": bound_payload.language_resolver_revision,
                "representation_id": "semantic_768",
                "start_byte": bound_payload.start_byte,
                "end_byte": bound_payload.end_byte,
                "symbol": bound_payload.symbol_name,
            },
        }
        hnsw_binding = bind_hnsw_hits_to_lod_tile_records_v1(
            [hnsw_hit], [bound_record], workspace_revision=bound_payload.workspace_revision
        )
        self.assertEqual(hnsw_binding["bindings"][0]["candidateOrdinal"], 12)
        self.assertEqual(hnsw_binding["bindings"][0]["featureLabel"], "Retrieval Ranking")
        self.assertEqual(hnsw_binding["bindings"][0]["projectionPointId"], "qdrant-projection-point-99")
        self.assertEqual(len(hnsw_binding["bindings"][0]["tileBlock"]), 128)
        self.assertEqual(hnsw_binding["bindings"][0]["tileQuantization"], "mixed_lod_int2_int4")
        self.assertFalse(hnsw_binding["canonicalAuthority"])
        ambiguous_record = build_lod_tile_arrow_record_v1(
            bound_payload,
            mrl128_values=bound_values,
            candidate_ordinal=13,
            som_bmu_id=23,
            kmeans_cluster_id=5,
        )
        ambiguous_hit = {**hnsw_hit, "payload": {key: value for key, value in hnsw_hit["payload"].items() if key not in {"start_byte", "end_byte", "symbol"}}}
        with self.assertRaisesRegex(ValueError, "HNSW_TILE_HIT_TO_ORDINAL_AMBIGUOUS"):
            bind_hnsw_hits_to_lod_tile_records_v1(
                [ambiguous_hit], [bound_record, ambiguous_record], workspace_revision=bound_payload.workspace_revision
            )
        with self.assertRaisesRegex(ValueError, "HNSW_TILE_HIT_CANONICAL_PAYLOAD_INCOMPLETE"):
            bind_hnsw_hits_to_lod_tile_records_v1(
                [{**hnsw_hit, "payload": {key: value for key, value in hnsw_hit["payload"].items() if key != "feature_label"}}],
                [bound_record],
                workspace_revision=bound_payload.workspace_revision,
            )
        with self.assertRaisesRegex(ValueError, "HNSW_TILE_HIT_WORKSPACE_REVISION_MISMATCH"):
            bind_hnsw_hits_to_lod_tile_records_v1(
                [{**hnsw_hit, "payload": {**hnsw_hit["payload"], "workspace_revision": REVISION_A}}],
                [bound_record],
                workspace_revision=bound_payload.workspace_revision,
            )
        with self.assertRaisesRegex(ValueError, "HNSW_TILE_HIT_REPRESENTATION_NOT_CANONICAL"):
            bind_hnsw_hits_to_lod_tile_records_v1(
                [{**hnsw_hit, "payload": {**hnsw_hit["payload"], "representation_id": "latent_256"}}],
                [bound_record],
                workspace_revision=bound_payload.workspace_revision,
            )
        if NATIVE_CORE_AVAILABLE:
            parity_receipt = verify_native_batch_tile_parity_v1(
                [bound_record], {12: bound_values}, worker_count=1
            )
            self.assertTrue(parity_receipt["byteForByteParity"])
            self.assertFalse(parity_receipt["canonicalAuthority"])
            self.assertFalse(parity_receipt["writesPerformed"])
            self.assertEqual(parity_receipt["rowCount"], 1)
        else:
            with self.assertRaisesRegex(RuntimeError, "ATLAS_NATIVE_CORE_REQUIRED_FOR_BATCH_PARITY"):
                verify_native_batch_tile_parity_v1([bound_record], {12: bound_values})
        with self.assertRaisesRegex(ValueError, "NATIVE_TILE_PARITY_ORDINAL_COHORT_MISMATCH"):
            verify_native_batch_tile_parity_v1([bound_record], {99: bound_values})
        with self.assertRaisesRegex(ValidationError, "LOD_TILE_ASSIGNMENT_REVISIONS_MUST_BE_PAIRED"):
            type(bound_record).model_validate({
                **bound_record.model_dump(),
                "kmeans_assignment_revision": None,
            })
        bound_decoded = decode_lod_tiles_arrow_ipc(encode_lod_tiles_arrow_ipc([bound_record]))[0]
        self.assertEqual(bound_decoded.kmeans_assignment_revision, kmeans_artifact["assignmentRevision"])
        self.assertEqual(bound_decoded.som_assignment_revision, som_artifact["assignmentRevision"])
        tampered_kmeans = {**kmeans_artifact, "assignments": [{"candidateOrdinal": 12, "kmeansClusterId": 6}]}
        with self.assertRaisesRegex(ValueError, "LOD_TILE_ASSIGNMENT_REVISION_MISMATCH"):
            build_revision_bound_lod_tile_arrow_record_v1(
                bound_payload,
                mrl128_values=bound_values,
                candidate_ordinal=12,
                kmeans_assignment_artifact=tampered_kmeans,
                som_assignment_artifact=som_artifact,
            )
        tensor_records, tensor_ordinal_map, tensor = decode_lod_tiles_arrow_to_cpu_tensor_v1(encoded)
        self.assertEqual([row.candidate_ordinal for row in tensor_records], [2, 9])
        self.assertEqual(tensor_ordinal_map.digest, ordinal_map.digest)
        self.assertEqual(tuple(tensor.shape), (2, 128))
        self.assertIn(str(tensor.dtype), {"torch.uint8", "uint8"})
        if hasattr(tensor, "device"):
            self.assertEqual(str(tensor.device), "cpu")
        self.assertEqual(
            bytes(value for row in tensor.tolist() for value in row),
            b"".join(row.tile_block for row in tensor_records),
        )
        with self.assertWarnsRegex(UserWarning, "buffer is not writable"):
            view_records, view_ordinal_map, tile_view = decode_lod_tiles_arrow_to_cpu_tensor_view_v1(encoded)
        self.assertEqual(view_ordinal_map.digest, ordinal_map.digest)
        self.assertEqual([row.candidate_ordinal for row in view_records], [2, 9])
        self.assertEqual(tuple(tile_view.shape), (2, 128))
        self.assertEqual(tile_view.data_ptr(), tile_view._atlas_arrow_owner[3].address)
        self.assertEqual(
            bytes(value for row in tile_view.tolist() for value in row),
            b"".join(row.tile_block for row in view_records),
        )
        with self.assertRaisesRegex(ValueError, "CANDIDATE_ORDINAL_MAP_ORDER_OR_UNIQUENESS_INVALID"):
            encode_lod_tiles_arrow_ipc([first, first])
        unbound_payload = payload.model_copy(update={"feature_id": None, "feature_label": None, "taxonomy_revision": None})
        with self.assertRaisesRegex(ValueError, "FEATURE_BINDING_REQUIRED_FOR_LOD_ARROW_EXPORT"):
            build_lod_tile_arrow_record_v1(
                unbound_payload,
                mrl128_values=[0.0] * 128,
                candidate_ordinal=10,
                som_bmu_id=0,
                kmeans_cluster_id=0,
            )

        import pyarrow as pa

        table = pa.ipc.open_file(pa.BufferReader(encoded)).read_all()
        tampered_block = bytes([table["tile_block"][0].as_py()[0] ^ 1]) + table["tile_block"][0].as_py()[1:]
        tampered_table = table.set_column(
            table.schema.get_field_index("tile_block"),
            table.schema.field("tile_block"),
            pa.array([tampered_block, table["tile_block"][1].as_py()], type=pa.binary(128)),
        )
        sink = pa.BufferOutputStream()
        with pa.ipc.new_file(sink, tampered_table.schema, options=pa.ipc.IpcWriteOptions(compression=None, use_threads=False)) as writer:
            writer.write_table(tampered_table, max_chunksize=2)
        with self.assertRaisesRegex(ValueError, "LOD_ARROW_ROW_VALIDATION_FAILED"):
            decode_lod_tiles_arrow_ipc(sink.getvalue().to_pybytes())

    def test_sign_prefilter_is_separate_high_bit_first_128_bit_payload(self):
        values = [-1.0 if index % 2 == 0 else 1.0 for index in range(128)]
        packed = pack_turbovec_mrl128_bytes(values, 4)
        sign_bytes = bytes.fromhex(packed.sign_bitset_128_hex[2:])
        self.assertEqual(len(sign_bytes), 16)
        self.assertEqual(packed.sign_bitset_128_bit_string, "01" * 64)
        self.assertEqual(sign_bytes[0], 0x55)
        self.assertEqual(len(packed.sign_bitset_sha256), 64)

    def test_radix_reference_order_and_interpolation_are_deterministic(self):
        rows = [
            {"kmeans_cluster_id": 1, "som_bmu_id": 2, "candidate_ordinal": 4},
            {"kmeans_cluster_id": 0, "som_bmu_id": 9, "candidate_ordinal": 8},
            {"kmeans_cluster_id": 1, "som_bmu_id": 2, "candidate_ordinal": 1},
        ]
        self.assertEqual([r["candidate_ordinal"] for r in radix_sort_som_candidates(rows)], [8, 1, 4])
        self.assertEqual(rtx_interpolate_vectors([0, 2], [2, 4], 0.5), [1.0, 3.0])
        with self.assertRaisesRegex(ValueError, "SOM_RADIX_KEY_OUT_OF_RANGE"):
            radix_sort_som_candidates([{**rows[0], "som_bmu_id": 400}])
        with self.assertRaisesRegex(ValueError, "SOM_RADIX_KEYS_MUST_BE_NONNEGATIVE_INTEGERS"):
            radix_sort_som_candidates([{**rows[0], "candidate_ordinal": True}])

    def test_svd_som_uses_frozen_basis_and_returns_only_derived_cell(self):
        import numpy as np

        vector = np.zeros(768, dtype=np.float32)
        components = np.zeros((2, 768), dtype=np.float32)
        codebook = np.ones((400, 2), dtype=np.float32)
        codebook[13] = 0
        mean = np.zeros(768, dtype=np.float32)
        manifest = build_som_svd_model_manifest_v1(
            mean,
            components,
            codebook,
            training_corpus_revision=REVISION_A,
        )
        ordinal_map = build_candidate_ordinal_map_from_entries_v1(
            [CandidateOrdinalEntryV1(
                candidate_ordinal=11,
                packet_key="packet:som-test",
                source_ref="src/som-test.ts",
                source_revision=REVISION_A,
                start_byte=4,
                end_byte=34,
                symbol_name="recommend",
            )],
            REVISION_B,
        )
        result = single_vector_svd_som_recommend(
            vector, mean, components, codebook,
            model_manifest=manifest, ordinal_map=ordinal_map, candidate_ordinal=11,
        )
        self.assertIsInstance(result, SomSvdRecommendationV1)
        self.assertEqual(result.cell_index, 13)
        self.assertEqual(result.status, "DERIVED_RECOMMENDATION_ONLY")
        self.assertEqual(result.projection_revision, manifest.projection_revision)
        self.assertEqual(result.codebook_sha256, manifest.codebook_sha256)
        self.assertEqual(result.ordinal_map_digest, ordinal_map.digest)
        self.assertEqual(result.workspace_revision, REVISION_B)
        self.assertEqual(result.candidate_binding.source_ref, "src/som-test.ts")
        with self.assertRaisesRegex(ValueError, "SOM_SVD_CANDIDATE_ORDINAL_INVALID"):
            single_vector_svd_som_recommend(
                vector, mean, components, codebook,
                model_manifest=manifest, ordinal_map=ordinal_map, candidate_ordinal=True,
            )
        with self.assertRaisesRegex(ValueError, "SOM_SVD_CANDIDATE_ORDINAL_NOT_IN_MAP"):
            single_vector_svd_som_recommend(
                vector, mean, components, codebook,
                model_manifest=manifest, ordinal_map=ordinal_map, candidate_ordinal=12,
            )
        changed_codebook = codebook.copy()
        changed_codebook[0, 0] = 2
        with self.assertRaisesRegex(ValueError, "SOM_SVD_MODEL_ARRAY_DIGEST_MISMATCH"):
            single_vector_svd_som_recommend(
                vector, mean, components, changed_codebook,
                model_manifest=manifest, ordinal_map=ordinal_map, candidate_ordinal=11,
            )
        forged_manifest = manifest.model_dump(mode="python", by_alias=True)
        forged_manifest["projection_revision"] = REVISION_B
        with self.assertRaises(ValidationError):
            SomSvdModelManifestV1.model_validate(forged_manifest)
        forged_ordinal_map = ordinal_map.model_copy(update={"digest": REVISION_A})
        with self.assertRaisesRegex(ValidationError, "CANDIDATE_ORDINAL_MAP_DIGEST_MISMATCH"):
            single_vector_svd_som_recommend(
                vector, mean, components, codebook,
                model_manifest=manifest, ordinal_map=forged_ordinal_map, candidate_ordinal=11,
            )

    def test_svd_som_rejects_finite_inputs_that_overflow_distance(self):
        import numpy as np

        vector = np.zeros(768, dtype=np.float32)
        components = np.zeros((2, 768), dtype=np.float32)
        codebook = np.ones((400, 2), dtype=np.float32)
        codebook[13] = np.float32(3e38)
        mean = np.zeros(768, dtype=np.float32)
        manifest = build_som_svd_model_manifest_v1(
            mean, components, codebook, training_corpus_revision=REVISION_A,
        )
        ordinal_map = build_candidate_ordinal_map_from_entries_v1(
            [CandidateOrdinalEntryV1(
                candidate_ordinal=11,
                packet_key="packet:som-overflow-test",
                source_ref="src/som-overflow-test.ts",
                source_revision=REVISION_A,
                start_byte=0,
                end_byte=12,
                symbol_name="overflow",
            )],
            REVISION_B,
        )
        with self.assertRaisesRegex(ValueError, "SVD_SOM_DISTANCE_NONFINITE"):
            single_vector_svd_som_recommend(
                vector, mean, components, codebook,
                model_manifest=manifest, ordinal_map=ordinal_map, candidate_ordinal=11,
            )

    def test_kernel_swap_descriptor_never_carries_tensors(self):
        descriptor = KernelSwapDescriptorV1(
            kernel_id="atlas.topk", kernel_revision=REVISION_A, device_architecture="sm_86",
            runtime_abi="cuda-13.0", input_shape=(128, 768), dtype="float32",
        )
        self.assertFalse(descriptor.resident)
        self.assertFalse(descriptor.tensor_bytes_persisted)
        with self.assertRaises(ValidationError):
            KernelSwapDescriptorV1(
                kernel_id="atlas.topk", kernel_revision=REVISION_A, device_architecture="sm_86",
                runtime_abi="cuda-13.0", input_shape=(128, 768), dtype="float32", tensor_bytes_persisted=True,
            )

    def test_jsonl_loader_is_bounded_and_cpu_mode_is_truthful(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.jsonl"
            path.write_text("{\"id\":1}\n{\"id\":2}\n{\"id\":3}\n", encoding="utf-8")
            batches = list(iter_jsonl_batches(path, batch_size=2))
            self.assertEqual([len(batch) for batch in batches], [2, 1])
            loaded = list(load_batch_json_to_gpu_cache(path, batch_size=2))
            self.assertEqual([batch["backend"] for batch in loaded], ["CPU_JSONL", "CPU_JSONL"])
            byte_bounded = list(iter_jsonl_batches(path, batch_size=10, max_line_bytes=9, max_batch_bytes=9))
            self.assertEqual([len(batch) for batch in byte_bounded], [1, 1, 1])
            with self.assertRaisesRegex(ValueError, "JSONL_ROW_BYTE_LIMIT_EXCEEDED:1"):
                list(iter_jsonl_batches(path, max_line_bytes=5))
            with self.assertRaisesRegex(ValueError, "JSONL_BATCH_ROW_LIMIT_EXCEEDED"):
                list(iter_jsonl_batches(path, batch_size=4097))
            path.write_bytes(b'{"id":1,"id":2}\n')
            with self.assertRaisesRegex(ValueError, "JSONL_DUPLICATE_OBJECT_KEY:id"):
                list(iter_jsonl_batches(path))
            path.write_bytes(b'{"score":NaN}\n')
            with self.assertRaisesRegex(ValueError, "JSONL_NONSTANDARD_CONSTANT:NaN"):
                list(iter_jsonl_batches(path))

    def test_qlora_floor_blocks_export_when_human_review_floor_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "should-not-exist.jsonl"
            receipt = validate_and_export_qlora_corpus([sample(0, 0)])
            self.assertEqual(receipt.status, "BLOCKED_LABEL_FLOOR")
            with self.assertRaisesRegex(ValueError, "QLORA_EXPORT_REFUSED_LABEL_FLOOR"):
                validate_and_export_qlora_corpus([sample(0, 0)], output)
            self.assertFalse(output.exists())

    def test_qlora_export_is_deterministic_after_review_floor_passes(self):
        rows = [sample(grade * 50 + index, grade) for grade in range(4) for index in range(50)]
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.jsonl"
            second = Path(directory) / "second.jsonl"
            receipt1 = validate_and_export_qlora_corpus(rows, first)
            receipt2 = validate_and_export_qlora_corpus(list(reversed(rows)), second)
            self.assertTrue(receipt1.ready_for_shadow_training)
            self.assertEqual(receipt1.corpus_sha256, receipt2.corpus_sha256)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(json.loads(first.read_text(encoding="utf-8").splitlines()[0])["reviewer_kind"], "HUMAN")

    def test_qlora_arrow_export_is_deterministic_and_carries_lineage_metadata(self):
        import pyarrow as pa

        rows = [sample(grade * 50 + index, grade) for grade in range(4) for index in range(50)]
        first = encode_qlora_corpus_arrow(rows)
        second = encode_qlora_corpus_arrow(list(reversed(rows)))
        self.assertEqual(first, second)
        table = pa.ipc.open_file(pa.BufferReader(first)).read_all()
        self.assertEqual(table.num_rows, len(rows))
        self.assertEqual(table.schema.metadata[b"atlas.schema"], b"atlas.qlora-training-samples.v1")
        self.assertEqual(table.schema.metadata[b"atlas.corpus_sha256"], validate_and_export_qlora_corpus(rows).corpus_sha256.encode("ascii"))

    def test_qlora_arrow_export_refuses_unreviewed_floor(self):
        with self.assertRaisesRegex(ValueError, "QLORA_ARROW_EXPORT_REFUSED_LABEL_FLOOR"):
            encode_qlora_corpus_arrow([sample(0, 0)])

    def test_lod_tensor_stages_once_and_returns_byte_tensor(self):
        tensor = stream_lod_blocks_to_pytorch_blob([bytes(range(128)), bytes(reversed(range(128)))])
        self.assertEqual(tuple(tensor.shape), (2, 128))
        if hasattr(tensor, "dtype") and str(tensor.dtype) == "torch.uint8":
            self.assertEqual(tensor[0, 0].item(), 0)
            self.assertEqual(tensor[1, 0].item(), 127)
        else:
            self.assertEqual(int(tensor[0, 0]), 0)
            self.assertEqual(int(tensor[1, 0]), 127)


if __name__ == "__main__":
    unittest.main()
