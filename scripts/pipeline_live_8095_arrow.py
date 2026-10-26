import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

# Add python/atlas_corpus_lib to sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root / "python" / "atlas_corpus_lib"))

from atlas_corpus_lib.ast_chunker_helpers import (
    AstIndexPayloadV1,
    AstParserObservationV1,
)
from atlas_corpus_lib.arrow_tile_stream import (
    build_lod_tile_arrow_record_v1,
    encode_lod_tiles_arrow_ipc,
    decode_lod_tiles_arrow_to_cpu_tensor_v1,
)

def main():
    target_rel = "sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts"
    target_abs = repo_root / target_rel

    if not target_abs.exists():
        print(f"Error: target file not found: {target_abs}")
        sys.exit(1)

    with open(target_abs, "rb") as f:
        file_bytes = f.read()

    source_sha256_hex = hashlib.sha256(file_bytes).hexdigest()
    source_revision = f"sha256:{source_sha256_hex}"
    source_byte_length = len(file_bytes)
    file_text = file_bytes.decode("utf-8")

    workspace_revision = f"sha256:{hashlib.sha256(b'workspace:deeds-web-app:main').hexdigest()}"
    taxonomy_revision = f"sha256:{hashlib.sha256(b'taxonomy:turbovec:v1').hexdigest()}"

    print(f"Target: {target_rel} ({source_byte_length} bytes)")
    print(f"Source Revision: {source_revision}")

    # Query :8095
    req_body = {
        "text": file_text,
        "language": "typescript"
    }
    extract_req = urllib.request.Request(
        "http://127.0.0.1:8095/extract",
        data=json.dumps(req_body).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(extract_req, timeout=10) as resp:
            extract_data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Failed to extract from 8095: {e}")
        sys.exit(1)

    chunks = extract_data.get("structure", {}).get("chunks", [])
    print(f"Tree-sitter :8095 returned {len(chunks)} raw AST chunks.")

    # Filter to symbol-bearing chunks with valid spans
    valid_chunks = []
    for c in chunks:
        symbol = c.get("symbol")
        start = c.get("start")
        end = c.get("end")
        kind = c.get("kind") or "statement"
        if symbol and start is not None and end is not None and start < end and end <= source_byte_length:
            valid_chunks.append(c)

    print(f"Found {len(valid_chunks)} symbol-bearing chunks in source bounds.")
    if not valid_chunks:
        # Fallback to any chunk with valid start/end
        for idx, c in enumerate(chunks):
            start = c.get("start")
            end = c.get("end")
            if start is not None and end is not None and start < end and end <= source_byte_length:
                c["symbol"] = c.get("symbol") or f"chunk_{idx}"
                valid_chunks.append(c)

    # Build AstIndexPayloadV1 and LodTileArrowRecordV1 for each
    records = []
    parser_obs = AstParserObservationV1(
        source_sha256=source_sha256_hex,
        utf8_byte_length=source_byte_length,
        root_has_error=False,
        error_node_count=0,
        missing_node_count=0,
    )

    dummy_mrl128 = [0.05 * (i % 20 - 10) for i in range(128)]

    for ordinal, c in enumerate(valid_chunks[:16]):  # test up to 16 chunks
        sym = c["symbol"]
        sig = c.get("metadata", {}).get("signature_text") or sym
        node_t = c.get("metadata", {}).get("type") or c.get("kind") or "chunk"
        start = c["start"]
        end = c["end"]

        payload = AstIndexPayloadV1(
            packet_key=f"packet:turbovec:{ordinal}",
            source_ref=target_rel,
            file_path=target_rel,
            source_revision=source_revision,
            workspace_revision=workspace_revision,
            parser_language="typescript",
            language_resolver_revision="sha256:langres1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            extractor_id="atlas-treesitter-sidecar",
            extractor_version="4.0.0",
            source_byte_length=source_byte_length,
            start_byte=start,
            end_byte=end,
            symbol_name=sym,
            node_type=node_t,
            kind=c.get("kind") or "declaration",
            signature=sig,
            feature_id="feature:vector:turbovec_4bit",
            feature_label="TurboVec 4-bit representation",
            taxonomy_revision=taxonomy_revision,
            parser_observation=parser_obs,
            syntax_status="CLEAN",
            scan_completeness="COMPLETE",
        )

        record = build_lod_tile_arrow_record_v1(
            ast_payload=payload,
            mrl128_values=dummy_mrl128,
            candidate_ordinal=ordinal,
            som_bmu_id=(ordinal * 7) % 64,
            kmeans_cluster_id=ordinal % 8,
        )
        records.append(record)

    print(f"Successfully constructed {len(records)} LodTileArrowRecordV1 records.")

    # Encode to Arrow IPC
    ipc_bytes = encode_lod_tiles_arrow_ipc(records)
    print(f"Encoded Arrow IPC size: {len(ipc_bytes)} bytes.")

    # Decode and roundtrip back to CPU tensor
    decoded_records, ordinal_map, cpu_tensor = decode_lod_tiles_arrow_to_cpu_tensor_v1(ipc_bytes)
    print(f"Decoded {len(decoded_records)} records from Arrow IPC.")
    print(f"OrdinalMap entries: {len(ordinal_map.entries)}, digest: {ordinal_map.digest}")
    print(f"CPU Tensor shape: {list(cpu_tensor.shape)}, dtype: {cpu_tensor.dtype}, device: {cpu_tensor.device}")

    assert len(decoded_records) == len(records)
    for orig, dec in zip(records, decoded_records):
        assert orig.candidate_ordinal == dec.candidate_ordinal
        assert orig.tile_block == dec.tile_block
        assert orig.tile_sha256 == dec.tile_sha256
        assert orig.ast_payload.symbol_name == dec.ast_payload.symbol_name

    print("ALL ASSERTIONS PASSED! Live 8095 -> Tree-sitter -> Arrow IPC -> CPU Tensor verified.")

if __name__ == "__main__":
    main()
