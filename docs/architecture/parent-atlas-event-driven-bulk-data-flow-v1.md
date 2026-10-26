# Parent Atlas Event-Driven Bulk-Data and Recommendation Flow (v1)

**Status:** design and measurement contract; not an implementation or production-readiness claim
**Purpose:** explain how indexed evidence, compact bit encodings, offline aggregates, Arrow IPC, CPU/GPU scoring, RPC descriptors, retrieval, and ACE context fit together—and provide a reproducible 0–100% progress measure.

## 1. Scope and non-goals

This document defines a bounded, evidence-driven path from a frozen audit/index snapshot to a reviewable recommendation. It does not authorize database, Valkey, CouchDB, Qdrant, Neo4j, cache, model, or GPU writes. Each existing owner remains authoritative for its layer; this document coordinates contracts rather than adding a parallel runtime owner.

It does not assume that an NES palette is approved, that a particular bit layout is canonical, that a GPU tensor transport exists, or that a recommendation is an ACE-admitted fact. Do not infer those facts from file presence, tests, MCP discovery, or this plan.

## 2. The whole flow

```text
Audit/request event
  -> validate request, caller permissions, run ID, frozen snapshot and budgets
  -> FSM eligibility gate
  -> bounded independent evidence jobs (async I/O + CPU worker pool)
  -> validated per-job results and complete/partial receipt
  -> indexed facts + optional rebuildable MapReduce aggregates
  -> optional versioned bitset / compact categorical features
  -> CPU feature-matrix builder and deterministic CPU ranking oracle
  -> optional Arrow IPC artifact + small RPC/gRPC descriptor
  -> optional, separately approved CUDA tensor batch and numerical challenger
  -> candidate retrieval/reranking with stable IDs and citations
  -> existing ACE ContextManifest owner selects token-bounded evidence
  -> Ornith proposal; sandbox tests; human review
  -> append-only, attributable outcome receipt
```

Every arrow is a gate. A stage may return `BLOCKED`, `PARTIAL`, `FAILED`, or `NOT_RUN`; downstream work must not reinterpret any of those as success. Independent work may run concurrently, but final ordering, merging, and receipt writing are deterministic and serialized.

## 3. Keep the representations distinct

| Representation | Meaning | Appropriate transport / owner | Not equivalent to |
|---|---|---|---|
| NES LUT output | Small categorical code or lookup result; exact semantics and palette version must be specified first | Typed field in a versioned evidence/feature schema | Semantic truth, an embedding, or a hash bucket |
| Bitset | Packed Boolean membership flags with an explicit bit order and schema version | PostgreSQL `bytea` only if an approved canonical owner needs it; otherwise a rebuildable artifact | A variable-width NES code or a float tensor |
| Valkey HyperLogLog | Approximate distinct-count sketch | Valkey HLL commands and a telemetry receipt containing the estimate and provenance | Exact audit count or source identity |
| Arrow IPC | Typed columnar batches / matrix data with schema and buffers | Versioned local/object artifact; RPC transports a descriptor | A 64-bit matrix, GPU allocation, or automatically zero-copy cross-process memory |
| CPU matrix | Ordered numeric feature rows for a deterministic baseline | Python/NumPy or an existing CPU numerical owner | Canonical identities; row ordinals must map back to stable candidate IDs |
| CUDA tensor | Bounded numerical batch copied to a device for a measured kernel | Existing approved numerical/GPU owner | Durable evidence, source identity, or a cache artifact |
| RPC descriptor | Artifact identity, schema/version, checksum, byte/row range, producer and expiry/access policy | MessagePack or protobuf/gRPC envelope | The artifact's payload or proof that the consumer validated it |
| ACE ContextManifest | Selected, grounded, token-budgeted evidence | Existing ACE/ContextManifest owner | Raw retrieval hits, tensors, hidden reasoning, or arbitrary worker output |

## 4. Encoding and byte-level contract

### 4.1 NES LUT and bit packing

Do not invent a 256/512-entry table until the project has decided what NES means, which palette/version is authoritative, and what each entry represents. The current reported Node/Python palette disagreement is a blocker to canonical use.

For any future packed flags or codes, freeze all of the following in a versioned schema before writing bytes:

- semantic field definition and source vocabulary;
- width in bits per value and whether values are signed;
- bit order within each byte (LSB-first or MSB-first), value order, and cross-byte behavior;
- reserved/unknown code behavior, overflow rejection, and collision policy;
- byte length, schema ID/revision, checksum, and decoding test vectors.

“1–7 bit” is not a complete encoding. A bitset uses one bit per Boolean flag; a compact category code uses enough bits for the category range. Do not conflate them. If PostgreSQL stores a canonical value, the typed schema and its owner define authority; `bytea` alone does not.

### 4.2 MessagePack and gRPC

Use MessagePack for small validated descriptors and receipts. Protobuf/gRPC is appropriate when a typed, versioned service contract and RPC lifecycle are needed. Both can carry byte fields, but neither provides provenance, alignment, access control, or meaning by itself. Keep large matrices and tensor contents out of routine RPC envelopes; pass a bounded descriptor and let an authorized consumer fetch and verify the artifact.

