# CLAUDE.md archive — GPU compute / Tang / LibTorch history (verbatim)

Archived 2026-10-03 from root CLAUDE.md to cut instruction size. Not deleted: content below is unchanged. Consolidated have-vs-need lives in `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.
Source ranges (pre-trim line numbers): 1230-1296 (Tang census) and 1351-2118 (GPU-MINI-FABRIC-01 ... LIBTORCH-DEPENDENCY-CENSUS-01).

---

### Correction: "Ewin Tang recommendation" — literal-name search is not proof of absence (Sep 15 2026)

A same-day audit concluded "Ewin Tang's recommendation algorithm doesn't exist anywhere in this
repo" from `rg -ni --hidden --no-ignore "ewin tang"` returning zero hits. **That conclusion was
wrong, or at least premature** — a literal-name search proves the *name* isn't used, not that the
*mechanism* was never built. Real, mechanism-named implementation was found once actually checked:
`git log --all --oneline` for `python/atlas_compute/low_rank.py` and
`**/sample-query-matrix-v1.ts` returns real commits — `feat(atlas): add low-rank and Tang-inspired
comparison receipts`, `feat(atlas): add sample query matrix and length squared sampler`,
`feat(atlas): prove semantic low-rank parity lineage`, `Repair SampleQueryMatrixV1 merge
corruption` — plus a whole branch, `agent/ast-xgb-tang-alignment-20260822`. This machinery was
real: `SampleQueryMatrixV1`, squared-L2/length-square sampling, explicitly gated
`canonicalIdentityAuthority: false` / `retrievalVoteAdded: false` (challenger/shortlist only,
never a retrieval vote or identity authority) — architecturally identical to this file's own
existing governance pattern below.

**CORRECTION, same day, a few hours later — the "two targeted `find`s came back empty" claim above
was itself wrong.** Those `find`s were run scoped wrong (or against a stale snapshot) — a direct
`Read`/`git ls-files`/`git log -- <path>` check on the real working tree shows **all three files
exist right now, on `main`, tracked, non-empty, real**:

```
python/atlas_compute/low_rank.py                                                    267 lines
sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts            58 lines
sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.spec.ts       17 lines
```

**`TANG-LOW-RANK-OWNER-CENSUS-01` — COMPLETE, run for real (2026-09-15)**:

| Field | Finding |
|---|---|
| `literalNameHits` | 0 in current tree (outside `.tmp/`/`deeds_labs/archive/` snapshots) — the person's name is still never used in code |
| `mechanismHits` | 3 current files (above) + the git-log commit trail already cited |
| `currentFiles` | present, tracked, non-empty, on `main` |
| `historicalFiles` | same files, same content lineage — no divergence between historical and current |
| `currentCallers` | **Real.** `recommendation-evidence-bundle-v1.ts:3` imports `SampleQueryMatrixV1Schema` and embeds it as a nullable `sample` field in `RecommendationEvidenceBundle`. `python/prove_atlas_compute.py:30` imports `compare_low_rank_recommendations` from `atlas_compute.low_rank` as a CLI proof-receipt generator (`--low-rank` flag). Neither is a retrieval hot path. |
| `tests` | Real: `sample-query-matrix-v1.spec.ts` (2 passing-shaped assertions: length-squared probability computation, row-L2 degeneracy detection) |
| `receipts` | `LowRankComparisonReceipt` / `CandidateShortlistReceipt` (Python, `schema: "atlas.low-rank-comparison-receipt.v1"` / `"atlas.candidate-shortlist-receipt.v1"`, both `canonical_authority: False`); `SamplingDecisionV1` (TS, `canonicalIdentityAuthority: false`, `retrievalVoteAdded: false`) |
| `productionCaller` | No — challenger/evidence-bundle-only, explicitly gated non-canonical in both languages |
| `canonicalAuthority` | `false` everywhere it appears — by design, not by omission |
| `retrievalVoteAdded` | `false` everywhere it appears |

**Verdict: this machinery is real, current, tested, and already correctly classified as
`EXPERIMENT`/challenger evidence — not dead, not missing, not something to rebuild.** The Sep 15
"empty find" note above was a false negative from a bad search, not a true absence. Treat this
file's own §"Duplication Prevention" rule as satisfied for this capability going forward: do not
build a second low-rank/length-squared-sampling module — this is the one, and it already declines
canonical authority correctly.

**Separate finding — a stale, more-advanced unmerged branch exists and should NOT be silently
merged**: `origin/agent/sample-query-matrix-ewintang-20260822` (fetched and diffed against `main`,
2026-09-15) is NOT an ancestor of `main` and diverges heavily overall (~311KB whole-repo diff, dated
2026-08-22, predates roughly three weeks of unrelated main-branch churn) — merging it wholesale
would be reckless and is explicitly NOT done here. But its versions of these 3 files are a real,
more mature evolution: revision/checksum-qualified (`workspaceRevision`, `sourceMatrixRevision`,
`sourceMatrixChecksum`), integrates with the real canonical `candidateOrdinalMapV1Schema`
(`features/canonical-candidate-v1.ts`, confirmed present on `main`), and adds a
`samplingEvaluationV1Schema` (measures length-squared vs. uniform vs. top-k-row-norm recall — an
actual evaluation harness, `main` has no equivalent). It also **renames** several fields
(`canonicalIdentityAuthority`→`identityAuthority`, `retrievalVoteAdded`→`retrievalVoteProduced`,
adds `canonicalWritesAttempted`/`producerRevision`) and restructures `rows` — a breaking contract
change relative to `main`'s current shape, which `recommendation-evidence-bundle-v1.ts` already
depends on by the old names. **This is a real architecture decision (port the improved contract
forward vs. leave the branch superseded), not a mechanical sync — flagged for the operator, not
resolved unilaterally.** Cherry-picking just these 3 files' content (not merging the branch) is the
bounded path if the operator wants the improved version; do not attempt it without confirming every
other caller of the old field names first.


---

### GPU-MINI-FABRIC-01 proving ground + WSL2 RAPIDS environment correction (2026-09-01)

**RAPIDS/cuVS/cuGraph ARE already installed and proven — via WSL2 conda, not pip, not native
Windows.** A same-day probe in this file's own investigation trail initially concluded "cuVS/cuGraph
not installed" — that was **wrong**, caused by running `python3 -c "import cuvs"` in a
non-interactive WSL2 shell that never sourced `conda.sh`, so it silently ran against the base
system Python instead of the real environment. The real environment, verified live by invoking its
Python by absolute path:

```
WSL2 Ubuntu → /home/james/miniforge3/envs/atlas-rapids-cu13
  cuVS 26.06.00 · cuGraph 26.06.00 · cuDF 26.06.01 · CuPy 14.1.1 · PyTorch 2.13.0+cu130
  GPU: NVIDIA GeForce RTX 3060 Ti, CUDA available: True
