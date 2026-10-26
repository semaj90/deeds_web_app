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

### Selected-candidate handoff

`selectPacketTelemetryCandidates` in the existing packet telemetry owner is shared by `buildPacketCentricEvent` and ACE's `extractPacketAndFeatureIds`. The primary packet's feature, exact single `source_ref`, and string SOM cell come only from that same ranked row. A row without `packet_key` cannot become the primary row via an undefined-key comparison; duplicate later rows cannot silently enrich the selected row. Missing fields remain null. Feature-ID inventories remain separate from the selected packet's feature binding.

The actual `features/ai/ace/context-assembler.ts` caller now forwards this bound packet context and all selected packet keys rather than combining an independently selected feature with the first raw row's SOM cell. Tests exercise the real selector, ACE emitter and existing packet writer against a mocked database. This does not prove live context assembly, ContextManifest admission or source authority.

### ACP collector handoff

The existing `telemetry/acp-mcp-telemetry.ts` collector now projects strict `atlas.acp-observation.v1` operation summaries into the existing packet writer. The existing void-return recorder API is preserved; `recordPacketCentricTelemetryAcknowledged` shares its implementation and returns whether the database command completed. That boolean is not independent readback, an exactly-once guarantee, canonical admission or a promotion receipt.

Flush handles at most 16 events, shares concurrent flushes, removes only acknowledged events, and preserves events appended while a flush is pending. The volatile buffer defaults to 1,000 events, caps configuration at 10,000, and reports dropped-overflow counts. Unacknowledged or invalid observations remain in memory for a later flush, subject to the bound. There is no durable retry spool; process exit, explicit clear, overflow or loss of a per-invocation collector can still lose observations. A lost database acknowledgement can cause duplicate observations on retry. Do not call this guaranteed delivery.

Supplied packet context is snapshotted with each event; absent context remains unknown. New structured payloads exclude arbitrary routing metadata, tool arguments/results, parameter hashes and exception messages. The MCP wrapper's legacy Redis error metric now uses a fixed error category rather than the exception contents. Existing MCP wrappers dispatch the same handlers, label explicit `success:false` as failure, detach packet-writer flush from the result path, and destroy their interval in `finally`. Their legacy Redis metrics await behavior is otherwise unchanged.

The separate collector under `acp/acp-telemetry-collector.ts` remains an export/projection surface, not an additional writer. Actual per-request qualified packet context at dispatcher/MCP call sites, decision-to-final-result correlation, crash recovery, independent readback and live deployment still require proof. No new collector, database table or parallel sink was added.

### Dispatcher graph channel and writer consolidation

`DispatcherState` and the actual LangGraph annotation now retain optional explicit `packet_context` through graph execution and its final state. The dispatcher telemetry wrapper normalizes that supplied context without deriving it from candidates, paths or output text. A real compiled-graph fixture proves channel preservation and the same context reaching the existing packet writer, with node implementations and stores mocked. It is not live Ornith synthesis, canonical source qualification or ContextManifest admission.

The dispatcher wrapper no longer writes through passed Redis/PostgreSQL clients or assumes an `acp_telemetry` table. It hands a strict `dispatcher.node` operation observation to the existing packet writer asynchronously. Compatibility parameters remain accepted but unused for persistence; `redis_written=false` and `redis_key=''` explicitly report the absence of a new Redis metric. Historical Redis aggregation remains a reader and existing keys are untouched. Consumers must not treat its old data as a newly refreshed dispatcher projection.

`postgres_deferred=true` reports scheduling only, not command acknowledgement or independent readback. Zero confidence remains zero; handler exceptions and explicit failed states retain failure status without copying exception contents into the new payload. Per-RPC/tool trace details and cache-hit breakdowns are not yet migrated into this operation summary. Actual qualified context construction, request correlation, delivery guarantees, all node permission boundaries and production readback remain open.

### Explicit trace correlation

