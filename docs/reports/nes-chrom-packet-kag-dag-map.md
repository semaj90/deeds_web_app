# NES Chrom Packet + KAG DAG Map

This report records the compact packet layer that bridges retrieval, summary, and DAG hit tracking.

## Canonical join spine

- `chunk_id`
- `source_ref`
- `source_refs`
- `feature_id`
- `query_hash`
- `kag_dag_run_id`
- `packet_key`

## Durable stores

- PostgreSQL 18-compatible additive schema
- `jsonb` for packet payloads and hit evidence
- `pgvector` for 768-dim packet embeddings
- `Drizzle ORM` as the typed bridge

## Tables

### `nes_chrom_packets`

Use this table for the compact packet itself:

- `packet_key`
- `query_hash`
- `chunk_id`
- `source_ref`
- `source_refs`
- `feature_id`
- `lane`
- `model`
- `summary`
- `payload`
- `embedding`
- `kag_dag_run_id`
- `kag_node_key`

### `nes_chrom_kag_dag_hits`

Use this table for the hit list produced by KAG DAG and retrieval passes:

- `packet_id`
- `run_id`
- `chunk_id`
- `source_ref`
- `hit_type`
- `score`
- `node_key`
- `evidence`
- `metadata`

## Intended flow

1. Retrieval produces `chunk_id`-level candidates.
2. KAG DAG attaches node/path evidence.
3. NES chrom packet compresses the candidate set into a replayable summary packet.
4. Gemma4 consumes the packet.
5. The packet and hits remain queryable by `source_ref` and `feature_id`.

## Active integration hook

The ACE pack path now emits NES chrom packets during assembly:

- `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`
- persistence helper:
  - `sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts`

The packet writer uses the same join spine as the report:

- `queryHash`
- `chunkId`
- `sourceRef`
- `sourceRefs`
- `featureId`
- `kagDagRunId`
- `packetKey`

The current integration writes a compact packet plus best-effort KAG-style hits from:

- codebase chunks
- directory KAG context
- community context

## Read-only report seam

The canonical read/report seam for this lane is now:

- design map: `docs/reports/nes-chrom-packet-kag-dag-map.md`
- live report JSON: `docs/reports/nes-chrom-packet-recent-hits.json`
- live report Markdown: `docs/reports/nes-chrom-packet-recent-hits.md`
- report runner: `scripts/atlas/report-nes-chrom-packet-hits.mjs`
- live read/query route: `sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts`

The report runner is intentionally read-only:

- queries `nes_chrom_packets` and `nes_chrom_kag_dag_hits` when they exist
- supports `--sourceRef`, `--featureId`, `--queryHash`, `--parentAtlasCardId`, and `--limit`
- the SvelteKit route exposes the same read-only filters through GET and returns packets, hits, and a compact integrity summary
- writes a replay/integrity report without changing ACE retrieval behavior, packet contents, or schema state

## Current inspection findings

- writer path exists: `sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts`
- ACE assembly hook exists: `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`
- no earlier packet-table report/query consumer was found in the app or script lanes before `report-nes-chrom-packet-hits.mjs`
- `source_ref`, `source_refs`, `feature_id`, `query_hash`, and `chunk_id` are preserved in the packet lane
- `parentAtlasCardId` / `parent_atlas_card_id` is not a dedicated column in this lane and is not preserved as a stable canonical field today
- CHR97 and NES chrom are separate-but-adjacent lanes: CHR97 is the cartridge fast-path retrieval lane; NES chrom is the durable ACE packet/hit lane
- in the current local database, the NES chrom relations are present and the lane now has a seeded packet batch, so the live report returns rows rather than relation-gap state

## Why this exists

The repo already has the raw pieces:

- `context_timeline` for temporal audit events
- `engram_cards` for reusable memory
- `research_summaries` for durable summaries
- `atlas_chunks` for source-backed chunk data
- `kag_dag_runs` / `kag_dag_nodes` / `kag_dag_edges` for DAG execution

This layer compresses those into a packet-and-hit shape that is cheap to replay and easy to join.