Descriptor minimum fields: `artifactId`, `schemaId`, `schemaRevision`, `producerId`, `producerRevision`, `sourceSnapshotId`, `contentSha256`, `mediaType`, `byteLength`, optional `rowStart`/`rowCount`, `createdAt`, and an explicit access/expiry policy. Reject path traversal, unapproved roots, checksum mismatch, schema mismatch, and out-of-range slices.

## 5. Event and concurrency contract

### 5.1 Event envelope

Each run starts with a validated envelope containing a unique `runId`, correlation/parent IDs, task or gate IDs, frozen input-manifest checksum, source/workspace revisions where known, authorization scope, deadline, and resource budget. Event data contains references to evidence, not hidden reasoning, prompt KV state, or unbounded payloads.

### 5.2 `async`/`await` is coordination, not CPU parallelism

- `await` waits for an awaitable and yields the event loop while asynchronous I/O is pending.
- Synchronous parsing, hashing, or Python CPU loops inside an `async` function still block its event loop unless offloaded.
- Use a bounded executor for CPU work, with separate queue limits and cancellation/timeouts. Threads suit I/O or native code that releases the GIL; processes may help CPU-bound Python but cost extra memory and serialization.
- Start with a small bounded pool (for example 2–4 jobs), then measure worker count, native thread count, queue depth, RSS, throughput, p95 latency, retries, and failures. Do not multiply per-process PyTorch/OpenMP thread pools without a budget.
- Keep per-MCP-server concurrency conservative until its protocol and server have been tested under concurrency. A query pool is not permission for unlimited MCP calls.
- Preserve stable task IDs and output order regardless of completion order. Record each rejection, timeout, cancellation, or malformed result; do not turn `Promise.allSettled` completion into a success status.

### 5.3 FSM transitions

`REQUESTED -> SNAPSHOT_VALIDATED -> ELIGIBILITY_CHECKED -> JOBS_RUNNING -> EVIDENCE_COMPLETE | PARTIAL | BLOCKED -> CPU_RANKED -> GPU_CHALLENGER (optional) -> CONTEXT_SELECTED -> SANDBOX_VALIDATED -> REVIEW_PENDING -> APPROVED -> APPLY_AUTHORIZED -> READBACK_VERIFIED`.

Only the existing approval/persistence owner may authorize `APPLY_AUTHORIZED`. Missing receipts and ambiguous evidence yield `BLOCKED` or `INCOMPLETE`, never negative training reward. A state transition is recorded only after its required typed result has been awaited and validated.

## 6. Offline aggregation and cardinality telemetry

1. Freeze and checksum the input index/snapshot. Preserve stable source, packet, chunk, and candidate IDs and revisions; never derive identity from row order.
2. Build or query CouchDB MapReduce views only as rebuildable aggregate projections. A map/reduce result is not canonical evidence and must carry the input/design-document revision and snapshot checksum.
3. For exact audits, use exact counts over the frozen input. For operational approximate telemetry, use Valkey HLL separately and label each result approximate.
4. Record HLL estimate, metric name, namespace, window, key schema revision, source snapshot checksum, query time, and configured retention. Do not export raw internal HLL register encoding as a stable interchange format.
5. Valkey documents a dense HLL representation of 12,288 bytes (plus header/key overhead), sparse encoding for smaller cardinalities, and 0.81% standard error. `PFCOUNT` may update its cached estimate, so it is not a strict no-write read. The deep-audit no-write path must continue to use an exact in-memory adapter unless its policy explicitly changes.

## 7. Build the CPU matrix first

The matrix builder belongs in the existing CPU numerical/data-preparation owner identified by the capability inventory; do not create a second builder until ownership is resolved.

Input rows must be frozen and independently qualified for the intended evaluation. Build a stable `candidateId -> rowOrdinal` map alongside the matrix, never inside the float values as identity. Define feature names/order, units/scaling, dtype, missing-value mask, clipping/normalization, categorical encoding, schema revision, and deterministic sort order.

Recommended sequence:

1. Validate source snapshot and feature provenance.
2. Materialize feature columns and missingness masks on CPU.
3. Validate matrix shape `[N,F]`, dtype, finite values, and row-map bijection.
4. Compute matrix and row-map checksums; persist only to an approved offline artifact location.
5. Run the deterministic CPU ranking/classification oracle and save scores by candidate ID.
6. Measure baseline quality, latency, and memory before any PCA/SVD, MLP, GPU, or clustering challenger.

No unreviewed domain labels become supervised targets. Unlabeled PCA/SVD/clustering is exploratory representation work, not a domain classifier.

## 8. Arrow IPC and the tensor boundary

Arrow alignment is a property of buffer addresses and IPC padding. It does **not** mean “an 8-byte/64-bit matrix.” The current Arrow format requires IPC buffer padding at least to 8-byte boundaries and recommends 64-byte alignment/padding where practical; consumer libraries and memory-mapping paths still need validation.

CPU path:

```text
validated source rows
  -> CPU feature matrix [N,F] + candidateId/ordinal sidecar
  -> Arrow IPC file (schema + RecordBatch buffers)
  -> checksum and descriptor
  -> Python Arrow reader / NumPy CPU array
  -> CPU oracle
```

