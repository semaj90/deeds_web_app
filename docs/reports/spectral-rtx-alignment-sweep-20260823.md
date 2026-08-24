# Spectral / RTX alignment sweep

Date: 2026-08-23  
Checkout: `deeds-web-app-hardware-proof`  
Status: `WIRED / FIXTURE_PROVEN / RUNTIME_EXECUTED / PARITY_BLOCKED`

## Audited surfaces

- TypeScript spectral fixture and multihop synthesis contracts.
- Python spectral reference and RAPIDS community request/response contracts.
- RAPIDS community sidecar capability discovery and `/v1/community/spectral`.
- WSL2 environment declaration, cuGraph/cuVS graph workers, and live-fixture
  benchmark scripts.
- cuVS gRPC, TurboVec N-API, cuBLAS/GEMM, and native C ABI/N-API OpenSpec
  boundaries.
- Spectral OpenSpec, RTX GPU lab tasks, and workstation TODO.

## What is complete

- A bounded spectral challenger route exists and is non-mutating.
- Requests are revision-bound and reject invalid spectral bounds:
  `numEigenvectors <= numClusters <= node_count`.
- TypeScript and Python fixtures use the same sorted CandidateOrdinal rows,
  canonical JSON/checksum rules, and explicit non-authority flags.
- The sidecar reports spectral capability dynamically instead of claiming it
  when cuGraph is unavailable.
- Existing cuGraph PageRank/Louvain parity receipts remain separate from the
  new spectral challenger; no authority was reassigned.

## Validation executed

- Python spectral/RAPIDS contract and parity lane: `6 passed`.
- TypeScript spectral fixture/multihop lane previously recorded: `16 passed`.
- WSL2 `atlas-rapids-cu13` 500-candidate run executed with frozen `K=8` and
  seed `684453`.
- Runtime: cuGraph `26.06.00`, cuDF `26.06.01`, cuPy `14.1.1`, CUDA runtime
  `13.2`, NVIDIA driver `580.88`, RTX 3060 Ti.
- CPU/cuGraph modularity ARI: `0.953547`, required threshold `0.99`.
- CPU/cuGraph assignment checksums differ; projection admission remains false.
- The raw 500-node COO input contains `4,807` undirected edge rows,
  `4,683` unique undirected pairs, and `124` duplicate pairs; there are no
  self-loops. The benchmark applies the explicit `SUM_BY_UNDIRECTED_PAIR`
  reduction before both CPU and GPU execution, so the current proof is not a
  zero-duplicate-input proof.
- Three repeated GPU runs have stability ARI `0.968814`; GPU repeat
  determinism is therefore not yet proven.
- The zero-duplicate derived fixture produced the same modularity ARI
  (`0.953547`) and GPU stability ARI (`0.968814`) as the summed-duplicate
  input. Duplicate COO rows are therefore not the primary cause of this
  mismatch, although the zero-duplicate receipt is now the cleaner parity
  fixture.
- Diagnostic eigensolver tolerance sweep (`1e-4`, `1e-5`, `1e-6`) produced
  the same modularity ARI (`0.953547`), balanced-cut ARI (`0.953306`), and
  GPU stability ARI (`0.968814`). Tightening `evs_tolerance` alone is not the
  explanation for the mismatch. Receipts:
  `docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-4-receipt-500.json`
  and `docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-6-receipt-500.json`.
- Explicit eigenvector-count diagnostics changed the result but did not pass:
  `num_eigen_vects=2` produced modularity ARI `0.951989`, while `4` produced
  `0.938476`; the baseline `3` remains best at `0.953547`. Component
  selection is therefore a real sensitivity, not a parity fix.
- Modularity quality also differs: CPU `0.295774` versus cuGraph `0.042387`;
  edge cut CPU `73.7181` versus cuGraph `72.1144`.
