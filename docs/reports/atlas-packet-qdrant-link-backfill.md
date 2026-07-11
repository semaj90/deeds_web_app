# Atlas Packet Qdrant Link Backfill

- status: WARN
- mode: dry-run
- collection: codebase_chunks_768
- packets_loaded: 55042
- all_packets_loaded: 58365
- qdrant_points_scanned: 10
- matches: 0
- updated: 0
- skipped_duplicate_packet: 0
- already_linked_seen: 0
- no_postgres_join_seen: 10

## Matched Samples


## Already Linked Samples


## No Postgres Join Samples

- 990761: sveltekit-frontend/src/routes/(analysis)@
- 1167479: unknown
- 1181912: unknown
- 1576768: claude-mem/plugin/modes
- 1636755: unknown
- 2021966: unknown
- 2434769: scratch/index-checkpoints
- 3085081: unknown
- 4006069: sveltekit-frontend/memory/reconstruction
- 4180125: claude-mem/tests/services/sqlite

## Errors

- Bounded scan found no missing-link updates. Scanned points were already linked or had path-drifted Qdrant payloads.