Optional GPU path (not asserted to exist as a wired end-to-end flow):

```text
verified Arrow batch
  -> validate descriptor/checksum/schema/row map
  -> select bounded numeric columns on CPU
  -> CPU tensor/array with explicit dtype and contiguous layout
  -> explicit device transfer to CUDA by the approved numerical owner
  -> batch PCA/ranker/MLP kernel
  -> synchronize only at required result/timing boundary
  -> copy scores back, validate finite values and candidate IDs
  -> compare to CPU oracle and emit parity receipt
```

The matrix is built on CPU first. The CUDA tensor is created at the GPU executor boundary from a verified, bounded batch—not inside an AST parser, sidecar, RPC serializer, or HLL module. Do not allocate the workstation GPU until its operator resource gate is satisfied. Never store device tensors, optimizer state, KV state, or hidden thoughts in PostgreSQL, Valkey, Qdrant, or ACE.

## 9. Retrieval, ranking, decode, and learning

1. Retrieve candidates from existing SearchRuntime lanes and preserve canonical identity, lane provenance, source/workspace revisions, and exact source references.
2. Apply hard eligibility and permissions before scoring. A score cannot make an ineligible action eligible.
3. Establish deterministic CPU ranking as the oracle. Add PageRank, PCA/SVD features, XGBoost, MLP, or GPU scoring only as separately versioned challengers with frozen candidates and judged outcomes.
4. Compare ranking metrics such as Recall@K, MRR/NDCG where labels exist, abstention/calibration, latency, and resource use. Never infer recommendation quality from cluster stability, caller counts, or a successful forward pass.
5. Adaptive decode may ask for another bounded evidence retrieval step when confidence/evidence is insufficient. It must not alter permissions, invent source spans, bypass citations, or inject raw MCP output. The existing ACE ContextManifest owner controls evidence selection and token budget before Ornith sees anything.
6. MCTS may select among authorized, sandboxable experiments; its policy prior/value estimate is a proposal, not a verifier. Tests and independent evidence determine outcomes.
7. Store only attributable, verified outcome records. Distinguish `SUCCESS`, `PARTIAL`, `FAILED`, `BLOCKED`, `INCONCLUSIVE`, and `NOT_RUN`. A block caused by unavailable evidence is not a negative label.
8. Train or update a challenger offline from reviewed, versioned outcomes; preserve a held-out evaluation set, checkpoint checksum, rollback path, and CPU parity baseline. No online weight mutation from an unverified single event.

**GAN terminology:** the repository’s G56 “GAN” gate is an adversarial-fixture validation label, not evidence of a Generative Adversarial Network trainer. Keep those separate.

## 10. Progress: a reproducible 0–100% score

Report three percentages rather than one ambiguous “completion” number:

- **Artifact coverage:** required design/code/test artifacts exist and meet their local contracts.
- **Integration coverage:** actual callers connect the owners with typed, validated outputs.
- **Proof coverage:** frozen end-to-end runs, independent readback where applicable, and receipts meet acceptance.

For a single headline, use **Proof coverage**. Each checkpoint below has a fixed weight. Award a checkpoint only when its evidence is attached to the same frozen run/snapshot. Partial credit is allowed only for explicitly divisible subchecks, recorded in the checkpoint receipt; otherwise it is 0 or full weight.

| Checkpoint | Weight | Full-credit evidence |
|---|---:|---|
| C0. Scope, owners, and authority map | 8% | One owner per layer; actual callers inventoried; duplicates/missing owners explicitly unresolved; no owner inferred from filename alone |
| C1. Frozen input and source qualification | 12% | Snapshot/manifest checksum, denominator, source hashes/revisions, exclusions, and independent continuity audit |
| C2. Event envelope, FSM, and failure contracts | 10% | Schema validation, allowed transitions, timeout/cancel/retry behavior, idempotency, and negative tests |
| C3. Bounded async/CPU execution | 10% | Serial oracle; bounded pool; stable ordering; partial/failure receipts; concurrency, RSS and latency measurements |
| C4. Offline aggregation and HLL semantics | 8% | Rebuildable MapReduce proof; exact-vs-approximate distinction; HLL query/write semantics; retention and receipt validation |
| C5. NES/bit encoding and RPC descriptor | 8% | Palette meaning approved; bit order test vectors; schema/version/checksum; descriptor validation and bounded fetch; no payload leakage |
| C6. CPU matrix and ranking oracle | 12% | Deterministic `[N,F]` matrix, finite checks, stable ID/ordinal bijection, missingness policy, CPU ranking metrics and checksum |
| C7. Arrow IPC artifact round-trip | 8% | Typed schema, writer/reader cross-language round-trip, checksum, byte/row-range checks, mmap/copy behavior measured |
| C8. Optional CUDA challenger and parity | 8% | Separate resource authorization; bounded transfer; CPU/GPU numerical parity; quality, latency, VRAM and failure receipt |
| C9. Retrieval, citations, and ACE context | 10% | Candidate identity preserved, citations rebuilt from verified source bytes/spans, ContextManifest readback and token budget verified |
| C10. Outcome learning, security, and operations | 6% | Reviewed outcomes only; adversarial/schema tests; checkpoint/rollback; monitoring; authorized apply and independent readback gates |
| **Total** | **100%** | |

