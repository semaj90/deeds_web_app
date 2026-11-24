# Parent Atlas Glue Gap Review v2

**Date:** 2026-11-23  
**Scope:** Reconcile the five proposed architecture gaps against current owners and harden the PG18-to-compute replay boundary.  
**Authority:** Read-only discovery; no canonical database, graph, cache, or projection writes.

## Decision

The proposed five gaps are not all missing. The repository already has a transactional outbox, RRF/fusion owners, a versioned ARPC envelope, and WebGPU row-pitch alignment helpers. Adding replacement tables, another fusion owner, a second envelope, or custom UDP/QUIC would duplicate existing responsibilities. The outstanding end-to-end gap is qualified, current candidate lineage through compute and back to the canonical identity owner.

## Existing owners checked

| Proposed gap | Current owner/evidence | Assessment |
| --- | --- | --- |
| Drizzle/PostgreSQL transactional outbox | `sveltekit-frontend/src/lib/server/agent/action-writer.ts` inserts outbox rows in the same transaction; `outbox-worker.ts` claims and dispatches them; `schema-postgres.ts` defines `outbox_events`. | **Exists.** This does not prove every external index has a live idempotent consumer or current production readback. Extend the owner only for a demonstrated missing event/consumer. |
| Unified RRF and ID normalization | `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts`, `rrf-contract.ts`, `search-results-aggregator.ts`; project policy assigns production fusion to SearchRuntime. | **Exists with consolidation risk.** Legacy fusion helpers remain. Do not add a new RRF merger; verify callers converge on the SearchRuntime owner and each logical lane casts one vote. |
| Binary envelope | `sveltekit-frontend/src/lib/gpu/arpc-envelope-v1.ts` defines ARPC magic/version/codec/body length/SHA-256 and raw, MsgPack, zlib, and LZ4 codec IDs; Python counterpart is `python/atlas_graph_runtime/duckdb_bytea_rpc_packet_v1.py`. | **Exists.** Keep JSON/MsgPack for bounded control metadata as allowed; avoid Base64 for hot binary payloads. No second FlatBuffers envelope is justified by current evidence. |
| GPU/WASM alignment | `arpc-envelope-v1.ts` enforces 256-byte WebGPU row pitch and 16-byte uniform-buffer alignment. | **Helper exists.** A live end-to-end renderer handoff still needs its own consumer proof; the helper alone does not prove that path. |
| Custom UDP/QUIC transport | No evidence found that raw UDP is part of the current production path. Existing HTTP and ARPC adapters cover the present handoff. | **Not a blocker.** Use a standard transport only if measured requirements call for it. Do not build a custom reliability/framing layer. |

## PG18 ↔ Arrow replay hardening

`python/atlas_graph_runtime/pg18_arrow_ipc_roundtrip_v1.py` is a local replay/transport helper, not the canonical PG18 query owner. Its prior scoring path falsely set `verifiedClaim=true` and reused PUCT reward scoring for ordinary feature ranking. Its prior live query also supplied a missing `source_revision` from the requested workspace revision and assigned a constant `0.5` score. Those fields could make an unqualified scan look admitted and ranked.

The helper now ranks only finite, caller-supplied `feature_score` values with deterministic ordinal tie-breaking. It no longer emits a verified-claim flag. The old live extractor fails closed with `PG18_QUALIFIED_CANDIDATE_QUERY_REQUIRED`; a future live adapter must receive a current authorized candidate set from the canonical retrieval owner, without inventing revisions or scores.

The Arrow schema and ARPC result now carry an `ordinal_map_checksum` over `(ordinal, candidate UUID, source revision, task ID)`, alongside the snapshot checksum over `(ordinal, candidate UUID)`. Rejoin checks both checksums, dense unique ordinals, candidate UUID uniqueness, bitmask bounds, and workspace/snapshot identity. This protects the sidecar identity fields that the narrower snapshot checksum intentionally does not cover.

## Live evidence and limitations

- Corrected read-only PostgreSQL audit (`.tmp/atlas/lineage-semantic-768-cohort-live-refresh-v5-20261123.json`): 15/15 rows match exact `source_ref` and chunk hash, and 15/15 match a `PROVEN` packet-lineage identity and source revision. `CandidateOrdinalMap.identityAuthority=false` is intentional by contract, not an admission failure. None of the 15 candidates has a workspace binding for its requested revision; each packet has four bindings, but the map's workspace revision matches 0/60 bindings. The denormalized chunk rows also have 0 source/workspace revision matches, 0 producer metadata, and 0 representation revisions. Vector digests were recomputed from PostgreSQL float32 values for audit only. Result remains `SEMANTIC_768_COHORT_BLOCKED`, 0/15 qualified; no candidates were admitted or changed.
- Live `:8095` OAK search returned `OAKLIB_SOURCE_NOT_CONFIGURED`. No relation was mapped or admitted.
- The live Atlas RAG context tool returned `MISSING_SOURCE_REVISION` and `UNADMITTED_RETRIEVAL_CANDIDATES`; it is discovery evidence only and was not used as a source of truth.
- Focused replay tests: `C:\Python313\python.exe -m pytest python/tests/test_pg18_arrow_roundtrip_v1.py python/tests/test_step1_ast_obo_nibble_rpc_v1.py -q` → **6 passed in 2.11s**.
- Existing-owner regression checks: ARPC envelope, transactional action/outbox, RRF fusion and canonical identity tests → **50 passed across 4 Vitest files** (Vitest 3.2.4; 7.29s).
- `git diff --check` passed at the time of this report.
- No live graph admission, ACE manifest, cache write/readback, GPU execution, training, or task promotion was performed.

## Next implementation gates

1. Replace the stale/non-authoritative candidate map with a cohort emitted by the existing source and retrieval admission owners; require exact source/content/workspace/representation revisions and model metadata.
2. Export that admitted cohort under one repeatable-read snapshot into Arrow IPC; compute scores in the selected CPU/GPU lane and rejoin through the sealed ordinal map.
3. Feed only the revalidated result into the existing ContextManifest/ACE path, then independently verify citations. Keep relation admission and Valkey cache publication as separate gates.
4. Reconcile any remaining legacy RRF callers to SearchRuntime. Do not add a second outbox, envelope, ranking owner, ontology store, or transport protocol absent a measured requirement.

**Status:** `PARTIAL`. The replay contract is safer and fixture-proven; canonical live cohort admission and full retrieval-to-ACE readback remain open.
