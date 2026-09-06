# Atlas Packet Qdrant Link Backfill

- status: WARN
- mode: apply
- collection: codebase_chunks_768
- packets_loaded: 55353
- all_packets_loaded: 61718
- qdrant_points_scanned: 5000
- matches: 0
- updated: 0
- skipped_duplicate_packet: 0
- already_linked_seen: 5000
- no_postgres_join_seen: 0

## Matched Samples


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

- Bounded scan found no missing-link updates. Scanned points were already linked or had path-drifted Qdrant payloads.
