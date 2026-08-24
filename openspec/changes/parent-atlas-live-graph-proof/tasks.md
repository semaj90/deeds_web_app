# Parent Atlas live graph + GPU execution proof

Date frozen: 2026-08-20

## Purpose

Execute the bounded proof requested by the spectral-routing tranche on the **current persisted semantic representation**, rather than introducing another schema or silently restoring older 768-dimensional assumptions.

This proof consumes the reviewed `semantic_512` reconciliation contract frozen by `parent-atlas-semantic-512-canonicalization`. EmbeddingGemma native width 768 remains model lineage; `semantic_512` is the current persisted exact semantic representation. `source_revision` is not fabricated; source freshness remains owned by `SourceVersionReceiptV1` / mutation-awareness receipts.

## Frozen path

```text
semantic_512 reconciliation manifest + receipt
        |
        | only ADMITTED identities
        | exact Qdrant point re-read
        | vector digest verification
        v
500..5000 packet_key/source_ref candidates
        |
        +--> PostgreSQL canonical relationships
        |      atlas_relationships
        |      atlas_relationship_members
        |      relationship_id retained
        |      pairwise compute view only
        |
        +--> cuVS exact all-neighbors
               semantic_512 cosine top-K
               SEMANTIC_KNN derived only
        |
        v
frozen weighted graph fixture
        |
        +--> PageRank
        +--> spectral balanced cut
        +--> spectral modularity maximization
        +--> Leiden
        +--> existing KMeans/SOM baselines when present
        |
        v
LiveGraphFixtureReceiptV1
        |
        +--> stability ARI
        +--> modularity / edge-cut / ratio-cut when exposed
        +--> Recall@K / source coverage / historical repair coverage when eval cases exist
        +--> runtime / GPU-memory receipt
        |
        v
NVTX parent-atlas@atlas.graph_fixture
        |
        +--> Nsight Systems
        |      CUDA + NVTX + cuBLAS + cuBLAS verbose
        |      `.nsys-rep` = canonical trace artifact
        |      JSONLines / SQLite = derived exports
        |
        +--> Nsight Compute
               same NVTX push/pop range
               `.ncu-rep` + raw CSV metrics
               Tensor Core / precision evidence
```

## Authority rules

- PostgreSQL remains canonical relationship/participant authority.
- The relationship pairwise view is derived computation and retains `relationship_id` / `relationship_revision`.
- `SEMANTIC_KNN` edges are derived similarity and cannot mint a relationship.
- `semantic_512` exact retrieval is one semantic evidence family; cuVS/Qdrant/HNSW/FAISS are executors, not extra votes.
- Spectral cluster IDs, Leiden communities, PageRank/PPR, KMeans and SOM are derived routing signals.
- `tensor_core_used=true` is forbidden unless Nsight Compute reports non-zero Tensor/HMMA/IMMA/MMA metric evidence.
- A cuBLAS/cuBLASLt API observation alone proves the API path, not Tensor Core use.
- The `.nsys-rep` checksum is the durable execution-trace identity; exported JSONLines/SQLite are derived inspection surfaces.
- No graph/clustering/profiler receipt authorizes source mutation.

## Implementation status

```text
LVG-0 semantic_512 reconciliation prerequisite              BLOCKED (formula bug fixed+verified, 0->41344/53379 admitted; now blocked on packet-vs-chunk cardinality decision)
LVG-1 semantic_512 exact fixture builder                    EXECUTED_UNPROVEN (runs end-to-end clean, produces a CONNECTED 500-node graph -- ARI parity re-check not yet run)
LVG-2 canonical N-ary relationship compute projection      DESCOPED (tables don't exist; --include-canonical-relationships flag added, off by default, auditable via fixture fields)
LVG-3 exact cuVS semantic top-K graph                       IMPLEMENTED_UNPROVEN
LVG-4 live cuGraph PageRank                                 IMPLEMENTED_UNPROVEN
LVG-5 spectral balanced-cut (normalized_laplacian operator)  EXECUTED_UNPROVEN (parity BLOCKED but K-sensitive: peaks 0.88 at K=6, credible path to close further exists)
LVG-6 spectral modularity                                   EXECUTED_UNPROVEN (parity BLOCKED, flat 0.29-0.37 across K=3/6/7/8 -- no K-mismatch explanation, genuinely unresolved)
LVG-7 Leiden/Louvain comparison                              EXECUTED_UNPROVEN (both healthy on the connected fixture: Leiden 6 clusters, Louvain 7; degeneracy found earlier was specific to the disconnected fixture, since fixed)
LVG-8 stability/analyzer/repair metrics                     EXECUTED_UNPROVEN (fixed-seed repeat determinism PROVEN; repair metrics still absent)
LVG-9 GPU memory telemetry                                  IMPLEMENTED_UNPROVEN
LVG-10 Nsight Systems immutable trace                       IMPLEMENTED_UNPROVEN
LVG-11 Nsight Compute Tensor Core/precision evidence        IMPLEMENTED_UNPROVEN
LVG-12 Graphify daily adoption                              PENDING
LVG-13 workflow/A2A artifact streaming                      PENDING
LVG-14 agentic repair validator fixture                     PENDING
```

