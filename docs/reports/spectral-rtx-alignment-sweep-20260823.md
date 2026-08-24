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

### Why it's disconnected: candidate selection is a naive lexicographic sort over un-canonicalized packet_key strings

Cross-referenced the two connected components against `nodes.parquet`'s
`packet_key` column directly:

- Component 0 (41 nodes): bare hex keys, e.g. `0ba2345cd9c542fa`,
  `1703d9c005252a62` — no prefix.
- Component 1 (459 nodes): `ace:packet:`-prefixed keys, e.g.
  `ace:packet:001be68ca4b0`, `ace:packet:0050126ac87d`.

These are the two packet-key naming schemes described in prior session
memory (`SESSION-200-PACKET-IDENTITY-ALIAS-CONVERGENCE`: a bare-hex scheme
and an `ace:packet:`-prefixed scheme, reconciled there via a new
`atlas_packet_identity_aliases` table and `resolveCanonicalPacketKey()`
resolver). `python/build_live_graph_fixture_semantic512.py:215` selects
this fixture's 500 candidates with
`identities = sorted(identities, key=lambda row: (row.packet_key, str(row.point_id)))[:limit]`
— a plain lexicographic string sort over `row.packet_key`, taken directly
from the reconciliation manifest (`load_reconciliation()` at line 210-214)
with **no call anywhere in this file to `resolveCanonicalPacketKey` or any
reference to `atlas_packet_identity_aliases`**. ASCII sorts digit characters
before `a`, so every bare-hex-scheme row sorts before every
`ace:packet:`-scheme row with the same leading character, and the first 500
rows by this sort order end up being "all currently-admitted bare-hex rows,
padded out with the alphabetically-earliest `ace:packet:` rows" — not a
representative or connected sample of the corpus, an artifact of mixing two
un-reconciled identity schemes and then sorting on the raw string.

This is a more direct and more actionable explanation than "K=8 may not suit
a 500-node sample in general": the fixture builder should either (a) resolve
every `packet_key` through the canonical alias resolver before selecting
candidates, so both schemes collapse to one, or (b) not use raw
lexicographic packet_key order as the candidate-selection method at all
(e.g. sample by `source_ref`/`directory_path`, or take a connectivity-aware
sample). Until one of those changes, disconnection at this candidate size
should be expected to recur on every re-run of this fixture builder, not
just this one execution.

Louvain was not run on this fixture at all.

Not yet done: fixing `build_live_graph_fixture_semantic512.py`'s candidate
selection (LVG-1) per the above, re-running the fixture and re-testing
parity after the fix, Louvain comparison, Nsight Systems/Compute evidence
(LVG-10/11).
