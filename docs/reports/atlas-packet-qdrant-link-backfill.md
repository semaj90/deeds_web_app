# Atlas Packet Qdrant Link Backfill

- status: PASS
- mode: apply
- collection: codebase_chunks_768
- packets_loaded: 55297
- all_packets_loaded: 61659
- qdrant_points_scanned: 5000
- matches: 3
- updated: 3
- skipped_duplicate_packet: 5
- already_linked_seen: 4992
- no_postgres_join_seen: 0

## Matched Samples

- ace:packet:cd6922aaf309 -> 2233 via src/lib/server/services/AGENTS.md (768d)
- packet:4667d26f62f6 -> 2443 via src/lib.rs (768d)
- packet:09cea175fcb5 -> 4915 via src/mcp/server.ts (768d)

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


## Errors

- none