Formula: `proof_percent = sum(weight_i * earned_fraction_i)`. Every checkpoint receipt records `earned_fraction_i`, evidence references, snapshot/run ID, and missing prerequisites. Do not count a task checkbox, file existence, HTTP 200, model response, or one passing unit test as an end-to-end checkpoint.

#### Scoring protocol

- Declare the evaluation scope before scoring: one frozen snapshot, bounded cohort, query set, and intended execution path. A score for that scope is not a score for the whole repository or every supported language.
- Set `earned_fraction` to `1` only when the checkpoint's full acceptance evidence is present and independently checked. Use a value between `0` and `1` only for the checkpoint's explicitly listed, independently evidenced subchecks; otherwise use `0`.
- A blocked prerequisite earns no downstream credit. Preserve `BLOCKED`, `PARTIAL`, `FAILED`, and `NOT_RUN` as distinct statuses; do not turn a missing receipt into a failure label or silently omit it from the denominator.
- Example: if C0 (8%), C1 (12%), C2 (10%), and C3 (10%) are fully proven, and C4 (8%) has half of its enumerated subchecks proven, the raw score is `8 + 12 + 10 + 10 + 4 = 44%`. If C1 lacks a frozen checksum-qualified input, the 10% hard cap applies, so the reported headline is `10%`, not `44%`.
- Report the raw weighted score, any applied hard cap, the final headline, scope, and the blocking checkpoints together. Never round a capped or partial score upward to imply a passed gate.
- `PROVEN_FOR_FROZEN_SCOPE` means the defined proof gates passed for that exact scope; it does not mean production-ready. Production readiness remains a separate decision requiring operational and mutation authorization evidence.

### Hard caps (prevent misleading percentages)

- No frozen, checksum-qualified input: headline is capped at **10%**.
- No actual caller wiring for the measured path: capped at **30%**.
- No CPU oracle and deterministic candidate identity: capped at **55%**.
- No source-grounded retrieval and ContextManifest proof: capped at **75%**.
- Any partial result silently discarded, any permission bypass, or any unqualified identity promotion: status is **BLOCKED**, not a percentage claim.
- Production readiness is a separate Boolean gate, never implied by 100% design/artifact coverage. It requires authorized deployment, monitoring, rollback, and independent readback for every mutation.

### Required progress receipt

```json
{
  "schema": "ParentAtlasFlowProgressV1",
  "runId": "...",
  "snapshotSha256": "...",
  "scoreKind": "PROOF_COVERAGE",
  "percent": 0,
  "status": "BLOCKED | INCOMPLETE | PROVEN_FOR_FROZEN_SCOPE",
  "checkpoints": [
    {"id": "C0", "weight": 8, "earnedFraction": 0, "status": "NOT_RUN", "evidenceRefs": [], "blockers": []}
  ],
  "sideEffects": {"postgres": 0, "valkey": 0, "couchdb": 0, "qdrant": 0, "neo4j": 0, "gpuWrites": 0},
  "createdAt": "..."
}
```

The JSON above is a shape example, not a claim that this receipt schema or writer already exists. Validate it using the repository’s selected contract owner before implementation.

## 11. Current baseline and first blockers

The following are **reported in the supplied session notes, not independently re-run while authoring this document**:

- Capability owner matrix: 21/24 rows reportedly have files; caller scan reportedly found wired, script-only, test-only, duplicate, and missing rows. This is inventory evidence, not end-to-end proof.
- Reported missing capabilities include a governed NES 256/512 mapping, bit-encoding specification, GPU tensor transport, and GPU MLP backprop implementation.
- Reported non-test caller gaps include HLL telemetry and PCA/SVD/ranking alignment. Deep-audit HLL used an exact-set adapter, not persisted Valkey sketches.
- Reported mismatch between Node and Python LUT palettes remains a blocker to canonical LUT use.
- Existing Graphify lifecycle evidence is reported gated; all graph-dependent checkpoints must remain blocked until the canonical snapshot is current and independently qualified.
- No single verified index → aggregate → Arrow artifact → RPC descriptor → CPU/GPU score → retrieval → ACE ContextManifest execution was supplied.

Therefore this document defines **what to measure**, not a current completion percentage. Populate C0–C10 from fresh receipts for one frozen, bounded use case before extrapolating to a whole repository.

### 11.1 Focused recheck (2026-10-21)

- Three focused Vitest suites for DSPy-output validation, DAG synthesis, and repair-context replay passed **8/8**; strict OpenSpec validation passed. This proves bounded contracts/fixtures, not a live MCP → DSPy → ACE execution.
- A fresh read-only exact-hash join against `atlas_workspace_source_bindings` found **0** exact bindings for the captured `service-worker.ts` diagnostic and **0** for the current bytes of the 10 distinct R02 warning files. Historical same-path rows with different digests do not qualify them. Both SQL transactions rolled back.
- In this initial recheck there was no live MCP tool call, DSPy sidecar/RPC invocation, admitted ContextManifest readback, Arrow artifact round-trip, or complete C0–C10 progress receipt. Later local helper calls and a read-only model metadata probe are recorded in the continuation sections; those do not close source/workspace identity or C9.
- **Percentage: uncomputed, not 0% and not 10%.** The 10% rule is a hard cap when no frozen checksum-qualified input exists; it is not baseline credit. Do not publish a numeric headline until one declared frozen scope has per-checkpoint evidence attached to a valid receipt.

