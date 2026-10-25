# SIMD JSON, Radix Sort, and Agentic Retrieval Alignment

Status: PARTIAL  
First blocking gate: PACKET-01  
Qualified packet: NOT_VERIFIED  
Graph snapshot binding: NOT_VERIFIED

## Findings

- The existing radix benchmark is a C++/CUDA CUB `DeviceRadixSort::SortKeys` implementation, checked against CPU `std::sort`. Its fixtures describe ACE residency keys. No application retrieval caller was found. Radix sort orders keys; it is not a query or ontology index.
- The server JSON bridge loads `simd-bridge/cpp/build/Release/tensorrt_bridge.node` when available, reports the backend actually used, and falls back to V8 `JSON.parse`. The existing typed NDJSON bridge validates parsed records and reports native/fallback counts.
- Focused Vitest results: packet identity and actor/workspace grant contract suites **20/20**; simdjson bridge and typed-evidence bridge suites **13/13**. The typed-evidence parity test loaded the native addon and verified alignment with V8 parsing on its frozen fixture. This proves fixture-level parser parity, not Graphify packet lineage.
- `parseNdjsonTypedEvidence` and `parseNdjsonTypedEvidenceStream` have no production Graphify caller in the searched source trees; current non-test use is the benchmark harness. Other application modules import the lower-level JSON bridge, which does not imply a qualified Graphify indexing flow.
- The current domain-candidate diagnostic contains 150 rows but binds **0** packet keys, source revisions, or workspace revisions. A separate workspace-admission receipt exists, but it does not retroactively bind those candidates or establish an authenticated actor's source grant.
- A separate historical packet-apply receipt reports 7,259 inserts/readbacks using `packet:<sha256(source_ref).slice(0,12)>`; its manifest says `UNDECIDED_PACKET_ADMISSION_OWNER_DECISION_REQUIRED` and `writesAuthorized: false`. This is not the current PacketKeyV2 recipe, whose inputs are repository scope, canonical source ref, and packet kind. Do not use those rows to qualify this run.
- The related read-only packet/chunk reconciliation is for the older workspace revision `sha256:e24bb971…`, not the newly admitted `sha256:23413763…` revision. It reports `PACKET_DIGEST_BRIDGE_MISSING`, **0** canonical packet digest matches, 3,230 legacy digest matches explicitly ineligible for promotion, and 20 packet digest mismatches. This confirms the old apply receipt cannot supply the missing qualified packet.
- A fresh read-only PacketKeyV2 census found **61,718** packet rows: **17,399** unique V2 derivations without collisions, **17,301** legacy 12-hex keys among them, **98** ACE-prefixed keys, and **44,256** with no membership in any recorded execution. One source ref was rejected; 61 RPC-method and one cluster-summary rows were non-file kinds. The query aggregates repository IDs across all Graphify executions by `source_ref`; it does not bind membership to the current admitted execution/workspace revision. Treat this as identity-collision evidence only, not canonical admission. Receipt: `.tmp/atlas/packet-key-v2-legacy-population-census-20261024.json` (`READ_ONLY`, `writesPerformed: false`).
- The latest `graphify-daily-workflow-receipt.json` is a read-only run (`b32c3f00-0b90-4dd5-8de0-d34a895ca57b`) with `canonicalWriteAttempted: false`; its next gate is `GRAPHIFY_RUN_WRITER_AND_SOURCE_BINDING_READBACK`. This is not a completed current Graphify execution suitable for downstream packet alignment.
- The referenced Graphify stage artifacts cover **30,247** files and report **14,817** structurally parsed files / **151,357** facts, but identity is `PARTIAL` (5 duplicate IDs), semantic is `PARTIAL`, GPU is `PARTIAL`, and evaluation is `PARTIAL`. The semantic stage labels its 24/24 sample as `HASH_SMOKE` from `deterministic-hash-embedder`; matching `semantic_768` dimension does not make these EmbeddingGemma vectors. The GPU stage's 24/24 probe hits are not a ranked retrieval Top-K receipt. The inspected stage outputs contain no PageRank result, Top-K candidate receipt, or low-rank prefill/synthesis receipt.
- `simdjson-codebase-indexer-v1.ts` is a test-only caller in the searched source trees. It parses JSON, assigns input-order ordinals, derives fallback feature labels from `source_ref`, and defaults absent manifold coordinates/grade scores. Its result explicitly sets `canonicalAuthority: false` and `writesPerformed: false`; do not wire its synthetic geometry into SearchRuntime ranking or canonical indexing.
- PostgreSQL's AIO and bitmap scans are planner/execution behavior. HNSW/IVFFlat are existing retrieval indexes. This audit does not justify a new canonical index table, a temporary database table, or a daily Graphify write. SearchRuntime remains the retrieval fusion owner; CAGRA is a separate optional ANN executor.

## Lineage gates

- Owners exercised: existing native simdjson bridge and typed-evidence parser through focused fixture tests; packet-key resolver and actor/workspace grant contracts through focused tests.
- Owners missing for a vertical execution: a single independently authorized, revision-qualified canonical packet; a production Graphify caller for the typed NDJSON bridge; an observed Graph snapshot bound to that packet.
- Identity fields preserved: none demonstrated end-to-end for one packet.
- Identity fields missing: packetKey, canonical source identity, symbol/tree identity, and per-candidate source/workspace revision binding.
- Revisions proven: the workspace-admission receipt exists independently; parser contract revision is declared in source.
- Revisions missing: packet-bound workspace/source revisions and graph snapshot revision.
- Evidence preserved: frozen parser fixture parity only; no live source evidence traversed the parser-to-Graphify path.
- Routing, representation, retrieval, and ContextManifest: NOT_VERIFIED for a common packet/run.
- Negative control: packet/grant owner suites passed, but no common-packet vertical negative control was run.

## Decision

Do not connect GPU radix sorting to agentic search. Keep it in its residency-key benchmark lane. Reuse the existing simdjson parser as a bounded transport parser only after selecting a qualified packet and identifying the real Graphify ingestion caller. Then compare native parsing and V8 on the same frozen input, validate typed output, and preserve input/output checksums and identity. Do not add database tables or run daily Graphify as part of this audit.

Report-file output: this diagnostic report was written. Persistent database, cache, Graphify, and GPU writes: none.

```yaml
likely_cause: The native parser and radix benchmark exist as separate components, but no qualified packet or production Graphify caller connects typed NDJSON parsing to an admitted retrieval flow.
evidence:
  - sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts
  - sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts
  - native/ace-radix-01/radix_bench.cu
  - .tmp/atlas/domain-review-v3/diagnostic-readback-v1/receipt.json
  - focused tests: 20/20 identity/grant; 13/13 simdjson/typed-evidence
patch_targets:
  - sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts (review/integration only after PACKET-01)
safe_next_command: "rg -n 'parseNdjsonTypedEvidence(Stream)?' sveltekit-frontend/src scripts/atlas"
smoke_command: "cd sveltekit-frontend && npx vitest run src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.spec.ts src/lib/server/gpu/simdjson-bridge.spec.ts"
report_path: docs/reports/simdjson-radix-agentic-retrieval-alignment-20261024.md
```