- The activated cuGraph 26.06 runtime emits a deprecation warning from the
  balanced-cut call. NVIDIA's current cuGraph documentation still documents
  both Balanced Cut and Modularity Maximization, so this is recorded as a
  runtime warning rather than an assertion that the API is globally removed.
  Balanced Cut remains exploratory for this proof; Modularity Maximization is
  the explicitly versioned promotion candidate.
- The documented modularity call is
  `cugraph.spectralModularityMaximizationClustering(G, num_clusters,
  num_eigen_vects, evs_tolerance, evs_max_iter, kmean_tolerance,
  kmean_max_iter, random_state)` and expects a weighted cuGraph graph. The
  receipt must preserve these effective parameters rather than relying on
  library defaults.
- Receipt: `docs/reports/spectral-live-fixture-receipt-500.json`.
- Zero-duplicate comparison receipt:
  `docs/reports/spectral-live-fixture-zero-duplicates-receipt-500.json`.
- No database, Qdrant, Neo4j, Valkey, or vector-index writes were performed.

## Remaining gaps

1. Diagnose GPU k-means initialization/oversampling semantics and eigenspace
   component selection before promotion; tolerance alone did not change the
   result and `num_eigen_vects=3` currently performs best.
2. Explain the remaining CPU/cuGraph partition difference before promotion;
   current ARI is below threshold.
3. Compare CPU and GPU eigenspace/convergence and quality metrics on the same
   ordinal map.
4. Keep the live receipt as `EXECUTED_UNPROVEN` until parity and repeat
   determinism pass.
5. Keep Qdrant tags, Valkey residency, Neo4j-derived features, and synthesis
   routing read-only until the parity receipt passes.
6. The native C ABI and N-API spectral/GEMM seam is still not implemented;
   Python sidecar transport remains the current isolation boundary.
7. The current RAPIDS environment is declared as 26.06/CUDA 13; version-pair
   support and the actual activated runtime must be captured in the receipt,
   not inferred from the environment file.
8. Workflow/A2A receipt wiring and grounded repair-outcome joins remain open.

## Next safe sequence

1. Run the focused Python/TypeScript tests.
2. Run the read-only WSL2 spectral smoke test with Conda explicitly activated.
3. Inspect the receipt and compare CPU/GPU checksums and metrics.
4. Only after parity, design a separate projection readback proof; do not add
   a new canonical table or mutate existing stores in this tranche.

## Addendum (2026-08-23, later same day): "stability ARI 0.968814" reconciled — not a determinism failure

A second diagnostic (`scripts/atlas/spectral_diagnostic_receipt_v2.py`, receipt
`docs/reports/spectral-diagnostic-receipt-v2.json`, both currently untracked)
was run against the same frozen 500-node zero-duplicate fixture to close gap
1 above (GPU determinism / k-means initialization semantics). It reports
`gpuGpuARI: [1.0, 1.0]` and `gpuRepeatDeterministic: true` across all four
`evs_tolerance` values (`1e-4`..`1e-7`), each with 3 repeats and identical
assignment/canonical-partition checksums per tolerance.

This looks like a contradiction of the `0.968814` stability figure reported
above until the two scripts are compared directly:

- `scripts/atlas/spectral_fixture_benchmark.py:413` — `kwargs = dict(solver_parameters, random_state=seed + repeat)`.
  Each of the 3 repeats runs with a **different** `random_state`
  (`seed`, `seed+1`, `seed+2`). `stability_ari` is therefore a
  seed-sensitivity measurement, not a same-seed determinism check.
- `scripts/atlas/spectral_diagnostic_receipt_v2.py:266` — `random_state=args.random_seed`
  inside the repeat loop, unchanged across all 3 iterations. This is the
  actual fixed-seed determinism check.

Both figures are real and not in conflict once read this way:
`cugraph.spectralModularityMaximizationClustering` on this fixture is
**exactly deterministic for a fixed seed** (ARI 1.0, confirmed) **and**
**sensitive to which seed is used** (ARI ~0.9688 across seed, seed+1, seed+2,
confirmed separately) — consistent with the near-degenerate eigenspace
hypothesis (`spectral_gap: 0.092` on the balanced-cut operator in the v2
receipt) rather than GPU nondeterminism. Item 4 in "Remaining gaps" above
(`Keep the live receipt as EXECUTED_UNPROVEN until parity and repeat
determinism pass`) is updated accordingly: **fixed-seed repeat determinism
now passes**; parity against the CPU oracle (item 2) does not.

