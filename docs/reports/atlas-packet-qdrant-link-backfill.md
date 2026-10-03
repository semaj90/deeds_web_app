# Atlas Packet Qdrant Link Backfill

- status: PASS
- mode: apply
- collection: codebase_chunks_768
- packets_loaded: 55233
- all_packets_loaded: 61718
- qdrant_points_scanned: 328348
- matches: 16783
- updated: 16783
- skipped_duplicate_packet: 151431
- already_linked_seen: 107865
- no_postgres_join_seen: 52269

## Matched Samples

- ace:packet:7c2c618045d0 -> 5006 via ace:packet:7c2c618045d0 (768d)
- ace:packet:d58b42a5c209 -> 5012 via ace:packet:d58b42a5c209 (768d)
- ace:packet:8866c9478344 -> 5018 via ace:packet:8866c9478344 (768d)
- ace:packet:3ec24fbd8d63 -> 5026 via ace:packet:3ec24fbd8d63 (768d)
- ace:packet:17a393039cf4 -> 5029 via src/lib/server/ai/linter-service.ts (768d)
- ace:packet:8c5278996cf1 -> 5037 via src/lib/server/retrieval/citation-graph.ts (768d)
- ace:packet:356327d10270 -> 5039 via ace:packet:356327d10270 (768d)
- ace:packet:fa756e93ee4b -> 5047 via src/lib/components/evidence/EvidenceUploadResults.svelte (768d)
- ace:packet:fed8b7be3c76 -> 5055 via ace:packet:fed8b7be3c76 (768d)
- ace:packet:294df63fc670 -> 5063 via ace:packet:294df63fc670 (768d)

## Already Linked Samples

- packet:6b86b273ff34 -> 1 (1)
- ace:packet:3362030dfe23 -> 2 (src/AGENTS.md)
- ace:packet:3362030dfe23 -> 3 (src/AGENTS.md)
- ace:packet:3362030dfe23 -> 4 (src/AGENTS.md)
- ace:packet:b5aa13ce0a61 -> 5 (src/hooks.server.ts)
- ace:packet:b5aa13ce0a61 -> 6 (src/hooks.server.ts)
- ace:packet:b5aa13ce0a61 -> 7 (src/hooks.server.ts)
- ace:packet:b5aa13ce0a61 -> 8 (src/hooks.server.ts)
- ace:packet:b5aa13ce0a61 -> 9 (src/hooks.server.ts)
- ace:packet:b5aa13ce0a61 -> 10 (src/hooks.server.ts)

## No Postgres Join Samples

- 000a3323-a67a-4ca9-a6fc-bed05d9513dc: scripts/atlas/neo4j-gds-pagerank-fixed.mjs
- 000cdcf2-db09-4bb2-a2c0-b315b701dea9: packages/parent-atlas/src/core/parameter-artifact-v1.spec.ts
- 00135cf1-8ed4-4d93-bc07-a4e0fd5537cd: scripts/launchers/llama_server/README.md
- 0013b17e-f672-46ef-8e16-0673fc3c7ca1: sveltekit-frontend/src/lib/server/atlas/features/manifold4-orientation-v1.ts
- 001606c8-e0c4-49cb-a395-ca1cbbbee161: sveltekit-frontend/drizzle/0111_phase111_evidence_ledgers.sql
- 00180b67-7ba6-47ee-a075-e94db1792e6d: packages/parent-atlas/src/core/lsp-semantic-observation.ts
- 001a95bb-d04f-471f-8a90-5e86bfd8368c: sveltekit-frontend/src/lib/server/atlas/classification/structural-code-role-classifier-v1.ts
- 001bb70b-8749-42ae-a1c7-c5216a667d8e: sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-observation-v1.spec.ts
- 001da069-d92f-486a-b131-918b52aedb44: sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts
- 001e4707-272e-475e-ae72-a2b0c31138c5: sveltekit-frontend/src/lib/server/retrieval/repair-mrl-feature-producer-v1.ts

## Errors

- none
