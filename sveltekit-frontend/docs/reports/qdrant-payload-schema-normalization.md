# Qdrant Payload Schema Normalization

Generated: 2026-06-14T20:19:09.143Z
Mode: dry-run
Collection: codebase_chunks_768
Source table: atlas_codebase_packets
Database: postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db

## Summary

- Postgres rows scanned: 25
- Postgres rows matched: 2
- Rows updated: 0
- Rows already canonical: 2
- Rows skipped: 23
- Rows ambiguous: 18
- Rows unmatched: 5
- Qdrant points scanned: 52606
- Qdrant points updated: 0
- Qdrant points already canonical: 2

## Field Coverage

- packet_key: 2/2 (100%)
- source_ref: 2/2 (100%)
- file_path: 2/2 (100%)
- feature_id: 2/2 (100%)
- feature_label: 2/2 (100%)
- community_id: 2/2 (100%)
- community_confidence: 1/2 (50%)
- lineage_version: 2/2 (100%)
- ledger_type: 2/2 (100%)
- domain: 2/2 (100%)
- metadata: 2/2 (100%)

## Sample

- src/lib/components/ui/gaming/n64/N64ToastStore.svelte.ts:f862ac872cbe1a1c | point=1573187133 | already-canonical | packet_key
- dc10d9a29ef4cfc8 | point=3692091810 | already-canonical | packet_key
