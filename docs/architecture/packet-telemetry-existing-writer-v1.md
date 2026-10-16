# Packet telemetry persistence through existing owners

Read-only TRACE MCP schema inspection found `phase_2_telemetry` absent, the existing `retrieval_telemetry` table without a JSONB payload column, and `atlas_retrieval_eval_times` present with a JSONB payload. All 23 insert columns used by its existing recorder are present; only its `id` column is non-nullable. Evidence: `docs/reports/parent-atlas-existing-telemetry-schema-20261016T0410Z.json`.

## Implementation

- `retrieval-recorder.ts::recordRetrievalEvalTelemetry` factors the existing eval-table INSERT into one reusable owner. The general retrieval recorder and packet telemetry fallback call it; no second eval INSERT, client or table is added.
- When `phase_2_telemetry` is unavailable, packet context and codec observations go into that existing JSONB payload. The former legacy fallback omitted required query fields and lost enriched provenance.
- ACE's legacy retrieval signal disables its generic eval mirror, preventing a second eval row alongside the enriched packet writer. The legacy retrieval row and existing concept telemetry behavior otherwise remain with their original owner.
- Unknown query hashes, packet IDs, latency, protocols, accelerators and cache-source names stay null. A cache-hit boolean alone does not establish a Redis hit. Query text is hashed when available, not copied into the new enriched payload.
- The ACE caller no longer inserts guessed embedding, tool, GPU-kernel or RPC version labels. Explicit measured transport observations override a conflicting caller transport label; unrelated model/kernel identities remain unknown unless provided.
- Transport observation payloads use a strict schema with finite nonnegative timings and byte counts; extra payload fields are rejected. Canonical packet/source identity is never derived from these observations.

## Qualification

Focused tests exercise writer parameters with a mocked database, source/protocol/payload preservation, missing-table fallback, operation-only events without invented query identity, no fallback on unrelated database errors, codec schema validation, and ACE mirror suppression. This is implementation and contract proof—not a live inserted-row/readback receipt.

No table, migration, source revision, cache entry or model artifact was changed. The schema inspection read metadata only. Actual telemetry insertion/readback, approved live request propagation, resource measurements for every operation, and full source/packet/ContextManifest lineage remain open. Keep source-revision writes/backfills deferred to the post-P20 gates.