Telemetry carries an optional top-level `trace_id` separate from `packet_context.packet_id`. The existing canonical `ValidationSchema` string validator is reused with a local 128-character telemetry bound; no canonical identity formula or storage schema is changed. This validates only the supplied correlation string, not the source lineage or uniqueness of a request.

The actual dispatcher state channel and its observation retain the supplied trace through final state. ACP collector configuration snapshots the trace onto events; an explicit event-level null remains unknown rather than borrowing the collector default. MCP wrappers accept optional invocation metadata as their second argument, separate from tool arguments, so a `trace_id` inside user tool arguments is not automatically trusted. Existing one-argument callers remain valid and uncorrelated unless their caller supplies context.

ACE metrics accept `traceId`; the actual context assembler forwards `opts.traceId` to the existing packet writer. Both existing writer entrypoints preserve top-level trace IDs in JSONB payloads and reject conflicting top-level/ACP observation traces. Missing correlation is never derived from a packet key, source path, query hash, model identity or generated replacement. Historical events without correlation remain readable.

Focused tests prove explicit-value propagation, compiled-graph final-state preservation, MCP argument separation, null handling, size rejection, mismatch rejection and eval-fallback payload preservation. This is not a live single-request proof joining ACP, transport, ACE, Ornith and independent readback. Actual request context construction and transport/resource trace propagation remain open.

### Request-scoped transport and resource correlation

`packet-telemetry-context.ts` supplies an AsyncLocalStorage observation scope within the existing telemetry owner. Dispatcher and MCP wrappers establish it around handler execution. Nested calls inherit omitted context; explicit null clears it, and a new packet context replaces the old context rather than merging fields from different rows. Metadata is snapshotted/frozen and only known fields are retained. Invalid metadata runs the action with unknown observation context instead of blocking the handler or borrowing another request's identity. This is not an authorization or canonical identity mechanism.

Transport, failed-attempt, resource/store and inherited ACE observations retain the supplied trace. Existing writers reject conflicting known top-level and observation traces. Concurrent loopback gRPC/HTTP failure tests prove request isolation. Cached delivery uses the current request trace while historical transport measurements retain their original trace. The cache checksum now hashes the exact JSON-safe payload that is persisted, preventing undefined properties from causing false checksum misses after serialization; integrity checks are not weakened.

### Approved live diagnostic readback

The operator approved exactly one telemetry insert/readback. The guarded proof script issued the existing live TRACE `db.table_inspect` read-only tool request, observed actual HTTP JSON encoding/parsing, and called the existing packet writer. PostgreSQL 18.4 independently read back exactly one matching row (`id=31`) from `atlas_retrieval_eval_times` using a separate read-only client transaction. Transport payload equality passed. Receipt: `docs/reports/parent-atlas-telemetry-live-readback-2026-10-16T07-46-53-789Z.json`.

Packet/source/model/kernel identity remained unknown; this proves diagnostic telemetry delivery, not retrieval relevance, source authority, ContextManifest admission or Ornith synthesis. The approval marker was exclusively created before the one writer call and is consumed; do not repeat the insert without new approval. Source/revision writes, migrations, model loads and service restarts were not performed. A pg driver deprecation warning about concurrent client queries was captured in the complete run log and remains an operational follow-up.

Focused tests exercise writer parameters with a mocked database, source/protocol/payload preservation, missing-table fallback, operation-only events without invented query identity, no fallback on unrelated database errors, codec schema validation, and ACE mirror suppression. This is implementation and contract proof—not a live inserted-row/readback receipt.

No table, migration, source revision, live cache entry or model artifact was changed. Earlier schema inspection read metadata only; the subsequent explicitly approved run inserted one diagnostic telemetry row as recorded above. Packet-qualified request propagation, resource measurements for every operation, and full source/packet/ContextManifest lineage remain open. Keep source-revision writes/backfills deferred to the post-P20 gates.