`IMPLEMENTED_UNPROVEN` means runnable code exists; no live workstation PASS is implied.
`EXECUTED_UNPROVEN` means a live workstation receipt exists but at least one proof-criteria
item below still fails (here: item 4/5, promotion gate criterion 6's `cpuGpuARI >= 0.99`).
`EXECUTED_DEGENERATE` means a live workstation receipt exists and the algorithm ran without
error, but produced a partition that is not a candidate for the comparison it was meant for
(here: every node its own cluster). This is a separate, more severe failure than
`EXECUTED_UNPROVEN` and must not be reported as "not yet run."
`BLOCKED` means a live, read-only run was executed and produced a deterministic,
reproducible non-result (here: 0 admitted rows) traced to a specific bug, not
absence of a run and not flaky/stale data.

LVG-0 detail: a fresh, read-only run of `python/atlas_semantic512_reconcile.py`
(no `--apply-payload`, no `--expected-manifest-checksum` — confirmed those are
the only write-gating flags in the script) produced 0 `ADMITTED`, 0 `REJECTED`,
53,379/53,379 rows `SOURCE_REF_ONLY_MATCH`. Traced to `classify_candidate()`'s
three "strong match" paths all being structurally unreachable against the live
schema: `EXPECTED_PACKET_KEY` assumes `packet_key = f"{source_ref}:{content_hash[:16]}"`
but live `packet_key` is `ace:packet:sha256(source_ref)[:12]` (verified on 5
sampled rows, no `content_hash` involvement at all); `CONTENT_HASH_PACKET_ID`
assumes `atlas_packets.packet_id == content_hash` but live `packet_id` values
are legacy sequential IDs like `packet_44_1784513267991` (61,660/61,660 rows
checked); `POINT_ID_ARTIFACT_ID` assumes `atlas_packets.artifact_id` equals a
bare Qdrant point UUID but live `artifact_id` values are `artifact:<16-hex>`
(58,304/61,660 rows populated, never UUID-shaped). This is a bug in the
reconciliation script's matching logic, not a corpus data-quality problem —
verified deterministic and 100% reproducible across the whole 53,379-row
corpus, not a sampling artifact. **Not fixed**: the correct match formula is
an identity-authority decision (what should back each match path given the
live `ace:packet:` scheme?) needing explicit review, not a unilateral guess.
This also means the 500-node fixture analyzed throughout this file's LVG-1/5/6/7
findings could not have come from a *current* run of this script — it predates
this bug or the schema drift that caused it.

**Formula fix applied and empirically verified** (not a guess): `expected_packet_key()`
now computes `"ace:packet:" + sha256(normalize_source_ref(source_ref))[:12]`,
matched exactly against 5 real `atlas_packets` rows before applying. Fresh
read-only re-run: **0 -> 41,344/53,379 admitted (77.5%)**, 0 rejected. Confirms
the fix is real.

**Cardinality blocker surfaced by the fix, resolved by operator decision
(2026-08-24): aggregate to packet-level.** The 41,344 admitted rows collapse
to only 3,293 distinct `packet_key` values (`atlas_packets` identity is
file/source_ref-level) against chunk-level `codebase_chunk_index`/Qdrant
candidates — 3,131/3,293 packet_keys (95%) have more than one admitted
chunk, avg ~12.5, max 412. Implemented: `load_reconciliation()` gained a
backward-compatible `allow_duplicate_packet_keys` opt-in (default `False`,
unchanged for its other caller); new `aggregate_by_packet_key()` collapses
chunk-level identities to one packet-level candidate per `packet_key` via
L2-renormalized mean of member chunk vectors, with a deterministic
representative-identity tiebreak (smallest `str(point_id)`) and full
audit fields (`aggregated_chunk_count`, `aggregated_member_point_ids`) on
every vertex. **Ran end-to-end without error through candidate selection**
— further than any previous attempt in this file.

**LVG-2 descoped by operator decision (2026-08-24)**: new
`--include-canonical-relationships` flag (default `False`, tables confirmed
absent from live schema) skips `fetch_relationship_rows` entirely rather than
creating schema or guessing a redirect target; fixture records
`canonical_relationship_edges_included` / `canonical_relationship_edges_skip_reason`
so this is always auditable.

**Then hit and fixed a fourth, unrelated bug**: `cuvs.neighbors.all_neighbors.build()`
was unpacked as a 3-tuple, but the live `cuvs` 26.06.00 install returns a bare
`device_ndarray` when no `distances`/`core_distances` buffers are supplied —
verified empirically against a throwaway 50x8 test dataset (contradicts the
function's own docstring). Fixed by not unpacking.

**Result: the fixture builder ran completely end to end for the first time in
this thread** — 500 vertices, 0 canonical edges (correctly descoped), 5,987
semantic KNN edges — **and the resulting graph is fully connected**: 1
component, all 500 nodes, verified via `scipy.sparse.csgraph.connected_components`.
The disconnection this entire file started with does not reproduce in a
correctly-built fixture. Ran `prove_live_graph_fixture.py` against it
(`status: EXECUTED`): Leiden naturally finds 6 balanced clusters (31-147
nodes, no forcing, no degeneracy); spectral balanced-cut and modularity both
naturally land on 8 clusters matching the frozen K, balanced 14-166 nodes,
no 92%-dominant giant cluster. Every pathology found earlier in this file is
absent here.

**ARI parity re-tested on the connected fixture (receipt
`docs/reports/spectral-diagnostic-receipt-v3-connected.json`) — result:
parity got WORSE, not better, and the earlier "K=8 on a 2-component graph"
hypothesis is DISPROVEN.** normalized_laplacian ARI dropped 0.9533 -> 0.6615;
modularity ARI dropped 0.9535 -> 0.3082; the k-means census range flattened
from init-dependent 0.20-0.9553 to a flat, init-independent 0.29-0.35.
Fixing the exact disconnection this file spent several commits root-causing
made CPU/GPU agreement substantially worse, not better. This is recorded as
a falsified hypothesis, not quietly corrected away — the earlier reasoning
was coherent given the evidence at the time but turned out wrong once
actually tested. New unconfirmed hypothesis: on a graph with genuine,
comparably-sized multi-community structure (this one: 8 clusters, 14-166
nodes each), CPU numpy and cuGraph's solver may be converging to different,
both-locally-valid partitions — a real implementation divergence, not
k-means noise on a near-degenerate signal. Full detail in
`docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

**Eigengap re-check on the connected graph** (`spectral-eigengap-probe-v2-connected.json`):
GPU eigenvectors still aren't observable (cuGraph wrapper constraint,
unchanged), but the CPU-side spectrum independently confirms single
connectivity (one machine-zero eigenvalue, not two) and shows the
strongest gap at **K=3** (`0.1149`, more than double any other gap in the
top-20), not K=8 — the tail from index 5 on is flat and undifferentiated,
no bump near K=8.

**K=3 parity test, mixed result — partial support, not confirmation**
(`spectral-diagnostic-receipt-v4-k3-connected.json`): normalized_laplacian
ARI improved substantially (0.6615 -> **0.8740**, `movedNodeCount` 20/500),
real support for "matching K to real structure helps." But modularity ARI
barely moved (0.3082 -> 0.3719) and the k-means census stayed flat/init-independent
(0.40-0.42). Gate remains `BLOCKED` at both K values. The modularity
operator's persistent, K-independent divergence from cuGraph is now the
most interesting unresolved question in this file — more interesting than
the original disconnection/cardinality issues, which are both now fixed.

**Further characterized (not resolved)**: compared each CPU reference
partition's own achieved modularity vs. GPU's, across both K values. An
initial read of the K=3 case alone ("CPU modularity-operator partition is
worse than GPU's, 0.43 vs 0.47") does not hold at K=8, where CPU's
modularity-operator partition is *better* than GPU's (0.4624 vs 0.4168) —
direction flips between K values, so "CPU is a weaker optimizer for this
operator" is retracted before being asserted as a conclusion. What is
consistent across all 4 rows (2 operators x 2 K values): the operator with
the larger `|CPU modularity - GPU modularity|` gap also has the lower ARI
in both K conditions — a real, reproducible correlation, but intuitive
rather than explanatory, and doesn't identify the actual mechanism. Full
table and detail in `docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

**Mechanism found, confirmed via `clusterContingency` (not just aggregate
stats):** GPU eigenvectors confirmed unreachable at every accessible API
layer (`cuvs.cluster` has only `kmeans`, `pylibcugraph.spectral_modularity_maximization` —
the lowest-level Python binding — still returns only `(vertices, clusters)`
per its own docstring; not a matter of more effort). Pivoted to the
contingency table instead: of the K=3 modularity operator's 115 moved
nodes, essentially all are one single confusion (CPU cluster 1 <-> GPU
cluster 0); the third cluster (48-55 nodes) is agreed on almost perfectly.
This matches the eigenvalue gaps exactly: the pair of eigenvalues that
distinguishes the poorly-agreed clusters has gap `0.1061` (nearly
degenerate); the pair isolating the well-agreed cluster has gap `1.3593`
(12x larger). Classical near-degenerate-eigenspace behavior — CPU numpy and
GPU cuGraph solvers land on different, comparably-valid splits specifically
where eigenvalues are close together, not where they're well-separated.
Not a bug in either implementation; a property of this graph's actual
spectrum. Closing the gap to the 0.99 gate likely needs a candidate sample
with cleaner eigenvalue separation (a property of upstream selection, not
this spectral step) rather than more solver tuning. Full detail in
`docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

**Louvain comparison: audited before assuming it needs new code
(`rg -i louvain`).** `python/atlas_rapids_community.py` already implements a
real, working `cugraph.louvain(...)` call (line 269) behind a Pydantic
request/response schema (`CommunityPartitionRequestV1`,
`algorithm: Literal["louvain", "leiden", "spectral"]`) explicitly framed as
"a GPU challenger... so the same frozen undirected weighted projection can
be compared backend-to-backend" — this is not the Neo4j GDS canonical
Louvain/Leiden lane (`compute-louvain-neo4j.mjs`,
`neo4j-gds-louvain.mjs`, etc. — 28 files match `louvain` under
`scripts/atlas/`, but those are the separate, durable-ownership community
lane the module's own docstring explicitly distinguishes itself from: "Neo4j
GDS remains the durable owner for promoted Louvain/Leiden runs today"). The
request schema uses external string node IDs (`nodeId`, `source`, `target`),
matching this tranche's `packet_key` identity directly — no ordinal
remapping needed to invoke it against the same fixture used throughout this
file. **Not yet run against this fixture** — this is a matter of invoking
an existing, purpose-built module, not writing a new Louvain runner. Do not
create a second one.

**Invoked, found and fixed a real crash, then got a clean result.**
`scripts/atlas/run_louvain_challenger_v1.py` drives
`atlas_rapids_community.py::run_cugraph_partition` against the connected
fixture. First attempt crashed
(`cudaMemcpyAsync ... cudaErrorInvalidValue`); isolated with a trivial
10-node line graph through the same module (crashed identically, confirming
this predates and is unrelated to this session's fixture) and root-caused
via direct dtype inspection: `vertices` is explicit `int32`, `edge_df`'s
`src`/`dst` default to `int64` when built from plain Python lists, and
`renumber=False` can't reconcile the mismatch. Fixed by casting `src`/`dst`
to `int32`. **Result**: 7 communities, modularity 0.5495, sizes
`[135,110,87,57,54,43,14]` — balanced, consistent in shape with Leiden's own
6-cluster result.

Three-way ARI: Louvain vs. Leiden `0.6863`; Louvain vs. spectral-K8
`0.3759`; Leiden vs. spectral-K8 `0.4297`. Two unforced natural-K methods
agree moderately with each other and both disagree substantially with the
`K=8`-forced spectral result — independent corroboration that forcing
`K=8` (not just CPU/GPU solver noise) is a real factor in this fixture's
spectral instability. Full detail in
`docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

**Full K sweep run (K=3, 6, 7, 8): the two spectral operators have
genuinely different, now well-evidenced profiles, not one shared problem.**
`normalized_laplacian` (LVG-5): ARI is K-sensitive and peaks at `K=6`
(`0.8784`, Leiden's own natural count), degrading steadily above that
(`0.79` at K=7, `0.66` at K=8) — real support for closing this gap by
picking K from actual structure rather than a frozen value, though even
the best result here is still short of `0.99`. `modularity` (LVG-6): ARI
stays flat and poor across the entire sweep (`0.37, 0.29, 0.29, 0.31`,
K=3/6/7/8) — no K-mismatch explanation applies here at all; this operator's
gap is a separate, still-unexplained property of how the CPU reference and
`cugraph.spectralModularityMaximizationClustering`'s actual implementation
diverge, not resolved by anything tried in this file (tolerance sweep,
eigenvector-count sweep, disconnection fix, or K sweep). Full table in
`docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

Not yet done: Nsight Systems/Compute evidence (LVG-10/11), investigating
the modularity operator's K-independent divergence (needs
implementation-level comparison, not more diagnostic-script sweeps),
testing whether upstream candidate selection tuned for cleaner eigenvalue
separation improves the Laplacian operator's parity further.

LVG-7 detail: `cugraph.leiden(graph, max_iter=100, resolution=1.0, random_state=seed+repeat,
theta=1.0)` (`scripts/atlas/spectral_fixture_benchmark.py:361`) returns 500 clusters for 500
nodes with `reported_modularity: -0.2198` and `analyzers.modularity: -0.0249`, identically
across both `spectral-live-fixture-receipt-500.json` and
`spectral-live-fixture-zero-duplicates-receipt-500.json` (`leiden.stability_ari: 1.0`, so this
is a deterministic, reproducible result, not run-to-run noise). `partition_agreement` against
both spectral methods is therefore `0.0` — meaningless as a comparison, since one side is fully
fragmented. Spot-checked the same `cugraph.leiden` call signature and column contract
(`vertex`/`partition`, `theta=1.0`) against `networkx.karate_club_graph()` in the live
`atlas-rapids-cu13` WSL2 env and it correctly finds a 2-4 community structure
(`modularity: 0.4188`) — so this is not an API-misuse or column-naming bug in the wrapper.
A resolution sweep (`scripts/atlas/leiden_diagnostic_receipt_v1.py`, receipt
`docs/reports/leiden-diagnostic-receipt-v1.json`, same seed/fixture, run against
both the fixture's actual edge weights and an all-weight-1.0 control graph) rules
out the edge-weight-scale hypothesis: the unweighted control graph collapses to
the same 500-singleton degeneracy at essentially the same resolution as the
weighted graph (unweighted collapses at `resolution=0.1`, weighted at
`resolution=0.5`; both are fully degenerate by `1.0`, the value the benchmark
uses). At `resolution <= 0.05` both graphs are healthy and near-identical
(2 clusters, modularity 0.90-0.999, deterministic, `gpuGpuARI: 1.0`). So this is
a sharp resolution-driven collapse specific to this graph's structure, not an
edge-weight artifact — root numerical/implementation cause still undiagnosed.
Separately: even the healthy low-resolution regime finds only 2 communities, not
the frozen `K=8` this tranche assumes elsewhere — Leiden's natural community
count on this fixture doesn't match the spectral `cluster_count` assumption
regardless of the degeneracy question.

A finer 13-point sweep (`docs/reports/leiden-diagnostic-receipt-v1-fine.json`)
confirms this is a hard jump (2 clusters -> 500 clusters in one resolution
step, no intermediate community count ever observed), not a gradual
refinement.

**Root cause confirmed** (`scripts/atlas/spectral_eigengap_probe_v1.py`,
receipt `docs/reports/spectral-eigengap-probe-v1.json`, cross-checked with
`scipy.sparse.csgraph.connected_components`): this 500-node fixture is a
literally disconnected graph — exactly 2 connected components, sizes 459 and
41. That is why Leiden only ever finds K=2 (disconnected components are
trivially separate communities under any modularity objective — this is a
structural floor, not a resolution-parameter coincidence), why the smaller
41-node component fragments first under increasing resolution, and very
plausibly why the spectral CPU/GPU parity gate is `BLOCKED` at ARI
~0.953-0.955: `K=8` forces 6 extra cluster boundaries to be carved out of a
single near-homogeneous 459-node component (92% of the sample) using an
eigenspace with little real signal past the first two components — consistent
with the already-recorded `eigenspace.canonical_authority: false` flag and
the k-means census's ARI range of 0.20-0.9553 driven purely by
`init`/`n_init` choice. See the full writeup in `docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

**LVG-1 finding, corrected once already** — an earlier version of this note
claimed the two components were the `SESSION-200-PACKET-IDENTITY-ALIAS-CONVERGENCE`
`packet:`/`ace:packet:` collision. That was checked against the live database
and is wrong: all 41 bare-hex keys already have live `atlas_packets` rows
(exact-match, no alias needed) and none appear in `atlas_packet_identity_aliases`
(3,294 rows checked, all a different key shape). `resolveCanonicalPacketKey()`
would resolve these 41 keys unchanged — it would fix nothing here.

The real finding: component 0's 41 nodes all have `source_ref` of the form
`proto:<ServiceName>.<Method>` (gRPC/Protobuf service-definition packets) —
a structurally different corpus from component 1's 459 `ace:packet:`
codebase-chunk packets. These two corpora are far enough apart in
`semantic_512` space that the top-16 cuVS KNN
(`python/build_live_graph_fixture_semantic512.py`, `--semantic-top-k 16`)
doesn't bridge them at this candidate-window size. The lexicographic
candidate sort at line 215
(`sorted(identities, key=lambda row: (row.packet_key, str(row.point_id)))[:limit]`)
then determines exactly *which* 41-vs-459 split gets admitted (pure-hex proto
keys sort before `ace:packet:...` alphabetically), but the underlying
"these two corpora don't bridge under KNN" is a real structural property,
not a sort-order artifact by itself. **Fix applied**: `python/build_live_graph_fixture_semantic512.py` now excludes
`proto:*`-sourced packets from candidate selection by default (new
`--include-proto-service-packets` opt-out flag; fixture output records
`proto_service_packets_included` / `proto_service_packets_excluded_count`
for auditability). **Not yet re-verified**: re-running the fixture builder
to confirm this produces a connected graph failed on an unrelated,
pre-existing gap — the on-disk reconciliation manifest currently has zero
`ADMITTED` rows (LVG-0, already `EXISTING_UNEXECUTED` before this session).
The patch itself compiles cleanly and reached the reconciliation-loading
step before hitting that unrelated failure. Full writeup in
`docs/reports/spectral-rtx-alignment-sweep-20260823.md`.

Live receipts backing the `EXECUTED_UNPROVEN` rows (2026-08-23):
`docs/reports/spectral-live-fixture-receipt-500.json`,
`docs/reports/spectral-live-fixture-zero-duplicates-receipt-500.json`,
`docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-4-receipt-500.json`,
`docs/reports/spectral-live-fixture-zero-duplicates-evs-1e-6-receipt-500.json`,
`docs/reports/spectral-live-fixture-zero-duplicates-eigen-2-receipt-500.json`,
`docs/reports/spectral-live-fixture-zero-duplicates-eigen-4-receipt-500.json`,
`docs/reports/spectral-rtx-alignment-sweep-20260823.md` (narrative + reconciliation addendum), and
`docs/reports/spectral-diagnostic-receipt-v2.json` (fixed-seed repeat determinism +
k-means initialization census — **currently untracked**, along with its producer
`scripts/atlas/spectral_diagnostic_receipt_v2.py`; commit both before treating this
as durable evidence). Promotion gate (proof criterion 6, `cpuGpuARI >= 0.99`) remains
`BLOCKED` at ARI ~0.953-0.955 regardless of eigensolver tolerance, eigenvector count,
or CPU operator (normalized-Laplacian vs. modularity matrix); k-means initialization
method is the strongest untested lead (`scripts/atlas/spectral_diagnostic_receipt_v2.py`
`kmeansCensus`: ARI 0.20-0.9553 depending on `init`/`n_init`, none reaching 0.99).

## Operator sequence

First complete the existing read-only semantic reconciliation:

```bash
python python/atlas_semantic512_reconcile.py \
  --manifest-out data/atlas-ml/semantic512-reconciliation.ndjson \
  --receipt-out data/atlas-ml/semantic512-reconciliation-receipt.json
```

Review all `REVIEW` / `REJECTED` classes and the manifest checksum. The live graph builder consumes only `ADMITTED` rows and re-verifies exact Qdrant vector digests.

Build a 1000-candidate graph:

```bash
PYTHONPATH=python python python/build_live_graph_fixture_semantic512.py \
  --reconciliation-manifest data/atlas-ml/semantic512-reconciliation.ndjson \
  --reconciliation-receipt data/atlas-ml/semantic512-reconciliation-receipt.json \
  --workflow-id=<workflow-id> \
  --workflow-revision=<workflow-revision> \
  --source-snapshot-revision=<source-snapshot-revision> \
  --graph-revision=<graph-revision> \
  --feature-revision=<feature-revision> \
  --limit=1000 \
  --clusters=20 \
  --semantic-top-k=16 \
  --output=.tmp/atlas/live-graph/live-graph.json
```

Execute cuGraph:

```bash
PYTHONPATH=python python python/prove_live_graph_fixture.py \
  --fixture=.tmp/atlas/live-graph/live-graph.json \
  --output=.tmp/atlas/live-graph/live-graph-fixture-receipt.json
```

Profile the exact frozen fixture:

```bash
bash scripts/atlas/profile-live-graph-fixture.sh \
  .tmp/atlas/live-graph/live-graph.json \
  .tmp/atlas/live-graph/profile
```

Expected profiler outputs include:

```text
live-graph.nsys-rep                 canonical trace artifact
live-graph*.json/jsonlines          derived Nsight Systems export when supported
live-graph*.sqlite                  derived Nsight Systems export when supported
live-graph-ncu.ncu-rep              Nsight Compute report
live-graph-ncu.csv                  derived raw metric export
gpu-execution-evidence-receipt.json
```

## Proof criteria

Do not add this to `graphify:daily` until all of the following are observed on one frozen revision-qualified fixture:

1. at least 500 admitted semantic_512 rows with valid packet_key/source_ref and vector digest lineage;
2. non-zero canonical relationship coverage after the proven `entity_id -> packet_key` join; if this join is wrong, fail and repair identity resolution rather than invent edges;
3. exact cuVS semantic top-K receipt uses `semantic_512`, dimension 512, cosine, brute-force all-neighbors;
4. PageRank, balanced cut, spectral modularity and Leiden all return complete dense-ordinal outputs;
5. spectral/Leiden stability and available modularity/edge-cut/ratio-cut metrics are recorded;
6. quality is compared against existing KMeans/SOM signals and, once historical repair cases are attached, validator/repair success is measured;
7. GPU memory stays inside the admitted resource envelope;
8. Nsight Systems produces a checksum-addressed `.nsys-rep` for `atlas.graph_fixture@parent-atlas`;
9. any cuBLAS/cuBLASLt claims come from observed trace records;
10. any Tensor Core claim is supported by non-zero Nsight Compute metrics, not names/heuristics;
11. no code path fabricates `source_revision` or treats vector dimension as mutation freshness.

## Tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/spectral-graph-clustering.test.mjs
node --test packages/parent-atlas/test/gpu-trace-evidence.test.mjs
PYTHONPATH=python python python/test_live_graph_fixture.py
```

The pure tests prove validation/checksum rules only. RAPIDS, Qdrant, PostgreSQL and Nsight gates remain unproven until the operator sequence produces receipts.
