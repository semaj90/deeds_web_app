# Artifact Bloat Audit

Generated: 2026-06-12T03:43:09.521Z

## Summary

- total files: 283922
- total size MB: 39770.56
- duplicate files: 5372

## By Kind
- raw_json: 272795
- ndjson: 892
- msgpack: 28
- duckdb: 4
- parquet: 7
- embedding_checkpoint: 96
- som_checkpoint: 6
- report: 4722
- duplicate: 5372

## Largest Files

| Path | Kind | Size (MB) | Recommendation |
|------|------|-----------|-----------------|
| `models/gemma4-legal-iq4xs-direct.gguf` | embedding_checkpoint | 4855.57 | move_cold |
| `backups/atlas-2026-05-17T21-21-53-987Z/qdrant/codebase_chunks_10m.snapshot` | raw_json | 4067.34 | keep_canonical |
| `.tmp/mapreduce-full-v4.ndjson` | ndjson | 3868.93 | compress_zstd |
| `models/embeddinggemma_300m/model.safetensors` | embedding_checkpoint | 1155.36 | move_cold |
| `models/mmproj-F16.gguf` | embedding_checkpoint | 944.49 | move_cold |
| `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson` | ndjson | 704.99 | keep_canonical |
| `offline-data/backups/legal_ai_db_backup.dump` | raw_json | 643.29 | keep_canonical |
| `backups/atlas-2026-05-17T21-21-53-987Z/postgres_backup.sql` | raw_json | 595.39 | keep_canonical |
| `models/embeddinggemma-300m-f16.gguf` | embedding_checkpoint | 593.06 | move_cold |
| `backups/atlas-2026-05-17T21-21-53-987Z/neo4j_data.tar` | raw_json | 560.75 | keep_canonical |
| `models/gemma3_270m/model.safetensors` | embedding_checkpoint | 511.38 | move_cold |
| `artifacts/qdrant-volume-exports-2026-04-01/deeds-web-app_qdrant-data-384__ws-e38928570c6f912e.tar.gz` | raw_json | 504.98 | keep_canonical |
| `granite-docling-258M/model.safetensors` | embedding_checkpoint | 491.23 | move_cold |
| `models/gemma3-client-onnx/gemma3_270m_w8a16.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `models/gemma3-client-onnx/gemma3_client_quantized.onnx` | embedding_checkpoint | 417.22 | move_cold |
| `sveltekit-frontend/static/gemma3_270m_onnx/gemma3_270m_w8a16.onnx` | raw_json | 417.22 | keep_canonical |
| `sveltekit-frontend/static/gemma3_270m_onnx/gemma3_client_quantized.onnx` | raw_json | 417.22 | keep_canonical |
| `.cache/cards/09e185c179fb0407eded430b49c8a6a341caa29b.msgpack` | msgpack | 400.18 | move_cold |
| `sveltekit-frontend/.cache/cards/87a3e2aa5036028f81632b720cdf195a73ce8a0e.msgpack` | msgpack | 400.18 | move_cold |
| `sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json` | raw_json | 400.18 | keep_canonical |
| `.tmp/simd-adaptive-parser.json` | raw_json | 374.29 | compress_zstd |
| `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson` | ndjson | 370.64 | keep_canonical |
| `models/embeddinggemma-300m-q8_0.gguf` | embedding_checkpoint | 318.14 | move_cold |
| `models/embeddinggemma_300m_onnx/model.onnx` | embedding_checkpoint | 290.74 | move_cold |
| `sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx` | embedding_checkpoint | 290.74 | move_cold |

## Duplicate Groups

- 1b0ad44998d6: sveltekit-frontend/tools/caddy.exe, tools/bin/caddy.exe
- 83ee47245398: qdrant-windows/storage/collections/legal_evidence/0/segments/18c5c3cb-00bd-4a54-9976-a8665dc0c689/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/247cce33-28b8-441c-9ad7-052b80f92aee/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/2866ebd4-36a8-4382-b303-7dc508d3db05/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/2b244f9d-4121-4433-b8fd-83e1a62d8e8c/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/3d4f0fd9-6e58-4be5-ad71-68d17695803d/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/3d506357-f0b6-46ba-8382-87d5f1faec13/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/b5db10f3-d54b-4f7b-b2f2-a50ddd817330/payload_storage/page_0.dat, qdrant-windows/storage/collections/legal_evidence/0/segments/dc2f23e6-bb9a-458c-8024-8170d5a8abf6/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/08531908-d173-4569-a68f-c90a37187fc4/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/1b01ebdc-a134-4c12-a17b-3ee0c20b0a92/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/5a5530ac-757d-4299-928f-f00b49f7f73f/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/7ea73893-ecc1-4510-b8d3-439f194154c9/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/8f665932-9edb-4846-92ae-f302ccfb9128/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/a2bf68c0-57b5-4c95-b39a-c7ba4702b039/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/b4b382bc-5539-4e07-a84a-81965bb93842/payload_storage/page_0.dat, storage/collections/phase72_evidence_embeddings/0/segments/d9446289-7f6d-42a1-9b3b-4c8ca52af487/payload_storage/page_0.dat
- 6852f8d56107: models/embeddinggemma_300m/tokenizer.json, sveltekit-frontend/static/embeddinggemma_300m_onnx/tokenizer.json, sveltekit-frontend/static/models/embeddinggemma_300m_onnx/tokenizer.json
- 7d4046bf0505: models/gemma3_270m/tokenizer.json, sveltekit-frontend/static/gemma3_270m_onnx/tokenizer.json
- 5ac421df43a8: simd-bridge/rust/hmm-repair/target/x86_64-pc-windows-msvc/debug/deps/hmm_repair.pdb, simd-bridge/rust/hmm-repair/target/x86_64-pc-windows-msvc/debug/hmm_repair.pdb
- 0e0f2ce3de03: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-gap-atlas.json, sveltekit-frontend/docs/graph/sveltekit-route-gap-atlas.json
- ad93d182126d: sveltekit-frontend/.tmp/offline-analysis/fe-graph-sveltekit-route-map.json, sveltekit-frontend/docs/graph/sveltekit-route-map.json
- 4b57c7b2311c: simd-bridge/rust/graph-engine/target/release/deps/libsyn-83bb9f2499dd793e.rlib, simd-bridge/rust/hmm-repair/target/release/deps/libsyn-83bb9f2499dd793e.rlib
- 1a41ed38fb2b: crates/atlas_packet_parser/target/release/deps/libsyn-29cda0687c66eb6d.rlib, crates/turbovec-napi/target/release/deps/libsyn-29cda0687c66eb6d.rlib, simd-bridge/rust-simdjson/target/release/deps/libsyn-29cda0687c66eb6d.rlib
- b814737e43bf: crates/atlas_packet_parser/target/release/deps/libnapi-69fa3969d59f3f92.rlib, crates/turbovec-napi/target/release/deps/libnapi-69fa3969d59f3f92.rlib
- 65e1c38b37d7: crates/turbovec-napi/target/release/deps/libregex_syntax-b4ea55b4904cd38e.rlib, simd-bridge/rust-simdjson/target/release/deps/libregex_syntax-b4ea55b4904cd38e.rlib
- 36c7accb18b0: simd-bridge/rust/graph-engine/target/release/deps/libregex_syntax-91006f1627c764e2.rlib, simd-bridge/rust/hmm-repair/target/release/deps/libregex_syntax-91006f1627c764e2.rlib
- 5bcb0c7fd6d5: docs/graph/repo-sveltekit-route-atlas.json, sveltekit-frontend/.tmp/offline-analysis/docs-graph-repo-sveltekit-route-atlas.json
- e0b56297cb8b: simd-bridge/rust/graph-engine/target/release/deps/libregex_automata-030c1a71414bd09c.rlib, simd-bridge/rust/hmm-repair/target/release/deps/libregex_automata-030c1a71414bd09c.rlib
- 3422599a0702: crates/atlas_packet_parser/target/release/deps/libnapi-69fa3969d59f3f92.rmeta, crates/turbovec-napi/target/release/deps/libnapi-69fa3969d59f3f92.rmeta
- 3a941480e7a7: sveltekit-frontend/docs/documents-atlas-index.md, sveltekit-frontend/memory/atlas/documents-atlas.latest.md
- 711ff33e746a: sveltekit-frontend/.tmp/offline-analysis/fe-graph-nes-glyph-architecture.json, sveltekit-frontend/docs/graph/nes-glyph-architecture.json
- 832c3405615e: sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json, sveltekit-frontend/docs/graph/multihop-codebase-map.json
- a16a1789685b: crates/atlas_packet_parser/target/release/deps/libtokio-76cb0057c770fb13.rlib, crates/turbovec-napi/target/release/deps/libtokio-76cb0057c770fb13.rlib
- a9986bb627c9: simd-bridge/rust/hmm-repair/hmm-repair.node, simd-bridge/rust/hmm-repair/target/x86_64-pc-windows-msvc/debug/deps/hmm_repair.dll, simd-bridge/rust/hmm-repair/target/x86_64-pc-windows-msvc/debug/hmm_repair.dll
- 1299c11d7cf6: models/embeddinggemma_300m_onnx/tokenizer.model, models/embeddinggemma_300m/tokenizer.model, models/gemma3_270m/tokenizer.model, models/gemma3-client-onnx/tokenizer.model, sveltekit-frontend/static/embeddinggemma_300m_onnx/tokenizer.model, sveltekit-frontend/static/gemma3_270m_onnx/tokenizer.model, sveltekit-frontend/static/models/embeddinggemma_300m_onnx/tokenizer.model
- 6ae11e450270: crates/turbovec-napi/target/release/deps/libregex_syntax-b4ea55b4904cd38e.rmeta, simd-bridge/rust-simdjson/target/release/deps/libregex_syntax-b4ea55b4904cd38e.rmeta
- 8b9a899809ce: simd-bridge/rust/graph-engine/target/release/deps/libregex_syntax-91006f1627c764e2.rmeta, simd-bridge/rust/hmm-repair/target/release/deps/libregex_syntax-91006f1627c764e2.rmeta
- e7bbae0a9867: crates/atlas_packet_parser/target/release/deps/librayon-d503ad71c000e71b.rlib, crates/turbovec-napi/target/release/deps/librayon-d503ad71c000e71b.rlib
- fc01da221826: crates/atlas_packet_parser/target/release/deps/libaho_corasick-6d0f470f6222390b.rlib, simd-bridge/rust-simdjson/target/release/deps/libaho_corasick-6d0f470f6222390b.rlib