### 11.2 Diagnostic-repair continuation (2026-10-21)

- The three focused repair/DAG suites were rerun in this continuation and passed **3 files / 8 tests**. This confirms only the proposal-output guard, DAG synthesis contract, and repair-context replay fixtures; it does not qualify a live MCP call or ContextManifest.
- A targeted `svelte-check` run captured five `TS2345` diagnostics against `policy-pattern-extractor.spec.ts`; the log and capture receipt agree by checksum. The capture is explicitly `sourceRevision=null`, `workspaceRevision=null`, `writesPerformed=false`, and `safeToApply=false`.
- The current `sveltekit-frontend/tsconfig.json` digest is not bound, but its exact historical digest and the target source/imported-file digests are bound under two candidate workspace revisions. Replaying that config through the TypeScript compiler API reproduced five `TS2345` diagnostics. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-bound-config-reproduction.json` (SHA-256 `4a9f3af109b108fa4b3a009e92bd49f91ca4a69f1d3f083407ec1bd317d6cfa9`).
- The original targeted `svelte-check` receipt is still correctly refused with `REPAIR_EVIDENCE_WORKSPACE_REVISION_MISSING`. The new scoped compiler-API reproduction is not admitted: there are two candidate workspace revisions, `package-lock.json` is unbound, and installed TypeScript 5.9.3 is observed but not proven to belong to the indexed environment. No source patch, model call, ContextManifest construction/readback, or datastore mutation occurred.
- The human-review recommendation was tested on a disposable copy of the policy-extractor spec: supplying the four absent HMM keys at zero while retaining `TRACE=0.7` and `REPAIR=0.2` made all **5/5** tests pass. The temporary test copy was removed; the original test file was not changed. This validates the proposed fixture repair, not a canonical `RepairProposalV1`, ranking score, or ACE admission.
- Package metadata partially corroborates only the `e24...` candidate (`package.json` has a binding there); no `package-lock.json` binding exists under either candidate. This does not establish a unique run snapshot or toolchain provenance.
- A read-only PostgreSQL lookup found four `codebase_chunk_index` rows with the exact target file-content hash (line ranges 1–26, 23–40, 38–56, and 52–64), but all four have NULL `workspace_revision`, `source_revision`, and `representation_revision`. They are legacy retrieval candidates, not eligible revision-qualified evidence; no CandidateOrdinal/snapshot binding was found for this diagnostic.
- A follow-up read-only query of `atlas_packet_chunk_lineage` returned zero rows for those four chunk-row IDs and the exact source path. Thus the existing packet-lineage owner does not bridge these legacy chunks into a qualified packet candidate.
- A schema-only stdio MCP handshake (`initialize` + `tools/list`) against `atlas-tools` returned 10 tools and their `inputSchema`; no `tools/call` ran. `build_agentic_rag_context` requires `query`, `classify_intent` requires `prompt`, and `build_recommendation` requires `intent`, `domain`, `errorSummary`, `evidenceLines`, and `patchTargets`. `record_outcome` is explicitly mutating and was not invoked. Receipt: `.tmp/atlas/agentic-diagnostic-repair/mcp-atlas-tools-list-receipt.json` (file SHA-256 `703bc8682e4c530809ce8f46879e7a3e1210b8730ec85e0c52ee608f47428c6c`). This confirms parameter-schema discovery, not live retrieval or DSPy prompt/ACE injection.
- **Parameter discovery rule:** call `tools/list` with `{}` in its protocol `params`; inspect each returned `inputSchema` (`properties` and `required`). Do not use `tools/call` with `{}` to discover parameters. `{}` is valid call arguments only for a tool whose schema permits an empty object; `find_source_refs` advertises no required fields, but its empty call was not run.
- In mock mode, the pure MCP `classify_intent` → `build_recommendation` sequence returned a bounded advisory using the diagnostic evidence and no patch targets. It classified the domain as `frontend`; the formatter output has no advertised `outputSchema` and its suggested command is a generic checker invocation. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-mcp-advisory-recommendation-mock.json`. Treat this as proof that helper calls can produce text fields—not a DSPy prompt, typed ACE JSON, approved taxonomy label, live RAG result, or ContextManifest.
- A separate Git-object check found the historical config bytes in commits where the policy files were absent; that does not negate the exact DB bindings above, because workspace revisions are not Git commit IDs. The temporary config used for the replay was removed after execution.
- **R04/R05 remain open; proof percentage remains uncomputed.** The next safe step is to resolve one unique workspace/toolchain snapshot and candidate ordinal, then validate the advisory recommendation through the existing typed repair-proposal contract without model-driven edits or datastore writes.

### 11.3 Project-check stability and model metadata follow-up (2026-10-21)

