# Artifact Tiering Application

Generated: 2026-06-19T22:39:31.393Z
Mode: MANIFEST_APPLIED

No file was moved, compressed, or deleted. This pass applies storage
decisions to a manifest; destructive actions remain gated by restore proof.

## Decisions

- keep_canonical: 6721 files / 8379.85 MB
- move_to_cold: 51 files / 3845.08 MB
- compress_zstd: 89 files / 2500.93 MB
- index_metadata_only: 6 files / 366.77 MB
- delete_if_regenerable: 1378 files / 145.12 MB
- protected runtime artifacts: 6

## Runtime Protections

- `models/gemma4-legal-iq4xs-direct.gguf`: active llama-server chat model
- `models/mmproj-F16.gguf`: active VLM projection asset
- `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson`: canonical vector export
- `models/embeddinggemma-300m-f16.gguf`: local embedding fallback
- `sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson`: canonical hypergraph vector export
- `models/embeddinggemma-300m-q8_0.gguf`: local embedding fallback
