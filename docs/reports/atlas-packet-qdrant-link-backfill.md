# Atlas Packet Qdrant Link Backfill

- status: PASS
- mode: apply
- collection: codebase_chunks_768
- packets_loaded: 56933
- all_packets_loaded: 61659
- qdrant_points_scanned: 5000
- matches: 1636
- updated: 1636
- skipped_duplicate_packet: 2373
- already_linked_seen: 991
- no_postgres_join_seen: 0

## Matched Samples

- packet:6b86b273ff34 -> 1 via 1 (768d)
- ace:packet:3362030dfe23 -> 2 via src/AGENTS.md (768d)
- ace:packet:b5aa13ce0a61 -> 5 via src/hooks.server.ts (768d)
- ace:packet:83dc9fe1e87d -> 13 via src/lib/AGENTS.md (768d)
- ace:packet:c113744e3e98 -> 17 via src/lib/ai/AGENTS.md (768d)
- ace:packet:73c63464e142 -> 23 via src/lib/ai/e2b/AGENTS.md (768d)
- ace:packet:b5295274e2b7 -> 28 via src/lib/ai/onnx/AGENTS.md (768d)
- ace:packet:756ddd25ac36 -> 32 via src/lib/cache/AGENTS.md (768d)
- ace:packet:6061bede0c9f -> 38 via src/lib/client/AGENTS.md (768d)
- ace:packet:4758b464fae1 -> 42 via src/lib/client/ui/AGENTS.md (768d)

## Already Linked Samples

- packet:f687fb79f3a0 -> 1006 (packages/parent-atlas-retrieval/src/gpu/gpu-job-queue.ts)
- packet:d9e64f3ffe88 -> 1014 (packages/parent-atlas-retrieval/src/turbovec/authority-chain.ts)
- ace:packet:e5c128787e15 -> 1018 (docs/architecture/CUVS-INSTALLATION-WINDOWS-RESEARCH.md)
- packet:d2ff29a3744b -> 1023 (simd-bridge/cpp/build-x64-cuda/CMakeFiles/4.0.0/CompilerIdCXX/CMakeCXXCompilerId.cpp)
- packet:c1ad51edd3a9 -> 1028 (src/routes/api/chat/stream/+server.ts)
- packet:ebb4a666c7d8 -> 1032 (scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ast/analyze/+server.ts)
- packet:9f38cd778699 -> 1035 (scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/chat/+server.ts)
- packet:b9e1c61fc9a3 -> 1036 (packages/parent-atlas-retrieval/tests/bifrost/bifrost-semantic-cache.spec.ts)
- packet:0b490741e82a -> 1037 (scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/rerank/LLMS.md)
- packet:f7bef1b68082 -> 1038 (docs/metadata-contract-schema.yaml)

## No Postgres Join Samples


## Errors

- none