- The exact project command `npm run check` ran twice sequentially with a targeted 16-GiB Node heap. Both runs exited 0 with 0 errors/0 warnings and byte-identical logs (`sha256:aac4f4c26806d15e777501c0788d23ec5113318ec4d765d0f773aeadbfc43e`). Run times were 595,982 ms and 444,714 ms. Receipt: `.tmp/atlas/r01-current-check-20261021T184307142/receipt.json`. This current-checkout result does not reconcile the expanded-scan cohort or prove that excluded source files are clean; R01 remains partial.
- Read-only GETs to `:8090/health`, `/props`, and `/v1/models` returned healthy service metadata for `ornith-1.5-9b`: loaded default context 65,536 tokens, model-reported training context 262,144, GGUF format, 8,953,803,264 reported parameters, and a chat template advertising tool-call support. Quantization was not reported by the API. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r07-ornith-dspy-readonly-probe-v4.json` (SHA-256 `79f01533c02ffb4c4e885242e1f49df4cae05e1888d0cabc83c2a521d39b5cce`).
- In the existing `/home/james/.venvs/atlas-dspy-exp` environment, DSPy 3.4.1 successfully constructed the existing `Predict(ComposeAcePacketProposal)` signature without an LM invocation. This proves interpreter/package/signature construction only. No generation, constrained JSON, actual tool-call execution, ContextManifest input, or ACE packet injection was tested. R07 remains open pending authorized inference-compatible behavior checks against admitted context.

## 12. Safe implementation order

1. Reconcile owners/callers and resolve the NES palette meaning; do not delete duplicate implementations.
2. Freeze one small input snapshot and create the serial CPU diagnostic/ranking oracle.
3. Specify event, FSM, bit-packing, artifact-descriptor, and receipt schemas; test invalid and partial cases.
4. Prove bounded CPU execution and deterministic result joining.
5. Prove Arrow IPC CPU round-trip on a disposable local artifact; connect RPC descriptor only after schema and access rules are established.
6. Measure retrieval/citation/ContextManifest behavior against frozen judged queries.
7. Request a GPU window separately; only then benchmark a bounded CUDA challenger against the CPU oracle.
8. Add reviewed outcome learning, adversarial testing, and production operations gates last.

## 13. References

- [Apache Arrow columnar format: buffer alignment and padding](https://arrow.apache.org/docs/format/Columnar.html)
- [Apache Arrow IPC format overview](https://arrow.apache.org/docs/format/Intro.html)
- [Valkey PFCOUNT: HLL size, error, sparse/dense representation, and possible cached-estimate mutation](https://valkey.io/commands/pfcount/)
- [Valkey PFADD](https://valkey.io/commands/pfadd/)
- [Apache CouchDB views](https://docs.couchdb.org/en/stable/ddocs/ddocs.html)
- [Python event loop executors](https://docs.python.org/3/library/asyncio-eventloop.html#executing-code-in-thread-or-process-pools)
- [PyTorch `from_numpy`](https://docs.pytorch.org/docs/stable/generated/torch.from_numpy.html)
- [PyTorch CUDA semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

## 14. Byte encoding, CPU SIMD, queues, and retrieval placement

These mechanisms solve different problems and must not be collapsed into a single “fast byte/tensor path.”

| Mechanism | Correct role in this flow | Boundary / non-role |
|---|---|---|
| 1–7-bit packed codes | Compact categorical IDs or Boolean features, only after the LUT vocabulary and bit layout are frozen | Not a CPU ISA width, Arrow alignment, or numeric tensor dtype |
| PostgreSQL `bytea` | Store a small canonical packed value only if an approved table/owner defines its meaning and revision | Not an automatic bitset index or queue; add typed version/length/checksum fields and query operators as needed |
| MessagePack | Encode small descriptors and compact receipts, including a byte field when appropriate | Not an alignment guarantee or preferred bulk-matrix transfer |
| Protobuf/gRPC | Typed service contract and request/response transport; a `bytes` field is valid for bounded payloads | Not a durable job queue, canonical store, or proof of source lineage |
| simdjson | Parse JSON/JSONL quickly; preserve parser/document lifetime rules and validate parsed data against the contract | Does not vectorize the resulting feature matrix or replace schema/provenance validation |
| AVX2 / AVX-512 | CPU instruction sets used by native kernels when supported by the actual CPU/runtime build | AVX2 is 256-bit SIMD; AVX-512 is a separate 512-bit ISA family, not “AVX2-512.” Do not assume AVX-512 support or hand-align data without profiling |
| Arrow IPC alignment | IPC buffer offsets/padding; 8-byte minimum with 64-byte alignment/padding recommended when practical | Not a 64-bit matrix and not a requirement that every consumer expose 64-byte-aligned pointers |
| TurboVec 4-bit quantization | A compressed vector-search representation owned by its existing projection/index lane | Not the NES bit encoding, a CPU ISA, or the canonical 768-D source vector; exact-rescore and projection identity rules still apply |
| PostgreSQL bitmap/AIO | Planner/executor strategies for database reads | Not an application-level dequeue, event bus, or worker scheduler |
| RabbitMQ / external broker | Optional durable cross-process queue if measured deployment requirements justify a broker | Not needed merely because a pipeline uses `async`/`await`; introduce only with ownership, idempotency, replay, backpressure, and operations contracts |
| Node-API (N-API) | Native addon interface for passing typed buffers between Node and native code | Validate dtype, byte length, offset, ownership/lifetime, mutability, and copy/zero-copy semantics. Alignment is a property of the concrete allocation/API, not guaranteed by the word “N-API” |

### 14.1 Bitset vs compact NES code

For a bitset with `M` flags, required payload bytes are `ceil(M / 8)`. For a categorical code with `K` possible values, required width is `ceil(log2(K))` bits, plus explicit reserved/unknown codes if required. Those are different layouts. A 1-to-7-bit code stream can be useful for small category IDs, but random access and cross-byte extraction cost complexity; benchmark it against a byte-per-category baseline before adopting it.

The stable record should carry an encoding ID/version, logical item count, bit order, byte length, checksum, and decoder test vectors. Keep stable candidate IDs and source identity in ordinary typed columns/sidecars—not in bit positions. A collision in a hash-to-bucket LUT must preserve all members or be reported; it must never overwrite identities.

### 14.2 How to build the matrix and optional CUDA tensor

The 8-byte Arrow rule is not a matrix shape. The feature matrix is an explicit logical array with shape `[N,F]`:

- `N`: selected rows/candidates in the frozen batch;
- `F`: ordered numeric features in a versioned feature schema;
- dtype: explicitly chosen (for example, float32 for the initial oracle);
- separate sidecar: candidate ID, source/packet references, revisions, masks, and feature provenance.

The existing CPU numerical owner builds `[N,F]` from validated source/feature rows. Arrow IPC serializes those typed columns and their buffers. The Python numerical executor reads the Arrow record batch and constructs the CPU array/tensor. Only then may an approved GPU executor move a bounded contiguous batch to CUDA. The expected transformation is conceptually `Arrow columns -> CPU array/tensor -> explicit .to(cuda)`, not `Arrow alignment -> GPU tensor`. CPU output remains the oracle; CUDA scores are joined by candidate ID and compared under a frozen tolerance/quality contract.

Do not route a 4-bit TurboVec index representation into the float feature matrix unless a specific retrieval feature is defined and versioned for it. Do not treat a packed NES code as a vector embedding. If a low-rank PCA/SVD basis is used, freeze its input schema, training snapshot, basis checksum, rank, normalization, and transform revision; fit only on the declared training split where evaluation leakage matters.

### 14.3 Lookup tables, FSM, and worker queues

FSM transitions should start as a typed, readable transition table keyed by `(state, event, eligibility-result)` with explicit allowed next state, required evidence, and side-effect class. A compact lookup/bitset implementation is an optimization challenger only after parity tests show it implements exactly the same transitions. It cannot grant permissions; the policy/authorization check remains explicit.

Use a bounded in-process queue/worker pool for one-process analysis first. Use PostgreSQL durable job rows or a broker only if cross-process durability, independent consumers, or operational replay are required. Whichever queue is selected must define unique job IDs, idempotency, lease/ack semantics, retry ceilings, dead-letter handling, cancellation, ordering, and receipt ownership. Database bitmap scans and AIO do not provide these queue semantics.

For N-API or gRPC transfer, prefer descriptor-first transfer of a checksummed Arrow artifact over serializing large matrices into `bytea`, MessagePack, or protobuf messages. If a bounded binary payload is truly necessary, include schema/version, exact length, checksum, dtype/shape where numeric, and enforce maximum bytes before allocating. Test both copied and zero-copy paths; do not retain borrowed Node buffers past their documented lifetime.

### 14.4 MCP-query domain classification and DAG prefill

For an MCP tool query, use this order:

1. Validate user query and caller/tool permissions; discover tool schemas but do not equate discovery with authorization.
2. Retrieve candidate tools/evidence through existing MCP/SearchRuntime owners; retain source identity, revisions, lane, and citation anchors.
3. Derive domain/capability/concept labels as typed proposals. Technical domain, product capability, ontology concept, and observed source vocabulary remain separate namespaces. Unreviewed classifications may rank or filter only under an explicit advisory policy; they cannot become gold labels or canonical facts.
4. Build a compact feature row for eligible candidate actions. Candidate identity, permission decisions, and source refs remain outside the numeric feature vector.
5. Rank first with the frozen CPU baseline. PCA/SVD, centroids, low-rank scorers, MLP, or GPU scoring are challengers evaluated on frozen candidates and judged queries; ranking scores cannot override hard eligibility.
6. Assemble a DAG only from authorized task dependencies. Fetch exact source spans, AST parents, imports/definitions, related diagnostics/tests, then semantic neighbors if needed. Preserve retrieval failures and partial evidence.
7. The existing ACE ContextManifest owner performs final evidence selection, citation verification, and token budgeting. Ornith receives that manifest, never raw MCP results, packed tensor data, or unverified ontology labels.

This gives contextual token savings by sending only selected evidence and citations. The bitset, Arrow artifact, and vector quantization are intermediate representations; none should be injected into the prompt as a substitute for readable grounded evidence.

### 14.5 Verified MCP → DSPy → ACE boundary review (2026-10-21)

This includes source/OpenSpec review and a local pure-helper MCP call, but is not live retrieval, a model invocation, or a production-readiness claim:

- MCP `tools/list` advertises each tool's `inputSchema`; that schema describes the arguments a caller must provide. It does not fetch argument values from the user or authorize a call. The query-based tool subset in `sveltekit-frontend/src/mcp/server.ts` is a discovery/context optimization and deliberately falls back to the full list on selector failure. `tools/call` has authentication plus tool-specific validation branches and a generic dispatch fallback; do not assume a uniform validator solely because a schema was advertised. A safe bridge must bind the selected tool name, exact schema/revision, permission/effect decision, and validated argument digest.
- The separate `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs` now compiles each advertised `inputSchema` with Ajv and rejects invalid `tools/call` arguments before handler dispatch. Its focused tests cover required fields, extra keys, an allowed empty argument object, valid pure classification, and rejection before the mutating `record_outcome` handler. This closes argument-shape validation for this local server only; it does not authorize tools, validate the separate SvelteKit MCP server's generic handlers, or qualify returned evidence.
- A real stdio MCP-process smoke in `ATLAS_TOOLS_MOCK=1` returned 10 tools, rejected `{}` for `classify_intent` (`prompt` required), and accepted a valid pure classification call. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r05-atlas-tools-stdio-schema-enforcement.json` (SHA-256 `39cb0aeefd0e716d46d69564ef77022d78536e6c20f7812ebd9ac779cd85f0ed`). This proves this local transport/dispatch contract in mock mode, not live retrieval, DSPy, or ACE.
- `scripts/atlas/ace_packet_proposal_v1.py` has a lazy DSPy proposal signature and a fail-closed evidence-reference validator. The OpenSpec ledger `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md` still leaves the TypeScript-owned evidence → isolated DSPy sidecar/RPC wrapper open. The presence of a proposal signature and validators is not proof that a live tool result reaches DSPy or that DSPy output enters an ACE prompt.
- Identity roles must remain separate: `packet_key` is the existing UUIDv5-derived packet identity; RPC call/execution/event identifiers use UUIDv7; `deriveUUID` is the repository's UUIDv8 helper; `title_id` is a semantic label (`title:<hash>` in the current generator), not a UUID and not a source revision. Carry source/workspace revisions separately. Extend the existing `CandidateOrdinalMapV1` reverse-resolution owner rather than introducing a parallel title/NES LUT.
- NES/LUT ordinals remain unassigned in `.okf/domains/atlas-domain-taxonomy.yaml`; the historical “Pokemon source code” analogy is not an approved identity, palette, or encoding contract. Keep LUT-derived labels advisory until its vocabulary and encoding are reviewed and versioned.
- The safe proposal path is: discover schema → authorize and validate arguments → execute bounded MCP call → preserve raw response as untrusted evidence → qualify exact source refs/revisions → pass only manifest-allowlisted evidence handles to the DSPy proposal worker → validate the returned proposal against the same manifest → assemble using the existing ACE ContextManifest owner. No direct raw-result prompt injection or new packet/identity owner.

