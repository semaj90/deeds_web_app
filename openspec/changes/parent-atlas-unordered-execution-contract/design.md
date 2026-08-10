# Design: AtlasEnvelopeV1 + Phase Sequencing

## D1 — Why not literally adopt QUIC/gRPC

QUIC's actual mechanism: UDP datagrams are unordered at the transport layer;
each packet carries a strictly-increasing packet number from one of three
independent number spaces (Initial/Handshake/Application); the packet number
also feeds the AEAD nonce, so integrity and ordering are both derived from
the same authenticated field. HTTP/3 then maps each logical stream
(equivalent to one gRPC call) onto an independent QUIC stream, so loss on one
stream doesn't stall unrelated streams (fixes TCP/HTTP-2 head-of-line
blocking).

None of that is a transport Atlas needs today: the TypeScript control plane
talks to the Python NLP sidecar and the RAPIDS GPU sidecar over local
HTTP/JSON, not over a lossy public network, and there is no head-of-line
blocking problem to solve. What *is* directly reusable is the **design
principle**: separate "did this arrive" (transport, not our problem) from
"is this the current, non-duplicate, correctly-attributed result for this
identity" (our actual problem, solved with an envelope + validator, not a
transport protocol).

## D2 — AtlasEnvelopeV1 shape

```typescript
interface AtlasEnvelopeV1 {
  request_id: string;
  packet_key: string;              // canonical identity (Atlas Lineage Contract)
  source_ref: string;
  workspace_revision: number;
  source_revision: number | null;  // SOURCE_NOT_LOCATED per existing spec until backfilled
  representation_revision: number;
  graph_revision: string | null;   // topology_hash, only when the pass consumes graph state
  producer: string;                // e.g. 'nlp-sidecar', 'gpu-rapids-sidecar', 'neo4j-gds'
  producer_revision: string;
  pass_name: string;               // e.g. 'minilm_rerank', 'ast_extract', 'pagerank'
  pass_revision: string;
  ordering_scope: 'none' | 'per-packet-key' | 'per-batch';
  sequence_number: number | null;  // only set when ordering_scope !== 'none'
  input_hash: string;              // sha256
  output_hash: string;             // sha256
  schema_version: string;
  idempotency_key: string;         // sha256(producer + pass_name + packet_key + input_hash)
}
```

Most passes (MiniLM rerank, AST extract, PageRank, semantic_768 embed) have
`ordering_scope: 'none'` — they are joined by `packet_key`, not sequenced.
`ordering_scope: 'per-batch'` exists for genuinely chunked bulk transfers
(e.g. a large NDJSON export split into `batch_id`/`chunk_index`/`chunk_count`)
— that is the *only* place a `sequence_number` gap check applies.

## D3 — AtlasEnvelopeValidator (10 checks, in order)

1. schema valid (`schema_version` known, envelope parses)
2. producer/pass known (registered in `runtime-ownership-registry.json` or
   an equivalent pass registry — do not accept an unregistered producer)
3. canonical identity resolvable (`packet_key` joins to a live
   `atlas_packets` row)
4. revision current (`workspace_revision`/`source_revision` not stale vs.
   the frozen graph/source snapshot in play)
5. input hash valid (matches expected input for that `packet_key` + pass)
6. output hash valid (well-formed, non-empty for the pass's declared output
   shape)
7. duplicate idempotency key → reject/no-op re-materialization, not an error
8. predecessor sequence valid — **only** checked when `ordering_scope !==
   'none'**
9. representation IDs compatible (no mixing `source_representation_id` and
   `projection_representation_id` across a join)
10. graph revision compatible (only when the pass consumed graph topology)

Join/materialization logic (candidate FeatureRow assembly) treats a missing
required feature as `missingMask`-flagged, not as a blocking error — this is
the direct analogue of QUIC stream reassembly: a slow/missing signal for one
`packet_key` doesn't block materialization of other `packet_key`s.

## D4 — Stable sort boundary

Sorting (`Array.prototype.sort`, effectively Timsort in V8) is applied
**only** to the already-validated, already-joined candidate list, with an
explicit deterministic tie-break:

```
sort by: score DESC, canonical_candidate_id ASC
```

This is not a correctness primitive — it is presentation/selection over data
whose correctness was already established by the envelope validator. On
RTX-class hardware, top-k selection over large candidate sets should prefer
`cuVS select_k`/GPU primitives over a CPU sort once volumes justify it — that
is a performance decision, not a correctness one, and is deferred to Phase 8.

## D5 — Space separation (corrects an earlier "Hilbert space range" framing)

A Hilbert space has no single scalar "range" — that framing was imprecise.
What Atlas actually has:

- `semantic_768`: `R^768`, L2-normalized → lies on `S^767 ⊂ R^768`
  (`‖x‖₂ = 1`), cosine similarity range `[-1, 1]`. This is where hypersphere
  ANN backends (TurboVec, cuVS CAGRA/brute-force) operate.
- `ExperimentFeatureMatrix`/`FeatureRowV1`: `R^F`, heterogeneous per-feature
  ranges declared in `FeatureRegistry` (see spec) — e.g. `dense_cosine ∈
  [-1,1]`, `exact_symbol ∈ [0,1]`, `pagerank ∈ [0,∞)`, `kcore` integer.
- `control5`: a separate small coarse-routing confidence space.

These three spaces are never collapsed into one normalization or one range.
`FeatureRegistry` entries carry `normalization_revision`, `expected_range`,
`missing_policy` so a future linear/learned ranking head has declared,
checkable input contracts per feature — this is prep for Phase 6/7, not
implemented by this change.

## D6 — n-ary hyperedges vs. ordered DAG traces

`SUCCESSFUL_REPAIR(symbol_A, symbol_B, patch, test)`-style hyperedges are
unordered co-membership sets. Canonicalize member `role` + a
`canonical_member_id` ordering *only* for deterministic `hyperedge_hash`
computation — this ordering is a hashing convenience, never semantic. If a
process genuinely has temporal/causal order (retrieve → inspect → patch →
compile → test), model it as a DAG process trace, not as an "ordered
hyperedge" — hyperedges and DAGs are different structures and must not be
conflated.

## D7 — Relationship to existing registries

`AtlasEnvelopeValidator`'s "producer/pass known" check (D3.2) reuses
`docs/architecture/runtime-ownership-registry.json` (added by the Runtime
Owner Deduplication governance gate this session) as its source of truth for
registered producers — no second registry.

## D8 — Non-goals reiterated

No gRPC/HTTP-3/QUIC transport migration. No TLS/AEAD implementation. No new
hypergraph-specific algorithms. No implementation of Phase 1-10 line items by
this change — this change captures the envelope/validator contract (Phase 10)
and the sequencing plan; each later phase gets its own explicit go-ahead per
this repo's gate-by-gate discipline.