The v2 receipt also ran a k-means initialization census
(`cuml.cluster.KMeans` over the CPU modularity-eigenvector embedding,
`init` × `n_init` swept) that the earlier gap list flagged as unexplored.
Results range from ARI 0.20 (`random` init, `n_init=1`) to ARI 0.9553
(`k-means++`, `n_init=10`) against the cuGraph baseline partition, with
`scalable-k-means++` (cuML's own default) at 0.9536–0.9540. This is now the
strongest lead for the remaining CPU/GPU gap: k-means initialization
sensitivity, not eigensolver tolerance (already ruled out in the sweep
above) and not choice of CPU operator (normalized-Laplacian and modularity
operators both converge to ARI ~0.953–0.955 against the GPU baseline in the
v2 receipt, i.e. the same ceiling regardless of operator). No run in the
census reaches the 0.99 promotion gate; the gate remains `BLOCKED`.

Correction: Leiden comparison against this fixture (LVG-7) was already run, not
"not yet done" as an earlier draft of this addendum stated. It produced a
degenerate result — `cugraph.leiden(graph, max_iter=100, resolution=1.0,
random_state=seed+repeat, theta=1.0)` returns 500 singleton clusters for 500
nodes, `reported_modularity: -0.2198`, identically in both
`spectral-live-fixture-receipt-500.json` and
`spectral-live-fixture-zero-duplicates-receipt-500.json`
(`leiden.stability_ari: 1.0`, so reproducible, not noise). `partition_agreement`
against both spectral methods is `0.0` and not meaningful as a comparison. The
same `cugraph.leiden` call (same signature, same `theta=1.0`) correctly finds
structure on `networkx.karate_club_graph()` in the live `atlas-rapids-cu13`
env (`modularity: 0.4188`), so this is not a wrapper/API-misuse bug.

### Leiden resolution sweep (follow-up)

`scripts/atlas/leiden_diagnostic_receipt_v1.py` (receipt
`docs/reports/leiden-diagnostic-receipt-v1.json`) swept `resolution` in
`{0.001, 0.01, 0.05, 0.1, 0.5, 1.0}` at the same fixed seed, against both the
fixture's real edge weights and an all-weight-1.0 unweighted control graph
(edge weights: min 0.452, max 2.000, mean 1.012, median 1.000 — cosine-derived,
occasionally >1 from summed edge families per the zero-duplicate reduction
policy):

| resolution | weighted clusters/modularity | unweighted clusters/modularity |
|---|---|---|
| 0.001 | 2 / 0.9991 | 2 / 0.9991 |
| 0.01  | 2 / 0.9906 | 2 / 0.9906 |
| 0.05  | 2 / 0.9530 | 2 / 0.9531 |
| 0.1   | 2 / 0.9061 | 500 / -0.0057 |
| 0.5   | 500 / -0.0965 | 500 / -0.1020 |
| 1.0   | 500 / -0.2198 | 500 / -0.2224 |

This rules out the edge-weight-scale hypothesis floated above: the unweighted
control collapses to the same singleton degeneracy at essentially the same
point as the weighted graph (unweighted at `0.1`, weighted at `0.5`; both fully
degenerate by `1.0`, the value the original benchmark uses by default). This is
a sharp resolution-driven collapse specific to this graph's structure, not an
edge-weight artifact. All runs are deterministic (`gpuGpuARI: 1.0` at every
resolution). Root numerical/implementation cause of the sharp (not gradual)
transition is still undiagnosed.

Separately worth noting: even the healthy low-resolution regime only finds 2
communities, not the frozen `K=8` this tranche assumes for the spectral
methods — so "pick a resolution where Leiden doesn't degenerate" does not by
itself give a Leiden result comparable to the K=8 spectral partitions; that
would need its own reconciliation.

### Is the collapse gradual or a hard jump? (follow-up)

A finer sweep (`docs/reports/leiden-diagnostic-receipt-v1-fine.json`,
resolution `{0.05, 0.06, ..., 0.5}` in 13 steps) shows the transition is a
**hard jump, not a gradual refinement**: cluster count goes directly from 2 to
500 with no step in between ever showing an intermediate community count (5,
20, 100, etc.) — weighted graph: 2 clusters through `resolution=0.12`, then 500
at `0.15`; unweighted: 2 clusters through `0.08`, then 500 at `0.09`. Modularity
also crosses from strongly positive (0.89-0.95) to weakly negative in that same
single step, not a smooth decline.

This is consistent with a real, non-buggy property of resolution-scaled
modularity optimization on a graph dominated by one dense giant community with
a sparse periphery (matches what the spectral methods independently found: one
~459-462-node cluster plus several 2-12-node clusters, not eight comparably-sized
communities): once the resolution-scaled null-model term exceeds the actual
edge density for essentially every node pair simultaneously, no single local
move improves modularity anywhere in the graph at once, and the entire giant
community shatters to singletons in the same step rather than splitting
hierarchically. This is not confirmed as "expected cuGraph behavior" via
external documentation — it is inferred from the sweep's shape — but nothing in
these two sweeps points at a wrapper or numerical-precision defect anymore.

This raises a structural question independent of the collapse: at every
resolution where Leiden is healthy, it only ever finds 2 communities (never
3-8) on this exact 500-node sample. Combined with the spectral methods' own
"one dominant 459-462-node cluster + several single-digit clusters" shape, this
suggests the candidate graph may not actually have K=8-scale multi-community
structure at all — spectral's K=8 forces a split the graph's natural structure
doesn't otherwise support, rather than K=8 being a real property of this data.
Worth checking before spending more effort on CPU/GPU parity at a K that may
not be the right target.

### Root cause confirmed: the fixture is a disconnected graph (2 components: 459 + 41 nodes)

`scripts/atlas/spectral_eigengap_probe_v1.py` (receipt
`docs/reports/spectral-eigengap-probe-v1.json`) computed the top-20 eigenvalues
of both the normalized Laplacian and the modularity matrix for this same
500-node fixture. The normalized Laplacian has **two** eigenvalues at
essentially machine-zero (`4.8e-16`, `5.7e-16`) before the next eigenvalue
(`0.2073`) — for a normalized Laplacian, the multiplicity of the exact-zero
eigenvalue equals the number of connected components. Verified independently
(not just via eigenvalue counting) with `scipy.sparse.csgraph.connected_components`
on the same edge list: **2 components, sizes 459 and 41.**

This is the actual root cause behind every open item in this addendum, not
three separate mysteries:

- **Leiden's natural K=2** (the earlier "K=8 isn't natural" hypothesis) is not
  a resolution-parameter coincidence — disconnected components are trivially
  their own communities under any modularity-family objective; K=2 is the
  structural floor.
- **The hard resolution collapse, unweighted-graph-first**: the 41-node
  satellite component is far sparser relative to its size than the 459-node
  component, so it crosses the resolution-scaled fragmentation threshold
  first (matches the unweighted-graph-collapses-before-weighted-graph
  ordering observed in the fine sweep).
- **The CPU/GPU spectral ARI ceiling (~0.953-0.955, `BLOCKED` against the
  0.99 gate)** is very plausibly the same phenomenon, not a numerical-solver
  bug: with `K=8` requested against a graph that is structurally 2 pieces
  (one of which is 459/500 = 92% of all nodes), the eigensolver has to carve
  6 additional cluster boundaries out of a single near-homogeneous giant
  component using an eigenspace with little real signal past the first two
  components — exactly what `spectral-diagnostic-receipt-v2.json`'s
  `eigenspace.canonical_authority: false` flag and its k-means census
  (ARI to cuGraph ranging 0.20-0.9553 purely from `init`/`n_init` choice)
  already independently suggested: k-means tie-breaking noise on an
  approximately-degenerate eigenspace, not a real CPU/GPU disagreement about
  graph structure. The `movedNodeOrdinals` in that receipt (14-19 nodes out
  of 500) are consistent with boundary noise inside the giant component, not
  a structural misread.

This changes the recommended next step. More eigensolver-tolerance or
eigenvector-count sweeping on `K=8` is unlikely to close the gap, because the
gap is plausibly explained by `K=8` not being a real property of this
500-node candidate sample rather than by solver precision. Before spending
more effort on CPU/GPU parity at `K=8`: (a) check whether the semantic_512
candidate *selection* step (LVG-1) is what's producing a disconnected
sample — is 500 candidates too small / too disjoint a slice of the full
corpus, and does a larger or differently-sampled candidate set stay
connected; (b) if disconnection is expected/normal at this candidate size,
freeze `K` per-component (e.g. `K` proportional to component size) instead
of one global `K=8` across a disconnected graph; (c) only after either of
those, re-run the parity gate to see if it was ever really about eigensolver
precision at all.

### Why it's disconnected

Cross-referenced the two connected components against `nodes.parquet`'s
`packet_key` and `source_ref` columns directly:

- Component 0 (41 nodes): 16-character bare hex keys, e.g.
  `0ba2345cd9c542fa`, `1703d9c005252a62`. `source_ref` is uniformly
  `proto:<ServiceName>.<Method>` (e.g. `proto:RetrievalService.Health`,
  `proto:EmbeddingService.GenerateEmbeddings`, `proto:TurboVecCudaService.Transform`)
  — gRPC/Protobuf service-method definition packets.
- Component 1 (459 nodes): `ace:packet:`-prefixed keys, e.g.
  `ace:packet:001be68ca4b0`. Regular codebase-chunk packets.

**Correction to an earlier version of this addendum**: this is *not* the
`packet:<12hex>` / `ace:packet:<12hex>` identity collision described in
`SESSION-200-PACKET-IDENTITY-ALIAS-CONVERGENCE` memory — that was checked
wrong and is retracted. Verified directly against the live database: every
one of the 41 bare-hex keys already has its own live `atlas_packets` row
(queried by exact `packet_key` match, no alias lookup involved) and none of
them appear as either an `alias_key` or a `canonical_packet_key` in
`atlas_packet_identity_aliases` (3,294 rows checked, all
`packet:<12hex>` -> `ace:packet:<12hex>`, an unrelated key shape).
`resolveCanonicalPacketKey()` would resolve every one of these 41 keys via
its exact-match fast path and return them unchanged — running it here would
fix nothing.

The real cause: the candidate pool mixes two structurally and semantically
different corpora — proto/gRPC API-surface packets and regular codebase
packets — that are far enough apart in `semantic_512` space that the
top-16 cuVS KNN (`--semantic-top-k 16`, `python/build_live_graph_fixture_semantic512.py`)
doesn't bridge them, at least not within this 500-candidate window.
`python/build_live_graph_fixture_semantic512.py:215` then selects candidates
via `sorted(identities, key=lambda row: (row.packet_key, str(row.point_id)))[:limit]`
— a plain lexicographic sort over `packet_key` with no regard to `source_ref`
kind — which happens to admit all 41 currently-reconciled proto-service
packets (their pure-hex keys sort before `ace:packet:...` alphabetically) plus
the 459 alphabetically-earliest codebase packets. That specific 41-vs-459
mix is a sort-order artifact; the underlying "two corpora don't bridge under
KNN at this window size" is a real structural property, not an artifact of
the sort.

Actionable fix candidates (neither implemented, both worth checking before
assuming either is right): (a) exclude `proto:*`-sourced packets from this
proof tranche entirely — they may not belong in a codebase-semantic-cluster
comparison at all; (b) if proto-service packets should stay in scope, verify
KNN bridges the two corpora once semantic-top-k is raised, or use a
connectivity-aware/stratified candidate sample instead of a raw
`packet_key` lexicographic cut, so a spectral run at a given K isn't
implicitly deciding "proto packets are their own giant outlier cluster"
purely as a side effect of sort order.

Louvain was not run on this fixture at all.

### LVG-1 fix applied: exclude proto-service packets by default

Decision made (fix candidate (a) above): `proto:*`-sourced packets are
excluded from candidate selection by default in
`python/build_live_graph_fixture_semantic512.py`, since this proof tranche's
own purpose statement is about codebase-semantic-cluster structure, and
proto/gRPC service-definition packets are a structurally distinct corpus
unrelated to that. A new `--include-proto-service-packets` flag restores the
old (mixed) behavior for anyone who wants it. The fixture output now records
`proto_service_packets_included` and `proto_service_packets_excluded_count`
so this choice is always auditable from the receipt itself, not just from
this doc.

**Not yet re-verified end-to-end.** Attempting to re-run the fixture builder
to confirm the fix actually produces a connected graph failed for an
unrelated, pre-existing reason: the on-disk reconciliation manifest
(`data/atlas-ml/semantic512-reconciliation.ndjson`) currently has **zero**
`ADMITTED` rows (53,379 rows, all `SOURCE_REF_ONLY_MATCH`) — stale relative
to whenever the original 500-node fixture analyzed throughout this addendum
was built. Regenerating admitted rows requires re-running the full
`atlas_semantic512_reconcile.py` pipeline (LVG-0, already flagged
`EXISTING_UNEXECUTED` in `tasks.md` before this session), which is a
materially larger and longer action than the read-only diagnostics in this
addendum — not triggered here. The code change itself compiles cleanly
(`python -m py_compile`) and reached the reconciliation-loading step before
failing on the unrelated empty-manifest condition, so the patch itself is not
what's blocking verification.

### LVG-0 is currently blocked by a matching-logic bug, not stale data

Ran `python/atlas_semantic512_reconcile.py` fresh (read-only: no `--apply-payload`,
no `--expected-manifest-checksum`, confirmed those flags gate the only write
path in the script). Result: **0 `ADMITTED`, 0 `REJECTED`, 53,379/53,379
rows classified `SOURCE_REF_ONLY_MATCH`.** Every single row, uniformly.

This is not stale corpus data — it's `classify_candidate()`'s three
"strong match" scoring paths being structurally unreachable given the live
schema, verified against real rows via direct Postgres queries:

- `EXPECTED_PACKET_KEY` (line 148: `expected_packet_key()` computes
  `f"{normalize_source_ref(source_ref)}:{content_hash[:16]}"`) — the live
  `atlas_packets.packet_key` format is `ace:packet:<12-hex>` derived from
  `sha256(source_ref)` alone (confirmed on 5 sampled rows); it never
  contains `content_hash` or a `:` separator. This match can never fire.
- `CONTENT_HASH_PACKET_ID` (`packet.packet_id == content_hash`) — live
  `atlas_packets.packet_id` values look like `packet_44_1784513267991`
  (a legacy sequential/timestamp ID, all 61,660 rows populated), not a
  content hash. Never equals a `content_hash` value (`b8d0fdd8d88d5fe4`
  shape). Can never fire.
- `POINT_ID_ARTIFACT_ID` (`packet.artifact_id == qdrant_point_id`) — live
  `atlas_packets.artifact_id` values look like `artifact:01131c7e6f000a4b`
  (58,304/61,660 rows populated), never a bare Qdrant point UUID
  (`0000d635-8df8-4a03-a1b0-e33d2699f6c0` shape). Can never fire.

With all three strong paths dead, only the weak `SOURCE_REF` match (+10
points) can ever contribute, which the function correctly refuses to
`ADMIT` on its own (`strong` check at line 352) — hence 100% `SOURCE_REF_ONLY_MATCH`
and 0% `ADMITTED`, deterministically, regardless of what's actually in the
corpus. This is a bug in the reconciliation script's matching logic, not a
data-quality finding about the codebase.

**Not fixed here.** Deciding the correct match formula (what should
`EXPECTED_PACKET_KEY` actually compute given the live `ace:packet:sha256(source_ref)[:12]`
scheme? should `CONTENT_HASH_PACKET_ID`/`POINT_ID_ARTIFACT_ID` be dropped
entirely, or is there a different live column that should back them?) is an
identity-authority decision, not a mechanical fix — this repo's own rules
(canonical identity chain, hard-fail-don't-guess) say this needs explicit
review, not a unilateral guess at what the "right" match should have been.

This also reframes everything upstream: the 500-node fixture analyzed
throughout the rest of this addendum could not have come from a *current*
run of this reconciliation script (which admits 0 rows). It must predate
this bug, or predate the schema drift that caused it. The proto-service
exclusion fix in `build_live_graph_fixture_semantic512.py` is still correct
for whatever gets admitted once LVG-0 is fixed, but LVG-0 itself is the
actual blocker on re-verifying anything end to end right now — not the
missing-manifest framing from the previous note in this addendum.

### LVG-0 formula fix, empirically verified (not a guess)

`expected_packet_key()`'s formula was checked against 5 real
`(source_ref, atlas_packets.packet_key)` pairs and matched exactly 5/5:
`packet_key = "ace:packet:" + sha256(normalize_source_ref(source_ref))[:12]`,
with **no `content_hash` involvement at all** in the live scheme. This is not
a policy choice — it reproduces what the live system already deterministically
computes, verified by direct computation against real rows, not inferred.
Applied as the fix (`python/atlas_semantic512_reconcile.py`'s
`expected_packet_key()`; `content_hash` param kept for call-site
compatibility, unused).

Re-ran reconciliation read-only with the fix: **41,344/53,379 admitted
(77.5%)**, up from 0; 12,035 remain `SOURCE_REF_ONLY_MATCH` (genuine review
cases now, not everything); 0 rejected. Confirms the formula fix is real and
effective, not another false lead.

### New blocker surfaced by the fix: packet-level identity vs. chunk-level candidates

Rebuilding the live-graph fixture against the fixed manifest
(`build_live_graph_fixture_semantic512.py`, same command as the earlier LVG-1
verification attempt) hard-failed in `load_reconciliation()`:
`duplicate admitted packet_key ace:packet:ea6f0e3e6e3f`. Checked the scale:
the 41,344 admitted rows collapse to only **3,293 distinct `packet_key`
values** — `atlas_packets` identity is file/source_ref-level (by construction
of the now-fixed formula: derived from `source_ref` alone), while
`codebase_chunk_index`/Qdrant `codebase_chunks_512` is chunk-level. 3,131 of
the 3,293 packet_keys (95%) have more than one admitted chunk, averaging
~12.5 chunks per packet, one with 412. This is a near-universal many-to-one
cardinality mismatch, not an edge case a small dedup tiebreak can quietly
paper over — naively picking "first chunk wins" would silently discard
~92% (38,051/41,344) of admitted rows, and which chunk gets kept is not an
obvious or evidence-derivable choice (unlike the formula fix above, there is
no single real answer to verify this against).

**Genuinely blocked on a decision, not more diagnosis.** Candidates, not
picked:
1. Aggregate: build one graph vertex per `packet_key`, combining its chunks'
   vectors somehow (mean? first-by-some-ordering? weighted by chunk size?)
   before this reaches candidate selection.
2. Re-scope candidate identity to chunk-level (`codebase_chunk_index.id`)
   instead of `packet_key`, and treat `packet_key` as a many-valued grouping
   attribute on top rather than the graph's node identity.
3. Restrict `ADMITTED` to one canonical chunk per packet (e.g. a designated
   "primary"/summary chunk if one exists) and route the rest to a different,
   non-`ADMITTED` status — mirrors the existing `AMBIGUOUS_TOP_MATCH` REVIEW
   pattern in `classify_candidate()`, but for the reverse (many-points→one-packet)
   direction.

This also confirms the earlier note's inference was right: the 500-node
fixture analyzed throughout this file's LVG-1/5/6/7 findings could not have
come from a current, correctly-admitting run of this reconciliation script
at all — it must predate both this bug's introduction and (now clearer) this
unresolved cardinality question.

### Cardinality decision made: aggregate to packet-level

Operator decision (2026-08-24): aggregate chunks to one packet-level
candidate rather than re-scoping identity to chunk-level or dropping extra
chunks. Implemented in `build_live_graph_fixture_semantic512.py`:

- `atlas_semantic512_autoencoder_train.py`'s shared `load_reconciliation()`
  gained a narrow, backward-compatible `allow_duplicate_packet_keys: bool = False`
  keyword-only parameter (default preserves the existing strict
  one-row-per-packet behavior for its other caller, the autoencoder trainer;
  the fixture builder now passes `True` explicitly) — chosen over writing a
  second parallel manifest loader, to avoid validation-logic drift between
  two copies of the same checksum/schema checks.
- New `aggregate_by_packet_key()`: groups admitted chunk-level identities by
  `packet_key`, computes each packet's vector as the L2-renormalized mean of
  its member chunks' exact, digest-verified vectors (a single-chunk packet's
  aggregate is numerically identical to its one exact vector), and picks a
  deterministic representative identity per group (smallest `str(point_id)`)
  for source_ref/tree_node_id/feature_label metadata.
- Every vertex now records `aggregated_chunk_count` and
  `aggregated_member_point_ids`, and the fixture records
  `packet_level_aggregation: true` / `packet_aggregation_method` /
  `chunk_level_admitted_row_count` — the aggregation is always auditable
  from the output file itself, not just from this doc.
- `semantic_vector_digest` per vertex is now a digest of the aggregate
  vector (computed fresh), not the original per-chunk Qdrant-verified
  digest — relabeled via a new `semantic_vector_source: "packet_level_mean_aggregate"`
  field so this provenance change is explicit, not silently reused under
  the old meaning.

**Verified as far as this gap allows**: ran the fixture builder against the
fixed, fresh reconciliation manifest. The aggregation code itself ran
end-to-end without error — loaded all admitted chunk-level identities
(`allow_duplicate_packet_keys=True`), excluded proto-service packets,
fetched and digest-verified every chunk vector via Qdrant, grouped and
aggregated by packet_key, sorted/limited to 500 candidates. This is further
than any previous run in this thread got.

### New, separate, larger blocker: LVG-2's relationship tables don't exist

The run then failed at the canonical-relationship-edge step:
`psycopg2.errors.UndefinedTable: relation "atlas_relationship_members" does
not exist`. Checked directly: neither `atlas_relationships` nor
`atlas_relationship_members` (the tables
`build_live_graph_fixture_semantic512.py`'s `fetch_relationship_rows()`
queries) exist anywhere in the live schema. The four `*relationship*` tables
that do exist (`atlas_feature_relationships`, `codebase_relationship_reports`,
`evidence_relationships`, `poi_relationships`) are not obvious renames —
`atlas_feature_relationships` is feature-level, not the packet-pairwise
canonical relationship structure this proof's "PostgreSQL canonical
relationships" lane (LVG-2) describes.

This is a different kind of gap than everything fixed in this thread so
far: those were logic bugs (wrong formula, wrong cardinality assumption)
fixable in application code. This is missing schema — LVG-2 appears to
never have been implemented at the table level. Per this repo's own Drizzle
Safety Rule (`CLAUDE.md`: "Do NOT change schema/migrations" without
explicit review), this is not something to create or redirect unilaterally.

Not yet done: deciding what LVG-2's relationship storage should actually
be (create the missing tables? redirect the query at
`atlas_feature_relationships` or a different existing table if its shape
fits? treat canonical relationship edges as out of scope for this proof and
make the graph semantic-KNN-only?), then re-running the fixture builder,
connectivity/parity re-checks, Louvain comparison, Nsight Systems/Compute
evidence (LVG-10/11).