**Evidence ceiling:** source inspection, focused proposal/DAG fixtures, schema-driven local `tools/call` argument validation, and a local stdio call to the two pure MCP helpers (`classify_intent` → `build_recommendation`) are proven. The helper chain did not perform live retrieval, DSPy execution, sidecar/RPC execution, admitted ContextManifest readback, or ACE injection. Therefore C9 earns no end-to-end integration credit; the C0–C10 percent remains receipt-driven and is not inferred from this design note.

## 15. Checkpoint additions for encoding and execution placement

The C0–C10 weighted score in section 10 remains the sole percentage rubric. These checks refine the evidence required for credit; they do not add extra weight or permit double counting:

- C3 must prove that async I/O, CPU worker execution, and GPU completion/synchronization are independently represented; include an ordering test where completion order is intentionally shuffled.
- C5 must include golden bit-pack/unpack vectors (including cross-byte boundaries), explicit NES vocabulary approval, collision behavior, and malformed descriptor rejection. If the LUT meaning is unresolved, C5 remains blocked.
- C6 must identify the actual matrix builder owner and prove `[N,F]` shape, candidate-ID/ordinal bijection, feature order, finite values, and reproducible CPU scores.
- C7 must round-trip the Arrow artifact across the intended writer/reader languages, validate checksum and byte ranges, and record observed buffer alignment rather than assuming it.
- C8 must distinguish AVX2, AVX-512, and CUDA as separate backends; record detected hardware/runtime support and keep a scalar/CPU oracle. No GPU credit without an authorized resource window and quality parity.
- C9 must show that MCP query → candidate eligibility → ranking → evidence DAG → ContextManifest preserves exact citations and abstains on missing lineage.
- C10 must show that queues, retry/replay, authorization, and learning outcomes preserve blocked/inconclusive states without assigning false negative reward.

**Status note:** these additions refine the proposal. They do not establish that bit packing, broker queues, Arrow-to-tensor transfer, TurboVec low-bit rescoring, or the MCP-to-ACE DAG is currently wired end to end.