```

**Do not create a second RAPIDS environment or `pip install cuvs-cu13`/`cugraph-cu13`, and do not
upgrade 26.06 → 26.08, without first demonstrating this environment is unusable for a specific
reason** — an upgrade mid-series would muddy `GpuExecutionIdentityV1`-style reproducibility evidence
across a multi-phase proof sequence. **Lesson for future probes**: in WSL2, `which conda` / a bare
`python3 -c "import X"` from a non-interactive shell is NOT evidence an environment is absent —
invoke the target env's Python by its absolute path (`/home/james/miniforge3/envs/<env>/bin/python`)
or explicitly `source /home/james/miniforge3/etc/profile.d/conda.sh && conda activate <env>` first.

**Separate cuTile/SIMT challenger found (2026-09-14):** the earlier cuTile proof environment still
exists at `/home/james/.venvs/atlas-cutile-cu132`; it is not a Miniforge environment and is not part
of `atlas-rapids-cu13`. Direct WSL2 probing reports PyTorch `2.14.0+cu132`, CUDA `13.2`, cuTile
`1.5.0`, Tile compiler `13.2.78`, and the RTX 3060 Ti (`sm_86`). The read-only vector-add and
FP16 GEMM probes pass with finite output; the GEMM receipt reports zero absolute and relative
delta against the PyTorch result. Use `/home/james/.venvs/atlas-cutile-cu132/bin/python` for
cuTile/SIMT probes and `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python` for RAPIDS/cuVS/
cuGraph work. Do not merge the environments or add cuTile to Docker 8098 without a separate ABI,
memory, and reproducibility decision. These are challenger proofs, not canonical representation or
production decoder promotion.

**Ampere 8 GiB memory alignment (verified 2026-09-14):** the RTX 3060 Ti is compute capability
`8.6`. Keep the proven WSL2 RAPIDS environment (`/home/james/miniforge3/envs/atlas-rapids-cu13`)
on the existing 26.06 stack and keep cuTile/SIMT in the separate
`/home/james/.venvs/atlas-cutile-cu132` venv. Do not load cuDF/cuGraph/cuVS, cuTile, and a large
decoder concurrently on this 8 GiB device. Start with bounded fixtures, FP16/BF16 where the
operation has a parity receipt, FP32 accumulation for reductions, and matrix dimensions divisible
by 8. Preserve explicit host/device ownership and release temporary tensors between stages.

For RAPIDS, use RMM as the common allocator and set a deliberately capped pool only inside a
measured worker; do not accept the library default of reserving half or all available VRAM when
other CUDA consumers share the device. For PyTorch fragmentation, test
`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` per process and record allocated/reserved/free
bytes before and after each fixture. These are operational tuning options, not identity or
promotion evidence. NVIDIA documents cuTile Python support for Ampere in the CUDA 13.2 line,
while RAPIDS documents RMM pool/async allocation and third-party allocator hooks; use those
references when re-running the isolated challenger, without changing the canonical semantic lane.

**`GPU-MINI-FABRIC-01`** (full roadmap in `openspec/changes/parent-atlas-gpu-mini-fabric-01/`) is a
small, synthetic, frozen-fixture GPU proving ground built specifically so that no phase — exact vs
approximate retrieval, structural graph traversal, ACE/BitFrost residency prediction, radix
grouping, LOD promotion, and eventually a cuTile challenger — is attempted without a CPU or
vendor-exact oracle sitting directly next to it first. **Never touches canonical production data.**

**Phase A — `SEMANTIC-EXACT-PARITY-01`: PASS** (real, run on this host's RTX 3060 Ti in
`atlas-rapids-cu13`, not simulated). Frozen fixture: 16,384 nodes, 64-dim, K=16, 256 queries, fixed
seed, with `nodeKey`/`projectionOrdinal`/`candidateOrdinal` deliberately kept as three distinct
values per node specifically to catch accidental coordinate conflation. PyTorch exact GEMM+topk
(oracle) vs cuVS brute-force (via the existing canonical `atlas_compute.cuvs_analytics.run_cuvs_exact_knn`
— reused, not duplicated):

```
recall@16: 1.0 | rank1_match: 1.0 | node_key_identity_match: 1.0
max_top1_score_delta: 3e-07 (tolerance 1e-4) | ordinal_conflation_hits: 0/0
gate.RESULT: PASS
```

Code: `python/atlas_compute/gpu_mini_fabric/` (`semantic_exact_parity_fixture.py`,
`semantic_exact_parity_01.py`). Result: `docs/reports/gpu-mini-fabric-01-semantic-exact-parity-01.json`.

**Phase B — `GPU-GRAPH-ANN-01`: PARTIAL_PROVEN** (real, run on this host — not simulated). CAGRA
(default params: `build_algo="ivf_pq"`, `itopk_size=64` — deliberately never NVIDIA's own `"ace"`
build_algo) vs the Phase A exact oracle, sequential 16K→64K→256K→1M:

```
N=16384: PASS  recall@16=0.9746 recall@1=1.0 build=916.6ms search=7237.6ms total (28.3ms/query)
N=65536: FAIL  recall@16=0.8289 recall@1=1.0 min_recall@16=0.5  ← crossover boundary
256K/1M: not attempted (sequence halts on first failing tier)
```

Code: `python/atlas_compute/gpu_mini_fabric/graph_ann_fixture.py` + `graph_ann_01.py`. Result:
`docs/reports/gpu-mini-fabric-01-graph-ann-01.json`. **Honest caveat**: the fixture is
uniform-random 64-dim Gaussian noise with no manifold structure — harder for ANN than real
embeddings, so this crossover boundary is specific to that synthetic difficulty + default params,
not a general "CAGRA fails at 64K" claim. `itopk_size` retuning (CAGRA's own documented
accuracy/speed knob) was deliberately not attempted here — that's a distinct follow-up, not a
silent fix to force a pass.

**CORRECTED (2026-09-01) — both of the research findings originally recorded here were wrong or
overstated, verified against primary sources, not left standing**:
1. ~~"Workspace-constrained VRAM caused the N=65536 recall drop"~~ — **falsified by a controlled
   test** (see Phase B2-build-isolation below): rerunning the exact same default config with ~2–7x
   more free VRAM reproduced the same low recall almost exactly. The real cause is `build_algo`
   graph-build quality, not VRAM pressure.
2. ~~"cuGraph's `pagerank()` silently ignoring its `dangling` parameter, per known issue
   `rapidsai/cugraph#482`, will cause a divergence"~~ — **the citation was wrong**, found by pulling
   #482's full comment thread directly via the GitHub API (not a search-engine summary). The issue's
   actual, closing resolution: NetworkX had loaded the graph undirected by default while cuGraph
   built it directed — a graph-construction-semantics mismatch, with dangling-node handling never
   once mentioned in the thread. The underlying fact about `dangling` being a no-op is separately
   true (verified directly against cuGraph's own docstring: *"This parameter is here for NetworkX
   compatibility and ignored"*), but #482 doesn't demonstrate it mattering — see the `GRAPH-PAGERANK-02`
   result below, which empirically tested it and found no measurable effect at this graph's dangling
   density. The real, more general lesson from #482: **PageRank parity requires identical graph
   semantics (directedness, vertex set, edge set, renumbering) between engines** — now enforced as
   its own `GraphExecutionSemanticsV1` check, run before any PageRank comparison.

**Phase B2-build-isolation — `GPU-GRAPH-ANN-02A/02B`: controlled build-algorithm isolation (the
retry above, actually run).** Same frozen N=65536 fixture/oracle/seed as the original `GPU-GRAPH-ANN-01`
tier, `itopk_size=64` held fixed, only `build_algo` varied, with a `CagraBuildReceiptV1` captured
per run:

```
02A build_algo=ivf_pq:     recall@16=0.8391  worst=0.4375  freeVramBefore=1539MB (7x original headroom)
                            internalBatchReductionObserved=true  ← fires regardless of headroom
02B build_algo=nn_descent: recall@16=0.9980  worst=0.9375  freeVramBefore=1515MB
                            internalBatchReductionObserved=false
(original GPU-GRAPH-ANN-01: recall@16=0.8289, only ~200-900MB free)
```

**02A reproduces the original 0.8289 result almost exactly (0.8391) despite ~2–7x more free VRAM —
this falsifies the VRAM-pressure hypothesis.** 02B (only `build_algo` changed, `itopk_size` left at
default) alone jumps recall to 0.998. The recall gap is a real `ivf_pq` build-quality limitation at
this N/dim, not a memory artifact of this host's shared GPU. Code/result:
`graph_ann_02_build_isolation.py` / `docs/reports/gpu-mini-fabric-01-graph-ann-02-build-isolation.json`.

**Phase B2 — `GPU-GRAPH-ANN-02` itopk_size sweep** (run before the build isolation above — out of
the methodologically correct order; NVIDIA's own guidance is build-side isolation, then tune
itopk_size, then graph_degree/intermediate_graph_degree. The sweep's data remains valid, it just
couldn't by itself distinguish "itopk_size fixed it" from "a different build would have regardless"
— both are now independently confirmed true). Same frozen N=65536 fixture, graph construction held
fixed (`build_algo="ivf_pq"`), only `itopk_size` swept:

```
itopk=64:  recall@16=0.8347  worst=0.5625  p50=1.92ms  qps=351
itopk=256: recall@16=0.9805  worst=0.8125  p50=1.91ms  qps=369  ← clears 0.95 gate
itopk=512: recall@16=0.9980  worst=0.9375  p50=1.91ms  qps=360
```

Per-query latency is essentially flat across the whole sweep — the N=65536 FAIL was a default-param
artifact, not a hard recall ceiling. Code/result: `graph_ann_02_itopk_sweep.py` /
`docs/reports/gpu-mini-fabric-01-graph-ann-02-itopk-sweep.json`.

**Phase B3 — `GPU-GRAPH-ANN-03` on the real semantic_768 distribution: PASS.** Real, read-only export
of `codebase_chunk_index.content_embedding` (55,169 rows — all currently populated, not padded to
65,536; `canonical_production_data_touched: true` / `_mutated: false` recorded explicitly, distinct
from every synthetic-fixture phase's `false`):

```
oracle cross-check (cuVS brute-force vs PyTorch exact): 0.9993 agreement
itopk=64  (default): recall@16=0.9905  worst_query_recall@16=0.0     ← flagged, not smoothed over
itopk=512 (tuned):   recall@16=0.9995  worst_query_recall@16=0.9375
```

Confirms the Gaussian-64 fixture's low recall was specific to unstructured synthetic data — real
embeddings clear 0.99 mean recall@16 even at default params. **Flagged, not investigated further
yet**: one query got exactly 0.0 recall@16 at default `itopk=64` (likely a near-duplicate-embedding
edge case; the tuned config already fixes the floor). Code/result:
`export_semantic_768_fixture.py` + `graph_ann_03_semantic_768.py` /
`docs/reports/gpu-mini-fabric-01-graph-ann-03-semantic-768.json`.

**Phase D — `GPU-GRAPH-STRUCT-01` (BFS) + `STRUCT-02`/`GRAPH-PAGERANK-01` (PageRank): both PASS.**
`GraphFixtureV1` (10K nodes, 50K typed edges) — vertex identity is the `nodeKey` string fed directly
to both NetworkX and cuGraph, never a row index or engine-internal ID. **Relabeled per the #482
correction above**: this fixture's zero-dangling-node property is an explicit **isolation** choice
(removes one variable to establish basic numerical parity), not a claim that dangling nodes cause a
bug — production graphs naturally have them.

```
STRUCT-01 BFS:       exact node-set + depth match at all 5 seeds (depth_limit=2)
GRAPH-PAGERANK-01:   vertexSetExact=true  rankCorrelation=0.99992  topKOverlap=0.98
                     GraphExecutionSemanticsV1 confirmed agreement (directed/vertexCount/edgeCount/
                     ordinalMapChecksum identical both engines) BEFORE the PageRank comparison ran
```

**`GRAPH-PAGERANK-02` — empirically characterizes the dangling-parameter no-op (not assumed): NO
MEASURABLE DIVERGENCE.** Fixture with 80/10,000 nodes (0.8%) naturally dangling — PageRank divergence
attributable to dangling-node handling was `6.27e-6` whole-graph, `1.61e-6` on the dangling nodes
themselves, essentially the same noise floor as `GRAPH-PAGERANK-01`'s zero-dangling baseline
(`6.26e-6`). At this density and graph structure, cuGraph's documented no-op does not produce a
practically measurable difference — an honest, data-driven answer rather than a forced "found a
problem." Code/result: `graph_pagerank_02_dangling.py` /
`docs/reports/gpu-mini-fabric-01-graph-pagerank-02-dangling.json`.

**Three real bugs/mistakes found and fixed during these runs, not glossed over**: (1) `cugraph.bfs()`
marks unreached vertices with the sentinel `distance=2147483647` (INT32_MAX), not `-1` as first
assumed from the docstring — verified live by direct inspection before fixing the filter; the first
attempt incorrectly counted all 10,000 nodes as "reached" per seed until this was found. (2) The
original PageRank gate required `topKOverlap == 1.0`, which contradicted this capability's own
"numerical tolerance, not bit-identical scores" design principle — recalibrated to `>= 0.95` (spec
updated to match) since a hard rank-100 cutoff can legitimately flip 1-2 nodes at near-tied scores.
(3) The #482 misattribution described above. `GraphExecutionSemanticsV1`
(`graph_execution_semantics.py`) now gates every PageRank comparison — checks `directed`,
`vertexCount`, `edgeCount`, `ordinalMapChecksum` agree between engines before scores are even
computed, which is what would have actually caught #482's real bug class. Code:
`graph_fixture.py` + `graph_struct_01_bfs.py` + `graph_struct_02_pagerank.py` +
`graph_execution_semantics.py` + `graph_pagerank_02_dangling.py`.

**Staged, not yet built** (see `tasks.md` for the full phased plan and gating order — each phase
only starts after the prior one passes): Phase C (cuVS CAGRA→HNSW conversion, not hand-written HNSW),
`BITFROST-SIM-01` +
`BITFROST-LOD-01` (logical `AtlasAceResidencyV1` hot/warm/cold + LOD-ladder prediction — tested
against actual next-query reuse, not plausibility), `SOM-CACHE-01` (SOM-neighbor-prefetch vs
graph-neighbor vs LRU tournament — SOM stays `STEP-08 experimental` unless it beats both baselines),
`CUTILE-ACE-01` (LEVEL 3 fused cuTile challenger, gated behind `ACE-RADIX-01`'s CUB oracle and a
LEVEL 2 simple-SIMT proof — graph traversal is explicitly never a first cuTile target), and
`BITFROST-L2-01` (CUDA `cudaAccessPropertyPersisting` L2 tuning, gated behind a proven logical
residency policy — L2 reset/persistence is a physical hint layered under BitFrost, never a
substitute for it, and has no effect on VRAM/OOM headroom).

**GPU-primitive LEVEL discipline** (governs every phase above): LEVEL 1 vendor primitives (cuVS,
cuGraph, cuBLASLt, CUB) prove architecture; LEVEL 2 simple custom CUDA/SIMT (feature scoring, key
packing, gather/scatter, LOD masks) proves a fusion opportunity exists; LEVEL 3 cuTile fuses what
LEVEL 2 proved worth fusing. No level is skipped, and graph traversal (irregular, variable-degree,
divergent-path) is never a first custom-kernel target.

**See**: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-mini-fabric-01/` (proposal.md,
design.md, specs/, tasks.md).

### ⚠️ "ACE" naming collision with NVIDIA's own ACE (2026-09-01)

NVIDIA's cuVS HNSW build API also uses the acronym **ACE (Augmented Core Extraction)** — a
completely unrelated GPU HNSW-graph-build feature. This is NOT the same "ACE" as this repo's
Atlas context/residency system (`ACEContext`, `ace:*` Redis keys, `assembleACEContext`, etc.).
**Keep the two explicitly separated in code and naming going forward**: this repo's own contracts
use names like `AtlasAceResidencyV1` (never a bare `Ace*` that could be confused with NVIDIA's
cuVS build API), and any future cuVS HNSW integration code must use a distinct name like
`CuvsHnswAceBuild` rather than a bare `Ace*`. When reading NVIDIA cuVS/HNSW docs or code, "ACE"
there means their build feature, not this repo's context-assembly system — do not conflate.

### GPU primitive ownership table + radix sort placement (contracts + CUB oracle DRY_RUN_PROVEN, 2026-09-01)

Applying the rule above to a specific recurring question — "where does radix sort / GPU candidate
reorganization live?" — **radix sort is a BACKEND beneath the ACE/BitFrost `CANONICAL_OWNER` for
residency/admission, never a peer retrieval-ranking lane** alongside cuVS ANN / cuGraph / lexical
fusion. Full contracts, design rationale, and the proof gate are in
`openspec/changes/parent-atlas-ace-radix-residency/` — 25/26 tasks done (`openspec validate
--strict` passes). **Still no BitFrost production wiring in this change** (per design.md's
Non-Goals) — only the contracts below are live code; the proof-gate result is a benchmark artifact,
not a production integration.

**`ACE-RADIX-01` result (`docs/reports/ace-radix-01-results.json`, run 2026-09-01 on this dev host —
RTX 3060 Ti, CUDA 13.0.48, driver 580.88, sm_86)**: CUB `DeviceRadixSort` matched the CPU `std::sort`
reference **exactly** at every tested N (256/1000/4000/16000/64000) — `overallVerdict:
"DRY_RUN_PROVEN"` for the CUB-oracle half. The cuTile challenger half is **`ENVIRONMENT_BLOCKED`**:
verified live that this host's CUDA 13.0 toolkit ships only `include/crt/cuda_tile.h`, a bare
compiler-intrinsic stub (`__tile_builtin__ print`), not a usable host-side cuTile programming API —
confirms this file's own prior note that cuTile went stable on Ampere only at CUDA 13.2. Full
`ACE-RADIX-01` (both CUB and cuTile matching) stays `NOT_PROVEN` until re-run on a CUDA 13.2+ host.
Do not claim cuTile eligibility from this result — only the CUB-vs-CPU determinism half is proven.
Benchmark harness (standalone, deliberately **not** wired into `simd-bridge/cpp/binding.cc` — that
file has a documented corruption/fragility history in this file's "Key Lessons" section, and
design.md's Non-Goals require this to stay isolated): `native/ace-radix-01/radix_bench.cu`, built
directly via `nvcc` (no CMake/node-gyp target). Fixture generator:
`scripts/atlas/ace-radix-01/fixture-v1.mjs` (deterministic mulberry32 PRNG,
`node scripts/atlas/ace-radix-01/fixture-v1.test.mjs` regression-proves byte-identical regeneration).

**GPU primitive ownership** (extends the GPU/CPU boundary section below):

| Primitive | Owns | Notes |
|---|---|---|
| CUB (radix sort/partition/compact) | BitFrost cache/tensor-materialization reorganization | Required oracle baseline for `ACE-RADIX-01`; determinism vs CPU `std::sort` is the pass condition |
| cuTile | Challenger only, gated behind CUB | Never introduced merely to have a custom kernel — must match CUB's exact output ordering to become eligible for production |
| cuBLASLt | Dense candidate scoring / batched projection linear algebra | Not ACE ranking |
| cuGraph | PageRank/PPR/Leiden/BFS/SSSP | Already the established parity-oracle pipeline (see NetworkX↔cuGraph correction above) — do not add a competing graph-algorithm owner |
| cuVS | ANN semantic search (exact + CAGRA) | Existing retrieval lane, unchanged by this proposal |
| ACE/BitFrost | Admission, residency, cache-tier promotion policy | Sole legitimate consumer of `ResidencySortKeyV1`/`PacketGlyphV1` |
| SOM | Experimental representation/routing only | Never retrieval truth — same non-canonical treatment as `projectionOrdinal`/`gpuNodeId` |

**New contracts (landed, code-live)**:
- `PacketGlyphV1` — compact ~16-byte-packed-logical struct per candidate packet
  (`projectionOrdinal`, `featureBits`, `lod`, `residency`, `pagerankQuantized`, `recency`,
  `somCell`, `flags`) for cheap GPU-local scans over large candidate sets (e.g. 100K candidates in
  ~1.6MB) before dereferencing an NES-style LOD ladder (LOD0 identity → LOD7 prompt-ready tokens).
  Never carries `packetKey`. `ResidencySortKeyV1` — GPU-local integer sort key (`tier`, `lod`,
  `utilityBucket`, `recencyBucket`, `projectionOrdinal`) used only inside BitFrost reorganization,
  never substitutes for canonical packet identity. Both in
  `sveltekit-frontend/src/lib/server/atlas/residency/packet-glyph-v1.ts`.
- `SomCoordinateV1` — experimental 3D SOM topology coordinate (`representationRevision`,
  `somRevision`, `x`, `y`, `z`, `quantizationError`). Representation-only; its only sanctioned use
  is measuring whether BMU-neighbor prefetch after a BitFrost cache hit improves locality/hit-rate
  — not visualization, not retrieval ranking. In
  `sveltekit-frontend/src/lib/server/atlas/residency/som-coordinate-v1.ts`.
- `PrefillReceiptV1` / `PrefillContentIdentityV1` (existing, in
  `sveltekit-frontend/src/lib/server/atlas/prefill/prefill-contracts-v1.ts`) gained 4 required
  fields at the QLoRA/ACE/BitFrost boundary: `acePolicyRevision`, `bitfrostRevision`,
  `residencyPlanChecksum`, `gpuExecutionIdentity`. QLoRA stays fully separate from ACE ranking — it
  only meets ACE/BitFrost downstream at this receipt, never inside residency/ranking logic. The
  `.strict()` schema extension was call-site-audited first (`rg` across `src/`, `scripts/`,
  `python/` — exactly one real call site found, in `prefill-contracts-v1.spec.ts`, updated
  alongside the schema).

**Proof gate before any production wiring — `ACE-RADIX-01`**: a frozen `PacketGlyphV1` fixture at
N ∈ {256, 1K, 4K, 16K, 64K}, comparing CPU `std::sort` baseline vs CUB radix (oracle) vs cuTile
(challenger). Pass/fail criterion is exact-ordering-match determinism only — latency, kernel time,
H2D/D2H bytes moved, cache-hit lift, and coalescing/materialization lift are recorded but
non-gating. **CUB-vs-CPU half is `DRY_RUN_PROVEN`** (see result above); cuTile half is
`ENVIRONMENT_BLOCKED` on this dev host. A future BitFrost integration change must cite a full
`ACE-RADIX-01` PASS (both halves) as a prerequisite, per this file's enforced status-language rules
(no "production-ready" from an unproven or partial benchmark).

**See**: `sveltekit-frontend/openspec/changes/parent-atlas-ace-radix-residency/` (proposal.md,
design.md, specs/, tasks.md — 25/26 tasks done, `openspec validate --strict` passes),
`docs/reports/ace-radix-01-results.json` (the live benchmark result).

### CUTILE-ACE-01 LEVEL 2 real result: both kernels exact-match their CPU oracles (2026-09-14)

`CUTILE-ACE-01`'s LEVEL 3 fused cuTile challenger was gated behind LEVEL 1 (`ACE-RADIX-01`'s CUB
oracle, already `DRY_RUN_PROVEN`) AND "LEVEL 2 simple custom CUDA glyph-score + residency-key-pack
kernels," which had never been built. `parent-atlas-cutile-ace-level2` built and proved both:

- **`GlyphScoreV1`** — a brand-new pure-integer scoring formula over `PacketGlyphV1` fields
  (`pagerankQuantized×4 + recency×3 + residency×257×2 + lod×257×1 + popcount(featureBits)×50 +
  popcount(flags)×50`), deliberately excluding `somCell` (never retrieval truth) and
  `projectionOrdinal` (non-canonical GPU-local coordinate) as scoring inputs. No prior formula
  existed anywhere in this repo for this — verified via `rg` before designing it. CPU oracle:
  `scripts/atlas/ace-radix-01/glyph-score-v1.mjs` (8 unit tests, all passing, including a
  hand-computed spot check and both field-exclusion isolation tests).
- **`ResidencySortKeyV1` GPU packing** — not a new formula: computes the SAME
  `(tier<<56)|(lod<<48)|(utilityBucket<<40)|(recencyBucket<<32)|projectionOrdinal` packing
  `scripts/atlas/ace-radix-01/fixture-v1.mjs` already computes on CPU for `ACE-RADIX-01`'s
  fixtures, just from raw glyph fields on GPU instead of pre-packed input.

**Result: `DRY_RUN_PROVEN`** — both kernels (`native/cutile-ace-level2/glyph_kernels_bench.cu`)
exactly matched their CPU oracles at all 3 tested fixture sizes (256, 1000, 4000), real runs on
this host's RTX 3060 Ti, CUDA 13.0, sm_86: `docs/reports/cutile-ace-level2-results.json`. **LEVEL 1
+ LEVEL 2 are both now proven** (`cutile_ace_01_level3_unblocked: true` in that report), but LEVEL
3 itself was NOT attempted — it still requires a CUDA 13.2+ host with a real cuTile programming API
(`ACE-RADIX-01`'s own prior finding: this dev host's native Windows CUDA 13.0 toolkit only ships a
compiler-intrinsic stub, `crt/cuda_tile.h`). "Unblocked" means the prerequisite proofs are done, not
that LEVEL 3 has been run or would necessarily pass — do not cite this as LEVEL 3 being complete.

**See**: `sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-cutile-ace-level2/`
(proposal.md, design.md, specs/, tasks.md), `docs/reports/cutile-ace-level2-results.json`,
`native/cutile-ace-level2/glyph_kernels_bench.cu`,
`scripts/atlas/ace-radix-01/glyph-score-v1.mjs`.

### CUTILE-ACE-01 LEVEL 3 real result: DRY_RUN_PROVEN via the Python cuda.tile API, after a genuine C++ toolchain dead end (2026-09-14, same day)

LEVEL 3 (the fused cuTile challenger) WAS attempted this same day, in two stages, both worth
knowing about — a real dead end, then a real pass.

**Stage 1 — C++ `cuda_tile.h` attempt: `BLOCKED_TOOLCHAIN_VERSION_SKEW`, not attempted-and-passed.**
WSL2's `atlas-rapids-cu13` conda env genuinely ships a real 4064-line `cuda::tiles` C++20 API
(confirmed live, not a stub) — but that alone does not mean WSL2 can compile cuTile device code.
The fused kernel (`native/cutile-ace-level3/glyph_fused_tile.cu`) compiles with **zero C++ frontend
errors** after finding and fixing 6 real API-usage errors via actual compiler diagnostics
(`__tile_global__` vs `__global__`, `cuda::tiles::bid()` vs `blockIdx`, no `popcount` builtin,
tile-code cannot call plain `__device__`/`__host__` helper functions, `constexpr` vs `__device__
__constant__`) — but device-code generation is blocked by a genuine cross-version toolchain skew:
the only `tileiras` Tile-IR backend compiler anywhere on this WSL2 filesystem is CUDA 13.2 (from
the separate `atlas-cutile-cu132` pip venv), while the header/frontend is CUDA 13.3. Root-caused
past a simple CLI-flag mismatch (`-arch=sm_86` vs the correct `--gpu-name=sm_86`) all the way to
the `.tilebc` intermediate bytecode itself: CUDA 13.3's `cicc` encodes the target architecture in a
form ("86") that CUDA 13.2's `tileiras` rejects outright, even though `sm_86` is confirmed present
in that `tileiras`' own embedded architecture table. Full trail:
`docs/reports/cutile-ace-level3-attempt-v1.json`,
`sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-cutile-ace-level3/`.

**Stage 2 — Python `cuda.tile` API: `DRY_RUN_PROVEN`.** Before attempting to install a
matched-version `tileiras`, checked whether `atlas-cutile-cu132`'s venv already had a coherent
alternative — it does: a real, documented Python package (`cuda_tile==1.5.0`, decorator-based
`@ct.kernel`/`ct.launch` API, `help()`-documented unlike the C++ header). **Correction (same-day
external review, applied precisely — this is a distinct programming model, not merely a different
frontend to the same one)**: `cuda.tile` is the **CUDA Tile programming model**; LEVEL 2's
`glyph_kernels_bench.cu` is the **SIMT programming model**. NVIDIA treats these as distinct
execution spaces — Tile kernels expose block/tile-level parallelism and deliberately hide
individual threads, and intra-kernel SIMT/Tile mixing is not the model (they can consume the same
buffers and implement the same semantic contract across separate kernels, which is exactly what
LEVEL 2 and LEVEL 3 do here). `ct.mma()`/`ct.mma_scaled()` are real Tile matrix operations, but
their existence does not make a Tile kernel "SIMT-aware" — that framing was wrong and is retracted.
What the evidence actually supports: the `atlas-cutile-cu132` venv has `cuda.tile==1.5.0` with a
**matching TileIR backend available**, giving a coherent Python Tile toolchain with sm_86 runtime
execution proven — not a claim about `nvcc` being the Python frontend's compiler (cuTile Python has
its own Python→Tile compilation pipeline; `tileiras` can be supplied directly in that environment).
A minimal elementwise-add smoke test passed first (`torch.allclose`, exact), then the real fused
kernel (`native/cutile-ace-level3/glyph_fused_tile.py`) was ported and verified:

- **Result: `DRY_RUN_PROVEN`** — exact match against the same CPU oracle at all 3 tested fixture
  sizes (256, 1000, 4000), real execution on this host's RTX 3060 Ti (sm_86/Ampere), via PyTorch
  2.14.0+cu132 tensors as device buffers. `docs/reports/cutile-ace-level3-results.json`.
- 3 more real API errors found and fixed while porting: `ct.bid(0)` takes an explicit axis (not a
  C++-style `uint3.x`); `ct.store(array, index, tile)`'s positional argument order differs from a
  naive guess; and `ct.floordiv` on `uint32` tiles hits a genuine backend codegen limitation
  (`rounding mode 'negative_inf' is not allowed with 'unsigned' flag`) — worked around by dividing
  as signed `int32` then casting back to `uint64`; range-proven safe (not merely "non-negative") by
  `CUTILE-ACE-BOUNDARY-01` below, since the real field width is `uint16` (max 65535), far below
  `INT32_MAX`.
- **This supersedes the C++ attempt for the LEVEL 3 *gate*, but does not retract or invalidate its
  finding, and is not "the same implementation via a different language."** The
  CUDA-13.3-header/CUDA-13.2-`tileiras` skew in the C++ path is real and still unfixed. The Python
  Tile kernel is a distinct, independently-proven implementation of the same semantic contract.
- **Not claimed**: any fusion *performance* benefit (fewer kernel launches, less memory traffic,
  lower latency) versus LEVEL 2's two separate SIMT kernels — only fusion *correctness* was
  measured (see `CUTILE-ACE-PERF-01` as a distinct, optional, not-yet-attempted follow-up below).
  All 3 GPU-primitive levels (CUB oracle, SIMT, Tile) are now `DRY_RUN_PROVEN` for this
  capability — the first time this proving-ground has completed its full LEVEL 1→2→3 ladder.

**See**: `sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-cutile-ace-level3/`
(the blocked C++ attempt), `sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-cutile-ace-level3-python/`
(the successful Python attempt), `docs/reports/cutile-ace-level3-attempt-v1.json`,
`docs/reports/cutile-ace-level3-results.json`, `native/cutile-ace-level3/glyph_fused_tile.cu`,
`native/cutile-ace-level3/glyph_fused_tile.py`.

**CUTILE-ACE-BOUNDARY-01 follow-up (same day) — closed the one real gap in the above: the
signed-division workaround's safety was asserted, not proven.** External review correctly flagged
that `glyph_fused_tile.py`'s `ct.floordiv(ct.astype(pagerank_t, ct.int32), 257)` workaround (for a
real `cuda.tile` backend limitation rejecting unsigned floor-division) was justified only by "all
operands here are non-negative" — true but incomplete, since a non-negative `uint32` can still
exceed `INT32_MAX` and wrap when cast to `int32`. Built an explicit 26-glyph boundary fixture
(`scripts/atlas/ace-radix-01/boundary-fixture-v1.mjs` — `pagerankQuantized`/`recency` swept through
{0, 1, 256, 257, 258, 65535}, `featureBits`/`flags` bit-pattern extremes, `lod`/`residency`
`uint8` bounds, `projectionOrdinal` `uint32` bounds, plus dedicated all-zero and all-max glyphs) and
ran it through all 3 lanes — CPU oracle, LEVEL 2 CUDA C++, LEVEL 3 Python `cuda.tile` — **all exact
match at every row**. The real field contract, established directly from `fixture-v1.mjs`'s own
docstring and `PackedGlyphInputV1`'s `uint16_t` declaration: both fields are `uint16` (max 65535),
roughly 32,767× smaller than `INT32_MAX` — the cast can never overflow for any value either field
may legally hold. This also closes the separately-recorded "CUDA boundary-value tests not pursued"
gap for LEVEL 2, which previously only had seeded-random coverage. Result:
`docs/reports/cutile-ace-boundary-01-results.json`.

**Frozen capability-ladder status for this glyph-scoring/residency-key-packing capability**
(supersedes any earlier "LEVEL 3 not attempted" framing, and — per the same external review that
caught the SIMT-aware/nvcc-frontend wording issues above — is named by **programming model**, not
by implementation language, since the C++ attempt was never a peer LEVEL 3, only an alternate
frontend to the same Tile level):

```
GPU-PRIMITIVE LEVEL LADDER (atlas-glyph-score-v1 / atlas-residency-key-pack-gpu)

LEVEL 1 — ORACLE           CPU/CUB, semantic reference                          PROVEN
LEVEL 2 — SIMT              CUDA C++, separate GlyphScore + ResidencySortKey     DRY_RUN_PROVEN
                             kernels, boundary-value coverage included
LEVEL 3 — TILE               Python cuda.tile, FUSED GlyphScore +                DRY_RUN_PROVEN
                             ResidencySortKey kernel, boundary-value coverage
                             included, signed-division workaround range-proven
LEVEL 3 C++ IMPLEMENTATION  optional alternate frontend (cuda_tile.h)           PROVEN_BLOCKED
                             (BLOCKED_TOOLCHAIN_VERSION_SKEW) — not required
                             for LEVEL 3 semantic completion, deliberately not
                             reopened; re-audit only if a CUDA-13.3-matched
                             `tileiras` becomes available in this environment
```

Exact-match evidence for LEVEL 3: score parity and residency-key parity, N = 256/1000/4000 plus a
26-row boundary fixture (all-zero glyph, all-max glyph, per-field extremes), sm_86 RTX 3060 Ti.

**Not yet attempted, deliberately separate from the above (optional)**: `CUTILE-ACE-PERF-01` — a
LEVEL 2 (two SIMT kernels) vs LEVEL 3 (one fused Tile kernel) performance comparison (kernel-only
latency, end-to-end latency, launch count, H2D/D2H bytes, peak VRAM, throughput, warm vs cold). The
ladder above proves semantic equivalence across CPU → SIMT → Tile with zero required performance
outcome — a slower-but-correct LEVEL 3 result would still be a valid, useful result if this gate is
ever run.

**See**: `sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-cutile-ace-boundary-01/`,
`docs/reports/cutile-ace-boundary-01-results.json`,
`scripts/atlas/ace-radix-01/boundary-fixture-v1.mjs`.

### BITFROST-L2-01 real result: v1 methodology was wrong (found via web research), v2 corrected but still inconclusive on this host, plus a real cudaMemGetInfo/nvidia-smi discrepancy (2026-09-14)

`BITFROST-L2-01` (`parent-atlas-gpu-mini-fabric-01` section 10, gated on `AtlasAceResidencyV1`'s
logical policy being proven — closed by `parent-atlas-bitfrost-sim-01`) benchmarked
`cudaAccessPropertyPersisting` L2 set-aside for a HOT-tier buffer on this dev host's RTX 3060 Ti,
Windows-native CUDA 13.0 toolkit (same environment `ACE-RADIX-01`'s CUB oracle used — kept
separate from the WSL2 `atlas-rapids-cu13` RAPIDS environment, per this file's own "keep the three
environments separate" rule).

**v1 (superseded, methodology was wrong)**: measured a small persisting buffer in complete
isolation — no competing memory traffic ever pressured it out of L2, so there was nothing for the
persistence hint to protect against. `RESULT: DRY_RUN_PROVEN` across 3 runs, but lift was
**consistently negative** (-4.95%, -3.44%, -1.29%). **Root cause found via web research (NVIDIA's
own L2-cache-control docs + Lei Mao's independent "CUDA L2 Persistent Cache" benchmark, RTX 3090)**:
a real benefit only shows up with a **two-buffer design** — the small persisting buffer is
repeatedly re-accessed via modulo indexing WHILE a much larger "streaming" buffer is also touched
every kernel launch, creating genuine L2 eviction pressure (Lei Mao's reference: 3MB persistent +
3MB L2 set-aside + 1024MB streaming → ~20% speedup, 3.071ms→2.443ms, on an isolated GPU).

**v2 (corrected methodology, real 7-run variance study)**: `native/bitfrost-l2-01/l2_persist_bench.cu`
rewritten with a `streamingReadPersistKernel` implementing that two-buffer pattern. Since
`cudaMemGetInfo` cannot be trusted on this host (see below), the streaming buffer size is computed
by `scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs` from a REAL `nvidia-smi` reading (30% of
free-minus-margin, floor 4 MiB, ceiling 64 MiB), not by the `.cu` binary's own `cudaMemGetInfo`
call. Ran 7 times across this session under naturally fluctuating live contention (`nvidia-smi`
free VRAM 138-399MiB, `llama-server.exe` running throughout, streaming buffers auto-sized 11-50MiB
per run): lift = **+2.05%, +0.07%, -5.09%, +8.98%, -7.07%, +7.09%, -11.34%** — mean **-0.76%**, min
**-11.34%**, max **+8.98%**, no correlation between sign/magnitude and streaming-buffer size.
**Conclusion: no measurable net benefit or harm on this host, at this scale** — real GPU
scheduling/contention noise (±5-11% swings) dominates whatever effect the mechanism might have at
this scale; this is a genuine noise-dominated null result from 7 real samples, not an
under-sampled fluke. This is a real, explained limitation: this shared 8GB card's live VRAM budget
does not currently allow reproducing Lei Mao's 1024MiB streaming-buffer scale (the reference setup
that showed a clean ~20% speedup on an isolated, dedicated GPU), so the eviction pressure these
runs could safely generate is far smaller than what demonstrated the effect elsewhere. **Do not
cite either v1 or v2 as "L2 persistence doesn't work"** — v1's negative result was a methodology
artifact (nothing to measure); v2's null result is real but scale-limited by this host's
contention, not a demonstration that the mechanism itself is ineffective.

**Separate, more broadly-relevant finding — root-caused against primary Microsoft documentation
(2026-09-14, not left as inference)**: `cudaMemGetInfo()` inside the CUDA process reported
**~6.68GB free VRAM** in v1, while `nvidia-smi.exe` (queried immediately before/after, outside the
CUDA process) reported only **~140-400MB free** — reproduced across all 10 runs so far (3 v1 + 7
v2), not a one-off fluke. Two mechanisms found via web research, of different magnitude: (1) an
NVIDIA-forum-confirmed CUDA-context-overhead effect (`cudaMemGetInfo` reports free memory AFTER
context creation, `nvidia-smi`/`nvmlDeviceGetMemoryInfo` BEFORE) — real, but only tens-to-hundreds
of MB, far too small to explain a ~6GB gap; (2) the actual primary mechanism, confirmed directly
against **Microsoft's own WDDM 2.0 documentation** (`learn.microsoft.com/.../gpu-virtual-memory-in-
wddm-2-0`, `IDXGIAdapter3::QueryVideoMemoryInfo`): WDDM assigns each process an OS-controlled
**`Budget`** that the process "should target," and Microsoft's own docs state this budget
"represents total available memory (dedicated + shared)" — i.e. it legitimately includes capacity
the OS plans to make available via oversubscription/shared-system-memory paging, not a strict
physically-free-right-now figure. `cudaMemGetInfo` on Windows derives its "free" figure from this
WDDM `Budget` concept; `nvidia-smi` reports direct per-process physical VRAM usage. **This means
any future CUDA work on this host that sizes allocations from `cudaMemGetInfo` alone is not
getting a true safety guarantee** — it happened to be harmless in every run so far (no crash,
`llama-server.exe` verified undisturbed every time), but a ~20x-optimistic free-memory figure could
in principle let a much larger, unsafe allocation through. **Rule for future GPU work on this
host**: when a real go/no-go VRAM decision matters, query `nvidia-smi` directly (outside the CUDA
process, e.g. via a wrapper script) rather than trusting `cudaMemGetInfo` alone — see
`scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs` for the pattern (computes the actual
allocation size from `nvidia-smi`, records both figures side-by-side in the result JSON).

**See**: `sveltekit-frontend/openspec/changes/archive/2026-09-14-parent-atlas-bitfrost-l2-01/`
(proposal.md, design.md, specs/, tasks.md), `docs/reports/bitfrost-l2-01-results.json`,
`native/bitfrost-l2-01/l2_persist_bench.cu`.

### DEPENDENCY-CAPABILITY-GUARD-01 — no install without a proven capability gap (2026-09-03)

**Invariant: `NO_NEW_CAPABILITY_OWNER_WITHOUT_PROVEN_GAP`.** Never run `pip install`, `conda install`,
`docker pull`/`build`, or `npm install` merely because a library *could* help. Resolve the
capability against `docs/reports/runtime-capability-registry-v1.json` first:

```
NEED
  ↓
Is capability already proven somewhere? ──YES──→ reuse that owner
  ↓ NO
Is capability available in an existing runtime, no install? ──YES──→ wire it
  ↓ NO
Is a new dependency actually required? ──YES──→ smallest package only ──NO──→ stop
```

Before any dependency mutation, record: `CAPABILITY`, `CURRENT_OWNER`, `CURRENT_RUNTIME`,
`AVAILABLE`, `REUSE_PATH_PROVEN`, `CALLER_RUNTIME`, `TRANSPORT_BOUNDARY`, `ABI_COMPATIBLE`,
`LATENCY_ACCEPTABLE`, `ISOLATION_COMPATIBLE`, `FAILURE_DOMAIN_COMPATIBLE`, `VERSION`,
`LIVE_PROOF`, `WHY_CURRENT_OWNER_CANNOT_SATISFY_CALLER`, `MINIMAL_NEW_DEPENDENCY`, and
`NEW_OWNER_JUSTIFICATION`. `AVAILABLE=true` prohibits a new install/owner only when the
proven reuse path satisfies the caller contract. A pinned environment rebuild is distinct
from adding a capability or owner and still requires package/image identity plus replay proof.

**Real incident this rule prevents (found 2026-09-03, not fixed yet — flagged in the registry)**:
`docker/atlas-gpu-8098/Dockerfile` builds `FROM rapidsai/base:26.08-cuda12-py3.13-amd64` — a
broad/full prebuilt RAPIDS environment
— but `services/atlas-gpu-8098/app.py` and `python/atlas_rapids_graph_runtime.py` (verified via
`grep '^import|^from'`) only ever import `cudf` and `cugraph` (both lazily), plus
`fastapi`/`pydantic`/`pyarrow` for the HTTP boundary. The actual capability need was
`graph.jaccard.gpu` — already proven live on `wsl::atlas-rapids-cu13` (cuVS/cuGraph/cuDF/CuPy/
PyTorch 26.06.x, RTX 3060 Ti, see GPU-MINI-FABRIC-01 above) — but a second, heavier Docker RAPIDS
image got built anyway rather than first asking which runtime already owns the capability. RAPIDS'
own docs recommend a custom image with only the needed libraries for exactly this reason.

**Prohibited without an explicit, recorded capability gap**: installing optional libraries to
satisfy a health check; installing a whole framework for one primitive; creating a second runtime
owner for a capability another runtime already proves live; upgrading a working runtime merely to
version-match another (capability parity, not version symmetry, is the bar — this repo already had
this rule for `atlas-rapids-cu13` specifically under GPU-MINI-FABRIC-01; this section generalizes
it to every dependency, not just that one environment). Applies beyond RAPIDS: TensorRT, PyTorch,
Triton, cuTile, CUTLASS, ONNX Runtime, NetworkX, Neo4j, Qdrant, Valkey — one task should never
silently create a second owner for a capability that already has one.

**Layer discipline (do not conflate)**: CUDA (the toolkit/runtime) ≠ cuTile (the Python DSL for the
tile programming model) ≠ SIMT (the existing thread/warp execution model cuGraph/cuDF/CuPy kernels
already use — tile programming coexists with it per-kernel, it does not replace it) ≠ Tensor Cores
(hardware units, 3rd-gen on this RTX 3060 Ti / Ampere sm_86, useful for GEMM/attention/dense linear
algebra — not a general accelerator for irregular graph work like Jaccard/BFS/connected
components). cuTile stays `AVAILABLE_FUTURE_CHALLENGER`; Ampere execution requires an
Ampere-capable TileIR compiler/toolchain from the CUDA 13.2-generation line. This does not by
itself require upgrading the system-wide CUDA toolkit; the isolated Python environment may
provide the compiler components. Install remains blocked until `ACE-RADIX-01` proves a real
cuTile half (this dev host's CUDA 13.0 toolkit only ships a compiler-intrinsic stub).

**See**: `docs/reports/runtime-capability-registry-v1.json` (the registry — `wsl::atlas-rapids-cu13`
and `docker::atlas-gpu-8098` entries, per-capability owner map, the atlas-gpu-8098 over-install
finding and its minimal-rebuild target, prohibited-duplicate-owner list).

### CUDA 13.x multi-lane strategy: TensorRT-RTX 1.6 / CUDA 13.4 — DIRECTION ONLY, not started (2026-09-27)

**Stated plan, nothing installed yet — verified live on this host**: only CUDA `v12.8`/`v13.0` exist
under `NVIDIA GPU Computing Toolkit/CUDA/`, `CUDA_PATH` still points at `v13.0`, and no
TensorRT-RTX installation was found anywhere on disk. The proven native lane (RTX 3060 Ti/sm_86,
CUDA 13.0, LibTorch `2.9.0+cu130`, `tensorrt_bridge.node`) is untouched.

**Rule**: TensorRT-RTX 1.6 (NVIDIA's separate CUDA-13.4-packaged SDK) must land as a **side-by-side
challenger lane**, never an in-place replacement of the proven CUDA 13.0 lane — do not uninstall
13.0, do not repoint the existing CMake preset's `CUDA_PATH`/`LIBTORCH_ROOT` at 13.4. LibTorch
`cu130` and TensorRT-RTX's `cuda-13.4` package are separate binary/toolchain boundaries; TensorRT-RTX
engines/runtime caches are version-sensitive (tied to GPU SKU, TensorRT-RTX version, CiG state,
driver) and not forward-compatible across TensorRT-RTX runtime versions — a fresh runtime cache
must be built per lane, never reused as proof the other configuration works. The 3060 Ti (Turing+)
is architecturally fine for TensorRT-RTX; the GPU is not the blocker.

**Planned layering** (mirrors this file's existing GPU LEVEL-ladder discipline — challenger proven
independently before promotion, never silently replacing the working lane):

```
Native LibTorch lane (KEEP, unchanged)      TensorRT-RTX 1.6 lane (PROVE independently)
  CUDA 13.0                                   CUDA 13.4
  LibTorch cu130                              TensorRT-RTX 1.6 cuda-13.4 package
  existing N-API addon / CMake preset         separate CMake preset + env selection
                                               new engine/runtime cache
```

**Required gate before any promotion — `TRT-RTX-1.6-CUDA134-01`** (all must PASS, plus the existing
CUDA 13.0 + LibTorch cu130 lane must still build and pass independently, unchanged):
nvcc reports 13.4; RTX 3060 Ti sm_86 compile succeeds; TensorRT-RTX 1.6 DLL loads; a trivial engine
build succeeds; inference succeeds; a *fresh* runtime cache succeeds (no reused cache as evidence);
Node native bridge loads with no napi/CUDA DLL resolution conflicts; output parity vs. the current
reference path; latency and VRAM measured.

**Cross-stack correction (2026-09-27, same day) — CUDA 13.4 is NOT a universal target.** A follow-up
operator brief proposed a fuller per-stack picture; the two most consequential claims were verified
live via WebSearch before being recorded here (one of them needed a correction):

| Stack | Verified current state | Target for this repo |
|---|---|---|
| **PyTorch/LibTorch** | Confirmed live: PyTorch is removing CUDA 13.0 from its nightly build matrix starting the week of 2026-09-28; **13.2 is becoming stable/default**, **13.4 stays prototype/nightly** (PyTorch 2.14 RFC promotes 13.2 to default PyPI). Confirmed live (2026-09-27) the actual C++ archive exists, not just the Python wheel — `download.pytorch.org/libtorch/cu132/` lists real `libtorch-win-shared-with-deps-{2.12.0,2.12.1,2.13.0,2.14.0}+cu132.zip` (plus a `2.12.0` debug variant). Also confirmed: `developer.nvidia.com/cuda-13-2-2-download-archive` (CUDA Toolkit 13.2 **Update 2**) is a real, Windows-supported download page — the specific patch that fixes the 12.8-13.2.1 compiler bug (see correction below). | Migrate the native LibTorch lane **13.0 → cu132 LibTorch zip + CUDA Toolkit 13.2.2 (Update 2)** — not 13.4, and not bare "13.2" (13.2.0/13.2.1 still carry the bug). **Two separate installs needed for this repo specifically**: the LibTorch zip alone bundles its own CUDA runtime libs (cudart/cublas/etc.) and would be sufficient for a pure-LibTorch consumer, but `simd-bridge/cpp/CMakeLists.txt` also calls `find_package(CUDAToolkit)` and compiles `.cu` files directly via `nvcc` for the `cuda_kernels` static lib — that needs an actual CUDA Toolkit 13.2.2 install on the host, `LIBTORCH_ROOT` and `CUDA_PATH` repointed together, same side-by-side discipline as the TensorRT-RTX lane. |
| **RAPIDS/cuVS/cuGraph** | Confirmed live: RAPIDS 26.08 officially supports `cuda-version>=13.0,<=13.3` — **13.4 is out of range**, not yet supported. | Keep `atlas-rapids-cu13` (WSL2, per GPU-MINI-FABRIC-01 above) on 13.0-13.3; do **not** move it to 13.4. |
| **cuTile** | **Checked against two primary sources (2026-09-27) and NOT confirmed — do not cite these claims.** CUDA Toolkit 13.4's own release notes list the "CUDA Tile" and "CUDA Tile IR" sections as **"None"** (no new features for 13.4). The official cuTile Python release-notes page (`docs.nvidia.com/cuda/cutile-python/release_notes.html`) lists only **version 1.0.0** (2025-12-02, "Initial release") — no 1.6 entry exists there. None of the specific features the brief cited (programmatic dependent launch, `ct.insert()`, unchecked memory access option, portable TileIR bytecode export, JAX interop, etc.) appear in either source. Treat "cuTile 1.6 adds CUDA-13.4 features" as unconfirmed/likely inaccurate until a real source is found — GPU-MINI-FABRIC-01 above's "stable on Ampere/sm_86 from CUDA 13.2" remains the only verified cuTile fact in this file. | No independent 13.4 justification currently stands for cuTile — the only confirmed reason for a 13.4 lane in this repo remains TensorRT-RTX. |
| **TensorRT-RTX** | As established above — 1.6 adds CUDA 13.4 support, sm_86 in range. | The one lane that actually *needs* 13.4 right now. |

**Correction to the brief's own claim**: it cited a PyTorch-disclosed compiler bug (nested thread
divergence / incorrect reconvergence) as affecting "CUDA versions 12.8 through 13.0, fixed in
13.2.2" — verified live via WebSearch against NVIDIA's own 13.2 Update 2 release notes: the bug's
actual affected range is **12.8 through 13.2.1** (not just through 13.0), fixed in **13.2.2**. This
matters because it means CUDA 13.2 alone (without the .2 update) still carries the bug — the
correct migration target is specifically **13.2.2 or later**, not merely "13.2."

**Revised lane layout** (supersedes the two-lane framing above — now three purposes, still all
side-by-side, still nothing installed):

```
Windows native                          WSL2
---------------                         ----
CUDA 13.0 (current, KEEP for now —      atlas-rapids-cu13 (existing, per
  known compiler bug 12.8-13.2.1;         GPU-MINI-FABRIC-01): CUDA 13.0-13.3,
  LibTorch cu130 unaffected by that        RAPIDS 26.08, cuVS/cuGraph/cuML —
  specific bug class per the brief,        do NOT move to 13.4
  but still the eventual migration
  source, not destination)
                                         atlas-cutile-cu132 (existing, per
CUDA 13.2.2+ (FUTURE migration            GPU-MINI-FABRIC-01): unchanged
  target for LibTorch — confirmed
  real artifacts exist: CUDA Toolkit    A future atlas-cutile-cu134 or
  13.2.2 Update 2 installer (developer.  atlas-torch-cu132 WSL env is a
  nvidia.com) + libtorch-win-shared-     DIRECTION only if Windows-native
  with-deps-2.14.0+cu132.zip (download.  13.2.2/13.4 lanes prove insufficient
  pytorch.org/libtorch/cu132/). BOTH     for a given experiment — not
  installs needed for this repo (LibTorch
  zip alone bundles its own CUDA
  runtime, but tensorrt_bridge.node's
  own nvcc/CUDAToolkit calls need the
  Toolkit installed separately). Not yet
  started; requires its own proof pass
  before promotion, same discipline as
  every other lane in this file.
CUDA 13.4 (challenger — TensorRT-RTX      started here.
  1.6 only; the cuTile-1.6-on-13.4
  justification checked out negative,
  see the table above — no cuTile
  work belongs on this lane yet)
```

**Hard rule reaffirmed**: no stack in this repo moves to 13.4 as its canonical/production version
right now. TensorRT-RTX is the only confirmed 13.4 consumer. LibTorch's real migration target is
13.2.2+, not 13.4. RAPIDS stays on its already-current 13.0-13.3 range. Each of these is a
separate, independently-gated proof lane per `DEPENDENCY-CAPABILITY-GUARD-01` above — do not
collapse them into one "upgrade to 13.4" action.

**Not done in this pass**: no CMake preset, env scaffolding, or install was created — operator
explicitly deferred to a documentation-only step. CUDA 13.4 and TensorRT-RTX 1.6 installers are
NVIDIA-site/license-gated downloads; a future session should not attempt to fetch/run them without
the operator supplying the installer path first.

**Reference docs fetched 2026-09-27**: `docs/.okf/tensorRTX7_26/` — overview, 1.6 release notes,
Windows prerequisites, and SDK-zip Windows install steps, all mirrored from the live NVIDIA docs
via `WebFetch` (see that folder's `README.md` for a fidelity caveat — one fetch produced a clearly
wrong release date, flagged there, not treated as fact). Confirms: CUDA 13.4 support in 1.6,
Ampere/sm_86 in the supported architecture range, WDDM-only on Windows, and the tightened
runtime-cache compatibility rule already captured above.

### LIBTORCH-DEPENDENCY-CENSUS-01 — real caller census (2026-09-27, read-only, source/caller only)

**Purpose**: an operator brief proposed that LibTorch may be an `ARCHITECTURALLY_REPLACEABLE`
convenience backend (a handful of tensor ops), not an irreplaceable architectural owner, and
proposed a census gate (`rg 'torch::|#include <torch' simd-bridge/cpp` + per-function caller/
replacement/blocker) before considering any removal. Ran that exact command and traced every
result to its real TS-side production caller (not just the first bridge file), which the brief's
own proposed command wouldn't distinguish on its own. **Parity tests, latency, and VRAM
measurement were NOT run in this pass — this is source/caller mapping only**, per this file's
Status Language discipline (`NOT_PROVEN` until measured).

`rg 'torch::' simd-bridge/cpp` hits exactly 3 files: `pytorch_graph.cc` (10 exported ops),
`pytorch_graph_fp16.cc` (3 fp16 variants), `libtorch_graph_impl.cpp` (6 ops + 2 diagnostics).
`pytorch-graph.ts` and `libtorch-bridge.ts` are themselves thin N-API bridges (confirmed via their
own docstrings), not production callers — excluded from the "real caller" column below; only
callers of those bridges count.

**CORRECTED same-day (2026-09-27) — the first pass's "5 zero-caller" claim was wrong, not a real
finding.** That grep only matched `.fnName(` method-call style (`grep "\.${fn}("`), which misses
(a) plain identifier calls after a destructured import (`clusterEmbeddings(args)`, no leading dot)
and (b) direct `addon.fnName(...)` calls in repo-root `scripts/atlas/*.mjs`/`.mts` pipeline
scripts, which live outside `sveltekit-frontend/src` and were never in scope for that grep's search
root. A broader `Grep` (bare identifier, whole repo, `*.{ts,js,mjs,mts}`) found real, direct call
sites for **all 5** — no dynamic/string-keyed dispatch needed to explain any of them, they were
simply missed by too-narrow a search. Table below corrected accordingly.

| Exported API | Op (LibTorch call) | Real production caller(s) | Possible replacement | Removal blocker |
|---|---|---|---|---|
| `pageRankGPU` | `torch::mm` power iteration | `/api/codebase-index/gpu-pipeline`, `master-feature-map.ts`, `route-feature-map.ts` | cuBLASLt SGEMM directly | Low — this GPU PageRank path is arguably already superseded by the canonical NetworkX/cuGraph pipeline (see "NetworkX vs. Neo4j" section above); may be a removal candidate outright, not just a replacement candidate |
| `attentionScoreGPU` | `torch::mm` + softmax | `libtorch-reranker.ts` → `attention-head-ranker.ts`, `hyperrag-fusion-service.ts`; `karpathy-blend.ts` → 5 files incl. `/api/metrics/retrieval` | cuBLASLt GEMM + custom softmax kernel | Medium — `hyperrag-fusion-service.ts` looks live; Karpathy blend is separately marked LEGACY/REFERENCE ONLY elsewhere in this file (lower priority) |
| `rewardScoreGPU` | cosine similarity (GRPO reward) | `gpu-pipeline.ts` (2 real routes) | cuBLASLt dot-product/GEMM | Low — GRPO/RL work is `Deferred` per multiple sections of this file |
| `softmaxGPU` | numerically-stable softmax | `gpu-pipeline.ts` | trivial custom kernel or CPU (small n) | None found |
| `topKIndicesGPU` | `torch::topk` | `gpu-pipeline.ts` | **CUB `DeviceRadixSort`/top-k** — already `DRY_RUN_PROVEN` in this repo (`ACE-RADIX-01`, see GPU-MINI-FABRIC-01 above) | None — this is the most concrete near-term replacement; the CUB oracle already exists and is proven |
| `kmeansWithCentroids` | `torch::cdist` k-means | `som-clustering.ts` → 5 admin routes; `kmeans-cluster.ts` → `rg-atlas/run.ts` | RAPIDS cuML KMeans (`atlas-rapids-cu13` WSL2 env already exists) | Medium — cross-process boundary (WSL2 vs. native Windows Node), needs an RPC hop, not a drop-in swap |
| `trainSOM` | `torch::cdist` SOM training | **Real**: `scripts/atlas/dir-pipeline.mjs:274`, `scripts/atlas/gemma4-semantic-embedding-cache.mts:204` (call itself buggy — see LibTorch-adjacent script-alignment note below), `scripts/atlas/gpu-full-pipeline.mjs:263` — direct `addon.trainSOM(...)` calls, repo-root pipeline scripts outside `sveltekit-frontend/src` | N/A yet — live, not a removal candidate | None currently — genuinely used by 3 pipeline scripts |
| `autoencoderEncodeGPU`/`autoencoderDecodeGPU` | `tanh(mm)` | `autoencoder-bridge.ts` → `autoencoder-cuvs-bridge.ts`; `topology-projection.ts` → 2 API routes + `encode-768-to-64.ts` | cuBLASLt GEMM (it's one linear layer + tanh — trivially cheap to replace) | Low-technical, but this file's own "Why autoencoder is bypassed" note already flags the underlying weights as untrained/Xavier-random — any replacement needs numeric parity against that (already weak) baseline, not against a good result |
| `pcaProjectGPU` | `torch::mm` | `autoencoder-bridge.ts`, `topology-projection.ts` | cuBLASLt GEMM (PCA projection is one matmul) | None found |
| `graphSimilarity`/`graphSimilarityHalf`/`batchCosineSimilarity`(`_fp16`) | cosine similarity | `batch-rerank-orchestrator.ts` → `cuda-graph-caching-bridge.ts`; `prefilter.shadow.ts` → `discover-clusters.ts`, `encoded-cluster-prefilter.ts` | cuVS exact-KNN (already `PASS` in `SEMANTIC-EXACT-PARITY-01`, GPU-MINI-FABRIC-01 above) | Medium — same WSL2/native-process boundary as `kmeansWithCentroids` |
| `clusterEmbeddings` | k-means (older API) | **Real**: `/api/codebase-index/cluster-assign/+server.ts` (live API route), `/api/codebase-index/cluster-detect/+server.ts`, `/api/codebase/analyze/+server.ts`, `scripts/atlas/phase-1b-gpu-kmeans-som.mjs` (this one's own `addon` is hardcoded `null` — deliberate CPU-only demo mode, not a real GPU call), `gpu-graph-analysis.ts`, `codebase-cluster-detection.ts` | N/A — live, backing production API routes | None — not a removal candidate |
| `computeCaseEmbedding` | weighted embedding sum | **Real**: `/api/gpu/compute/+server.ts` (live API route), `sveltekit-frontend/scripts/atlas/prototype_feature_extract.mjs:23` | N/A — live, backing a production API route | None — not a removal candidate |
| `attentionScoreGPU_fp16`/`rewardScoreGPU_fp16` | fp16 variants | **Real**: `scripts/atlas/karpathy-gpu-enrich.mjs:59` + its duplicate `scripts/karpathy-gpu-enrich.mjs:65` (the canonical Karpathy GPU Authority Blend pipeline, already documented elsewhere in this file), `sveltekit-frontend/scripts/run-hypergraph.ts:150`, `scripts/smoke/smoke-attention-score-gpu-boundary.mjs` | N/A — live, backing the canonical Karpathy blend | None — not a removal candidate |
| `checkCudaAvailable`/`getCudaMemory` | device query | `batch-rerank-orchestrator.ts` | `cudaGetDeviceCount`/`cudaMemGetInfo` direct — LibTorch is overkill for a device query | None — trivially replaceable regardless of any other decision |

**Bottom line (corrected)**: of 19 exported native APIs, **all 19 have real production callers** —
zero are dead. All 5 that this file previously mislabeled "zero-caller" are real and no dynamic-
dispatch mechanism was needed to explain any of them; the original claim was a search-tooling
error (grep pattern too narrow), not evidence of dead code. Do not archive `trainSOM`,
`clusterEmbeddings`, `computeCaseEmbedding`, or the fp16 variants on the basis of this census.
Of the 19, most still map to a plausible non-LibTorch replacement this repo already has proven
groundwork for (`ACE-RADIX-01`'s CUB oracle for top-k, `SEMANTIC-EXACT-PARITY-01`'s cuVS for
cosine/KNN, `atlas-rapids-cu13` for k-means) rather than needing new research — but no parity/
latency/VRAM proof was run, so **do not treat any single row above as cleared for migration**
until that measurement exists, per this file's Status Language rule.

**Separately found while verifying these callers (2026-09-27) — GPU addon path alignment, not
census scope**: several of the calling scripts (`dir-pipeline.mjs`, `gpu-full-pipeline.mjs`,
`gemma4-semantic-embedding-cache.mts`, `prototype_feature_extract.mjs`,
`phase2b-lexical-extraction-kmeans.mjs`, `smoke-gpu-hardening.mjs`) hardcoded only the stale
`simd-bridge/cpp/build/Release/tensorrt_bridge.node` path and would silently run against an old
(pre-CUDA-rebuild) addon rather than the current `build-x64-cuda/Release` one. Fixed all 6 to check
`build-x64-cuda/Release` first, matching the pattern `karpathy-gpu-enrich.mjs`/`run-hypergraph.ts`/
`smoke-attention-score-gpu-boundary.mjs` already used correctly. Re-ran both smoke tests after the
fix: `smoke-gpu-hardening.mjs` 3/3 pass (now against the correct Sept-27 CUDA build, not the stale
June-2 one it was silently using before), `smoke-attention-score-gpu-boundary.mjs` 6 pass/1
non-critical warning. Separately, `gemma4-semantic-embedding-cache.mts` was found to have two
real pre-existing bugs beyond the addon path (a `require('crypto')`-vs-top-level-`await` module-
type conflict, and a wrong Qdrant endpoint — `/points` instead of `/points/scroll`), both fixed;
its 4 GPU call sites (`pageRankGPU`/`attentionScoreGPU`/`kmeansWithCentroids`/`trainSOM`) still
pass arguments in the wrong shape (e.g. raw unflattened embeddings where a flat adjacency matrix
or `Float32Array(n×dim)` is required) and have never produced valid output — this duplicates the
already-correct, already-canonical `karpathy-gpu-enrich.mjs` pipeline. Recommend archiving
`gemma4-semantic-embedding-cache.mts` (per this file's archive-not-delete convention) rather than
repairing its call signatures, pending operator confirmation — not done in this pass.

**Not done in this pass**: no code removed, no replacement implemented, no benchmark run. This is
the corrected census plus the addon-path alignment fix — the brief's own proposed gate correctly
separates "know the shape of the dependency" from "act on it."
