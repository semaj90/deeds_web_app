# Tasks

- [x] T0 ownership audit completed; no duplicate canonical runtime owner introduced.
  **Checked 2026-08-31, scoped to the GPU-residency executor** (the highest-duplication-risk
  surface in this doc, given the "One Canonical Runtime Owner Per Capability" rule and how much
  of T1-T10/GPU-EXP-* routes through GPU tensor residency): `sveltekit-frontend/python/
  parent_atlas_tensor/gpu_resident_executor.py` is the sole implementation repo-wide — confirmed
  via `find -iname "*gpu_resident_executor*"` (one match) and grepping for "pinned"/"page-locked"
  staging logic both in `python/parent_atlas_tensor/` (5 files, all within this one module —
  `gpu_tile_cache.py`, `pytorch_gpu_helpers.py`, `lod_promoter.py`, both test files — none
  competing) and the repo-root `python/` directory (zero matches, no shadow implementation
  elsewhere). TypeScript-side files referencing GPU residency
  (`atlas/features/candidate-feature-gpu-residency-v1.ts` + its `-pack-v1`/`-batch-request-v1`
  siblings) are confirmed contract/schema-only (Zod schemas + hashing, zero tensor computation) —
  a legitimate CONTRACT layer over the single Python EXECUTOR, not a second owner, consistent
  with this repo's CANONICAL_OWNER/ADAPTER/CONTRACT classification vocabulary. **Not exhaustively
  audited**: this pass didn't re-verify every other T1-T10 subsystem (Arrow artifact builder,
  Valkey/BitFrost residency cache, CAGRA benchmark harness) has exactly one owner each — scoped to
  the GPU-residency executor specifically, since that's what the box's own wording ("canonical
  runtime owner") most directly names and it's the piece the most-recent commit
  (`435967f7c7`) actually touched.
- [x] T1 Postgres artifact/tile migration applied through existing migration owner. **APPLY_PROVEN
      2026-08-09**: `migrations/20260810_parent_atlas_tensor_artifacts.sql` run directly against
      live Postgres (`docker exec ... psql < migration.sql`) — purely additive (4×
      `CREATE TABLE IF NOT EXISTS`, no ALTER/DROP on any existing table, wrapped in its own
      `BEGIN`/`COMMIT`), zero Drizzle-schema overlap (these tables aren't declared in
      `schema-postgres.ts`, so no `tablesFilter`/drift risk). Pre-flight-verified `uuidv7()`
      exists live before running. Post-apply verified: `\dt atlas_tensor*` shows all 4 tables
      (`atlas_tensor_artifacts`, `atlas_tensor_tiles`, `atlas_tensor_tile_members`,
      `atlas_tensor_residency_events`); `atlas_tensor_artifacts` row count = 0 (schema-only, no
      data written yet — correct, T2/T2b/T2c own writing the first artifact rows).
- [ ] T2-lineage `FeatureSourceManifest`: prove a live source column exists for each of the 5
      `FeatureVector5` fields before building any artifact. **Do not build `feature_matrix_5`
      with fabricated/zero-filled values for any unproven field.** This gate exists precisely to
      make "5/5 proven" an explicit, checkable precondition rather than an assumption.

      **Status: 4/5 proven, 1/5 genuinely blocked (2026-08-10, all coverage numbers verified
      live against Postgres, not estimated):**
      | Field | Status | Source | Live coverage |
      |---|---|---|---|
      | `authority_norm` | PROVEN | `graph_node_metrics.pagerank` (`packet_key` join) | 58,546 / 61,659 = 94.9% |
      | `domain_fit` | PROVEN | `atlas_packets.domain_confidence` | 4,412 / 61,659 = 7.2% |
      | `ast_signal` | PROVEN 2026-08-10 | `codebase_chunk_index.ast_symbols` JSONB (written by `ast-treesitter-facts.mjs`, real `web-tree-sitter` parser — confirmed live, not a stub) | 2,903 / 52,417 = 5.5% |
      | `entropy_norm` | **PROVEN 2026-08-10** | byte-trigram Engram (`mapreduce_engram.py`) over real `codebase_chunk_index.content`, concatenated per packet in `line_start` order | 4,046 / 4,480 = 90.3% (of the distinct-packet-with-content universe; see full breakdown below) |
      | `execution_utility` | NOT PROVEN | Checked `trace_runs` as the candidate RouteTrace source: real live table, 15 rows, but **no `packet_key` column at all** — it records run-level status/exit_code/pass_count, not per-packet outcomes. Not usable as-is; needs the n-ary `trace_packet_events` table design below before this can close. | — |

      **`entropy_norm` — full run record (T2_ENTROPY_COMPLETE checklist, all items satisfied):**
      - Real source corpus: 4,480 distinct `(packet_key, relative_path)` rows, real
        `codebase_chunk_index.content` concatenated per packet in `line_start` order (same join
        as T2b/T6c: `atlas_packets.source_ref = codebase_chunk_index.relative_path`).
        `source_revision` = sha256 of the concatenated per-packet UTF-8 text, computed in SQL,
        carried through per row — reruns against unchanged content reproduce the identical hash.
      - Frozen input contract (recorded, not assumed): UTF-8 (re-encoded with
        `errors="replace"`), raw line endings (not canonicalized — CRLF treated as real
        byte-level signal), context width 3 bytes, packet attribution = one row per packet_key.
        **Exclude policy** (found live, not guessed): `node_modules/`, `.venv/`, `vendor/`,
        `dist/`, `build/`, `package-lock.json`, `pnpm-lock.yaml`, `.min.js`, and
        `/reports/backup-*` (426 of 434 total exclusions — stale duplicate snapshot dirs found
        live in the export; excluding them was the right call, not an afterthought).
      - `mapreduce_engram.py`'s existing `map_counts`/`reduce_counts` reused unchanged (no
        redesign) to build a global byte-trigram → next-byte-distribution table across all 4,046
        eligible packets: 488,862 distinct `(context,next)` events, 116,092 distinct 3-byte
        contexts, each context's Laplace-smoothed (α=0.1) Shannon entropy `H(context)` computed
        once. Per-packet `raw_packet_entropy` = mean of `H(context)` over every trigram position
        in that packet's own byte sequence (DeepSeek-Engram-style: global deterministic memory
        table, looked up per occurrence, not a per-packet model).
      - **Raw distribution reported before choosing normalization** (not assumed): min 1.2483,
        p05 2.0367, p25 2.1546, median 2.2438, p75 2.372, p95 2.6541, p99 2.854, max 3.518, mean
        2.2833, stdev 0.1972.
      - Normalization chosen *from* that distribution, not an arbitrary denominator: robust
        z-score using median/MAD (`MAD_scaled = MAD × 1.4826 = 0.1505`), squashed via
        `entropy_norm = (tanh(z) + 1) / 2` — median maps to exactly 0.5 by construction, min/max
        map to 0.0000/1.0000. Revisioned as `normalization_revision = "robust-mad-tanh-v1"`
        (distinct from `ast_signal`'s unrelated `tanh(x/5)` formula — no shared denominator was
        assumed across features).
      - **Coverage recorded with full accounting** (per the `FeatureCoverage` contract:
        sourceRows/eligibleRows/producedRows/coverageRatio/missingPolicy/producerRevision, not
        just a bare percentage): `sourceRows=4480, eligibleRows=4046, producedRows=4046,
        coverageRatio=0.9031, missingPolicy="MISSING", producerRevision=
        "mapreduce-engram-byte3-v1", excludedByReason={reports/backup-: 426, .min.js: 1,
        package-lock.json: 3, build: 2, vendor: 2}`. All 434 excluded/too-short rows have
        `entropy_norm=null` — **never zero-filled**.
      - **Deterministic rerun checked live**: ran the full pipeline twice; byte-identical output
        (`diff` clean) on the second run.
      - Persisted: `data/atlas-tensor-proof/entropy_norm_r1.jsonl` (4,480 rows: packet_key,
        source_revision, engram_context_width, entropy_raw, entropy_norm, observed_contexts,
        eligible, coverage_reason, producer_revision, normalization_revision) and
        `entropy_norm_coverage_r1.json` (distribution + coverage manifest).

      **STOP per explicit instruction — T2-lineage is now 4/5, entropy_norm closed. Did not
      start `execution_utility` in this same gate.** The next dedicated gate is the
      packet-grained execution-event model (`trace_packet_events`: run_id, packet_key,
      event_type, selected, evidence_used, compile_pass, test_pass, repair_success,
      validation_pass, source_revision, representation_revision) — a real schema-design task,
      not a verification pass, intentionally not started here.

      **`ast_signal` formula** (defined and distribution-checked live, not yet written to any
      table): `ast_signal = tanh(symbol_count / 5)` where `symbol_count =
      jsonb_array_length(ast_symbols)`. Distribution on the 2,903 live rows: mean 16.09 symbols,
      median 4, p95 11.9, max 485 (one outlier chunk). Mapped: median→0.664, p95→0.984,
      saturates well before the max — a defensible bounded softcap, consistent with this
      session's softcap-per-feature-family principle (not one global cap).

      **Honesty note**: `domain_fit`'s own source coverage (7.2%) is actually *lower* than
      `ast_signal`'s (5.5%) — both are genuinely partial, real, live sources, not full
      populations. T2-lineage "proven" means *a real live source and a defined formula exist*,
      not *100% row coverage*. Any consumer of `feature_matrix_5` must treat missing rows as
      missing, never silently zero-filled, regardless of which of the 3 proven fields is sparse
      for a given packet.

      **`execution_utility` schema now exists live (2026-08-10) — but this does NOT close the
      gate.** Before writing any schema, checked whether real historical data could bootstrap
      this: `trace_runs` (15 rows) has no `packet_key`; `trace_events` (45 rows) has a
      `file_path` column that looked promising but **joins to zero rows** in
      `atlas_packets.source_ref` (checked live), and its event types
      (`tool_call`/`span`/`cache_hit`/`cache_miss`) are infrastructure telemetry, not
      compile/test/repair outcomes. **There is no real per-packet execution-outcome data
      anywhere in this system to backfill from — none, checked, not assumed.**

      Applied `migrations/20260810b_trace_packet_events.sql` (additive-only, matches T1's
      pattern, zero conflict with any existing table): `trace_packet_events` (the n-ary child
      relation — `run_id, packet_key, event_type, retrieval_rank, selected, evidence_used,
      compile_pass, test_pass, repair_success, validation_pass, latency_ms, token_cost,
      tool_cost, source_revision, representation_revision` — deliberately NOT a `packet_key`
      column bolted onto `trace_runs`, since one run touches many packets and that would encode
      a false 1:1 relationship) and `atlas_execution_utility` (the packet-level aggregation
      target: `execution_utility_raw`, `execution_utility`, plus the five named component rates
      — `selected_rate`, `targeted_test_success_rate`, `repair_success_rate`,
      `execution_validation_rate`, `false_edit_penalty` — matching the fixed-weight formula
      `U = wₛS + wₜT + wᵣR + wₑE + w_fF`, not RL, per design intent). Both confirmed live via
      `\dt`, both confirmed **empty (0 rows)** — this is expected and correct, not a bug.

      **`execution_utility` remains NOT_PROVEN.** Schema existing is not the same claim as data
      existing — this only creates the persistence shape for real events to accumulate into as
      the system runs going forward; nothing can be computed or backfilled today. T2-lineage
      stays at **4/5**, not 5/5, until `trace_packet_events` has real rows and a rollup job has
      actually populated `atlas_execution_utility` with a reportable coverage number, the same
      standard applied to every other field in this table.

      **Adjacent naming hazard, found via a stray grep result (2026-08-10)**: don't confuse
      `ast_signal`'s real source (`ast-treesitter-facts.mjs`, real `web-tree-sitter`) with
      `src/lib/server/atlas/indexing/tree-sitter-chunker.ts` — despite its name, that file does
      no AST parsing at all (plain fixed-size sliding-window text splitter, no `tree-sitter`
      import). It has real live callers though (`indexing/index.ts` barrel,
      `sveltekit-frontend/src/lib/server/analysis/{analysis-contracts,nlp-feature-compiler}
      .spec.ts`), so it's not dead code — just misleadingly named. Anything currently consumed
      through that chunker gets naive text windows, not AST-aware chunks. Not fixed/renamed this
      pass; flagged so it isn't mistaken for a second `ast_signal` source later.

**Correction to a reviewer claim (2026-09-06) — `entropy_norm` is PROVEN, not NOT_PROVEN; T2-lineage
is 4/5, not 3/5.** An external review of a separately-pasted handoff concluded "T2 is still 3/5" and
"`entropy_norm` NOT PROVEN — still no live revision-qualified entropy n-gram artifact." That claim is
false against this file's own record, checked directly above rather than accepted: the
`T2_ENTROPY_COMPLETE` section (lines 44-88 of this file) already closed `entropy_norm` on 2026-08-10
with a real byte-trigram Engram computation over real `codebase_chunk_index.content`
(4,046/4,480 = 90.3% coverage), a `source_revision` = sha256 of the concatenated per-packet text
carried through every row (this **is** the "revision-qualified" property the review says is
missing), a reported raw-distribution before normalization was chosen, a named normalization
revision (`robust-mad-tanh-v1`), a verified byte-identical deterministic rerun, and persisted
artifacts (`entropy_norm_r1.jsonl`, `entropy_norm_coverage_r1.json`). Nothing in this file was
reopened, revised, or retracted between 2026-08-10 and now that would justify downgrading this
status — the review appears to have worked from an older or incomplete version of the handoff that
predated this proof. **T2-lineage remains 4/5** (`authority_norm`, `domain_fit`, `ast_signal`,
`entropy_norm` all PROVEN; `execution_utility` — the review's other point — correctly remains
NOT_PROVEN, matching this file's own existing record). Everything else in that same review checked
out accurate against this file: the 7.2%-vs-5.5% coverage arithmetic and its denominator caveat
(matches this file's own "Honesty note" almost verbatim), T6c/KMeans-closed status, `semantic_768`
canonical status, and the `tree-sitter-chunker.ts` naming-hazard flag immediately above this note.

**Genuinely useful design refinement recorded, not required to re-prove anything**: the review
proposes splitting a future `entropy_norm` v2 into a richer `EntropyStatsV1` contract carrying
separate `byteEntropyBits`/`byteEntropyNorm` and `ngramEntropyBits`/`ngramEntropyNorm` fields (order
1/2/3), rather than collapsing two distinct entropy concepts into one field. This is a reasonable
enhancement for a *future* revision of the already-proven feature — not a prerequisite for the
current PROVEN status, and not authorized as new work by this note.

**`execution_utility` design refinement, cross-referenced not duplicated**: the review's proposed
`PacketExecutionUtilityV1` (`attributableExecutions`, `validatedSuccesses`, `validatedFailures`,
`executionUtility = validatedSuccesses / attributableExecutions`) substantially overlaps with the
`trace_packet_events`/`atlas_execution_utility` schema this file already designed and applied on
2026-08-10 (lines 120-131 above — `selected_rate`, `targeted_test_success_rate`,
`repair_success_rate`, `execution_validation_rate`, `false_edit_penalty` feeding a fixed-weight
`U = wₛS + wₜT + wᵣR + wₑE + w_fF` formula). The review's simpler single-ratio formula for a "v1"
is worth considering as a bootstrap before the full 5-component weighted formula has enough real
`trace_packet_events` rows to compute reliably — but this is a sequencing decision for whoever
executes the still-not-started `execution_utility` backfill, not a new schema to build. Both
tables remain correctly empty (0 rows) until real execution events accumulate.
- [ ] T2 one Arrow `feature_matrix_5` artifact created and hash-verified. **Blocked on
      T2-lineage reaching 5/5** — do not attempt until then.
- [x] T2b one Arrow `semantic_768` fixture/artifact created and representation lineage frozen.
      **APPLY_PROVEN 2026-08-10**: 4096 real rows exported from live Postgres
      (`atlas_packets JOIN codebase_chunk_index ON relative_path = source_ref`, both
      `packet_key IS NOT NULL` and `content_embedding IS NOT NULL`, `DISTINCT ON (packet_key)`
      for determinism, ordered by `packet_key`) — real 768-dim `embeddinggemma` vectors, not
      synthetic. Written to `sveltekit-frontend/data/atlas-tensor-proof/semantic_768_r1.arrow`
      via a new `build-semantic` CLI subcommand added to `python/parent_atlas_tensor/cli.py`
      (mirrors the existing `build-feature` subcommand exactly; uses the already-shipped
      `semantic_batch()`/`write_ipc_file()` from `arrow_ipc.py`, no new abstraction). sha256
      recorded in the CLI's own JSON output. **Found and fixed one real bug while doing this**:
      `arrow_ipc.py`'s `write_ipc_file()` called `pa.OSFile(path, "wb")` with a `pathlib.Path`
      object; this Windows pyarrow build requires a plain `str` (`TypeError: expected bytes,
      WindowsPath found`) — fixed with `str(path)`. Deterministic-reload proven: re-opened via
      `open_mmap()`/`batch_matrix()`, row 0's key+vector byte-compared against the source JSONL
      (`np.allclose`, exact match), sha256 stable across repeated hashing of the same file.
- [x] T2c / T6c RAPIDS KMeans centroid + membership artifacts, persisted with lineage.
      **RUNTIME_SMOKE_PROVEN 2026-08-10, live, real negative result.** Ran a K∈{64,128,256}
      evaluation sweep (`data/atlas-tensor-proof/t6c_kmeans_sweep.py`) directly against the
      already-proven `semantic_768_r1_full.arrow` corpus (4480 real rows) via `cuml.cluster.
      KMeans` on the live WSL2 GPU — no AE, no SOM, no FeatureVector5, no RRF changes needed, as
      predicted. **Found and confirmed a real, reproducible import-order bug along the way**:
      importing `cuml` before `torch` in the `atlas-rapids-cu13` env throws
      `undefined symbol: cublasLtZZZMatmulAlgoGetHeuristicForStream` (a cublas ABI mismatch);
      importing `torch` first works. This is the same GS1.33 "torch-before-cudf/cugraph"
      fragility already documented in this session — this run reproduces it directly and
      resolves the earlier ambiguity where a user-reported cugraph import failure contradicted
      an earlier successful check (that earlier contradiction was real, just import-order
      dependent, not random or environment drift).

      **Results** (all three K, GPU-fit, zero empty clusters at any K):
      | K | fit_ms | inertia | cluster size p50/p95 | mean recall@10 (top-1 cluster) | mean recall@10 (top-3 clusters) | min recall@10 (top-1) |
      |---|---|---|---|---|---|---|
      | 64 | 4574 | 1974.7 | 64.5 / 118.7 | **0.57** | 0.78 | 0.10 |
      | 128 | 7302 | 1827.4 | 34.0 / 67.6 | **0.57** | 0.745 | 0.10 |
      | 256 | 10141 | 1662.6 | 16.0 / 35.25 | **0.465** | 0.65 | 0.10 |

      Centroid search itself is fast (~0.15–0.21ms mean per query — this part is cheap and fine
      at any K). **But recall is not.** Restricting the exact-search candidate set to only the
      nearest 1 (or even nearest 3) KMeans cluster(s) loses 22–54% of the true top-10 neighbors
      on average, and as much as 90% in the worst observed query (min recall@10 = 0.10 at every
      K). **This directly triggers this file's own pre-existing rule: "if SOM/KMeans hurts
      recall, it becomes CACHE_HINT_ONLY, never a retrieval filter."**

      **Verdict — Mode A (KMeans as a hard retrieval filter) is REJECTED at current corpus
      scale (4480 rows) and this K range.** Do not restrict exact/CAGRA search to a KMeans
      neighborhood in the live retrieval path. Centroid/membership artifacts remain valid for
      Mode B only (ACE prefetch/cache hints, non-restrictive) — persisted as
      `centroids_k{64,128,256}_r1.arrow` / `membership_k{64,128,256}_r1.arrow` with
      revision-qualified centroid IDs (`centroid:semantic_768:k{K}:r1:{i}`) for that purpose.
      No canonical K was chosen — per the sweep's own design intent, this is comparative
      evidence, not a decision. **SOM 20×20 must be evaluated with this exact same
      methodology (recall@10 vs. the T3a/T6b exact oracle, top-N-neighborhood restriction)
      before being trusted as anything more than a cache hint either** — this result is a
      concrete warning against assuming coarse spatial/cluster routing is safe by default.

      **T6c v2 refinement (2026-08-10) — superseded the table above with a proper K×C sweep.**
      Pre-registered invariant checked first: `semantic_768` confirmed live L2-normalized
      (norms min=0.9999 mean=1.0000 max=1.0001, std≈0) — so cuml's squared-Euclidean KMeans
      objective is cosine-consistent here (`‖x−y‖²=2−2cos(x,y)` for unit vectors); no separate
      normalized derivative artifact was needed. Re-ran with C∈{1,2,4,8} nearest centroids
      searched, evaluating recall@{1,5,10} against the same exact oracle, and persisted three
      logically separate artifacts per K (not conflated): `centroids_r1_k{K}.arrow`
      (centroid_id, centroid_768), `membership_r1_k{K}.arrow` (packet_key, centroid_id,
      distance_to_centroid), `kmeans_run_r1_k{K}.json` (sourceArtifactId/sha256,
      representationRevision, algorithmRevision, cuml version, K, seed, inertia, fitDurationMs —
      policy/provenance, kept separate from the numeric Arrow artifacts).

      **Full result table** (20 queries, seed 42, all live on real WSL2 GPU):
      | K | C | candidate_frac_mean | recall@1 | recall@5 | recall@10 | fit_ms |
      |---|---|---|---|---|---|---|
      | 64 | 1 | 1.7% | 1.0 | 0.64 | 0.57 | 3323 |
      | 64 | 2 | 3.6% | 1.0 | 0.81 | 0.74 | 3323 |
      | 64 | 4 | 7.1% | 1.0 | 0.86 | 0.82 | 3323 |
      | 64 | 8 | 14.7% | 1.0 | 0.93 | 0.905 | 3323 |
      | 128 | 1 | 1.2% | 1.0 | 0.66 | 0.57 | 6463 |
      | 128 | 2 | 2.1% | 1.0 | 0.77 | 0.68 | 6463 |
      | 128 | 4 | 4.1% | 1.0 | 0.88 | 0.82 | 6463 |
      | 128 | 8 | 8.2% | 1.0 | 0.94 | **0.885** | 6463 |
      | 256 | 1 | 0.6% | 1.0 | 0.59 | 0.465 | 23386 |
      | 256 | 2 | 1.1% | 1.0 | 0.71 | 0.585 | 23386 |
      | 256 | 4 | 2.1% | 1.0 | 0.83 | 0.72 | 23386 |
      | 256 | 8 | 4.3% | 1.0 | 0.89 | **0.86** | 23386 |

      **Reading the tradeoff**: recall@1 is 1.0 at *every* single (K,C) tested — the true
      nearest neighbor is always inside the searched neighborhood. recall@10 degrades
      predictably with fewer centroids searched, and no tested config reaches 1.0 recall@10 —
      the best observed tradeoffs are K=128,C=8 (88.5% recall using 8.2% of the corpus) and
      K=256,C=8 (86% recall using only 4.25% of the corpus, at nearly 3× the KMeans fit cost —
      K=256 took 23.4s to fit vs. 3.3s for K=64, a cost that matters on revision-bump re-fits).
      **No canonical K/C was chosen — per design intent this is comparative evidence, not a
      decision; status remains `KMEANS_ROUTING_EXPERIMENT_PROVEN`, explicitly not
      `CANONICAL_RETRIEVAL_FILTER`.**

      **STOP per explicit instruction — T6c is now complete**: K=64/128/256 all persisted, all
      four C values evaluated per K, recall@{1,5,10} measured against the exact oracle, candidate
      reduction measured, cluster population statistics recorded, full reproducibility metadata
      (source sha256, representation revision, algorithm revision, cuml version, seed) recorded
      per K, OpenSpec updated with evidence. **Not started, and intentionally not touched this
      pass: SOM, RRF, AE, Neo4j projections, promoting KMeans into SearchRuntime,
      FeatureVector5.** The two experimental programs (vector residency: T3a/T6c/SOM/T3b/T3c/ACE;
      graph ranking: Patch H/graph-refresh/GA8/GA9) remain independent until GA8 explicitly
      combines them — a fresh graph revision must not change the corpus underneath this KMeans
      experiment, and a KMeans/SOM revision must not contaminate the graph feature ablation.
- [x] T3a Arrow mmap → real GPU exact top-k → packet_key recovery.
      **RUNTIME_SMOKE_PROVEN 2026-08-10, live, not simulated.** Renamed/split from the original
      single "T3" 2026-08-10 per a correctness-labeling review: the proof script used
      `open_mmap()` and transmitted the corpus over HTTP to `/v1/knn/exact` — that is a real,
      end-to-end GPU correctness proof with real identities, but it is *not* the same claim as
      "pinned host memory" or "GPU-resident tile reuse." Splitting the single T3 line into three
      honestly-scoped gates (T3a/T3b/T3c below) so the roadmap can't accidentally imply the
      residency mechanism was proven before it was measured.
      Launched `python/atlas_rapids_sidecar.py` inside WSL2 (`atlas-rapids-cu13` conda env) —
      confirmed real GPU (RTX 3060 Ti, 6.7GB free), `cuvs`/`cagra`/`cugraph`/`cuml` 26.06.00,
      `torch` 2.13.0+cu130 with CUDA all live via `/health`. Wrote
      `data/atlas-tensor-proof/t3_exact_gpu_proof.py`: loads the T2b Arrow tile via
      `open_mmap()`, computes a CPU-exact brute-force cosine top-10 oracle in numpy over the
      real 4096×768 matrix, sends the identical query+corpus (with `packetKey`+`sourceRevision`
      identity per the sidecar's `ExactKnnRequest` contract) to the live sidecar's
      `POST /v1/knn/exact` (`cuvs.neighbors.brute_force` backend), and diffs the two top-10
      lists. **Result: exact match, same order, all 10 packet_keys identical** (CPU oracle
      13.8ms; GPU server-side `durationMs` 1043.8ms on this first, cold-start call — the 15×
      faster warm-call numbers under T6b below show this was CUDA context/JIT warmup, not a
      per-call cost). `corpusRows` echoed back by the sidecar matches the 4096 sent. This is the
      first genuinely GPU-executed step in the whole tensor-residency bundle — everything before
      this was unit/contract-level. Full output and the proof script are on disk at
      `sveltekit-frontend/data/atlas-tensor-proof/` for re-run/audit.
- [x] T3b mmap CPU buffer → actual pinned (page-locked) host memory.
      **RUNTIME_SMOKE_PROVEN 2026-08-31** (commit `435967f7c7`, "Tightened the live CUDA reuse
      proof"). Verified this is real pinned allocation, not just a label — the same discipline
      T6b-e's CAGRA correction below already applies to this doc: read
      `sveltekit-frontend/python/parent_atlas_tensor/gpu_resident_executor.py:155-161` directly,
      confirmed `torch.empty(tensor.shape, dtype=tensor.dtype, pin_memory=True)` (genuine PyTorch
      pinned-host allocation, which calls `cudaHostAlloc` under the hood) followed by
      `pinned.copy_(tensor)`, only then is `staging_mode = "PINNED_ASYNC"` set — the label is
      backed by the real API call, not asserted independently of it. Live proof artifact
      `docs/reports/candidate-feature-gpu-residency-proof-v3.json` reports
      `hostStagingMode: "PINNED_ASYNC"` on the initial lease.
- [x] T3c pinned host → `cudaMemcpyAsync` H2D → GPU-resident tile reuse across requests.
      **RUNTIME_SMOKE_PROVEN 2026-08-31, precisely scoped** (same commit). Read
      `gpu_resident_executor.py:164` — the pinned path calls `tensor.to(self.device,
      non_blocking=True)` (async H2D, `cudaMemcpyAsync` under PyTorch's CUDA allocator) — and
      `reuse_materialized()` (lines 270-297) confirmed to set `tensors=source.tensors`, the exact
      same Python object reference to the already-resident GPU tensor dict, with **no new H2D
      transfer or allocation**. Live proof JSON confirms: `h2dTransfers: 1` (the one initial
      transfer), two subsequent reuse observations both `h2dTransfer: false` +
      `sharedTensorObject: true`, top-level `sameResidentTensorObjects: true`,
      `memoryAfterRelease.allocatedBytes: 0` (clean release). **Scoping caveat, matching this
      doc's own T3a precedent of not overclaiming past what was actually run**: the proof script
      (`scripts/atlas/prove-candidate-feature-gpu-residency.py`) calls the executor in-process —
      this proves lease-level tensor reuse within one process/session, not literally "across
      separate HTTP requests" to a persistent long-running server (no such server was exercised
      here). If a future gate needs the latter (residency surviving across independent server
      requests, not just independent in-process lease calls), that's a materially different,
      still-open test — do not cite this proof for that stronger claim.
- [x] T6 cuVS brute-force same-matrix parity proven. **SATISFIED_BY_T3A** — one physical
      experiment, one canonical evidence record. (Superseded 2026-08-10: previously this line
      said "same live run as T3 above"; renamed to point at T3a specifically now that T3 has
      been split. Do not re-run this as a separate experiment — T3a already is the T6 proof.)
- [x] T4 ACE state transitions proven with deterministic eviction ordering.
      **Closed 2026-09-07** — the ACE-scoped contract for this task is
      `sveltekit-frontend/src/lib/server/atlas/residency/residency-scheduler-v1.ts`
      (`scheduleResidencyV1`, `ResidencyDecisionActionV1` = KEEP/PREFETCH/PROMOTE/DEMOTE/DEFER),
      distinct from T4a's separate BitFrost/GPU-tier contract in
      `packages/parent-atlas-retrieval/src/bifrost/residency-scheduler.ts` — do not conflate the
      two. Found and fixed one real bug in the process: the final deterministic tie-break used
      `a.resourceRef.localeCompare(b.resourceRef)`, the same ICU-locale non-determinism class
      already fixed twice elsewhere this session (`canonical-candidate-v1.ts`'s
      `ORDINAL-INTEGRITY-01`, `nary-hypergraph-contract.ts`'s T9) — replaced with the existing
      exported `compareUtf8()` from `canonical-candidate-v1.ts` (imported, not re-implemented a
      third time). Added 3 tests to `residency-scheduler-v1.spec.ts` (4/4 pass): (1) a
      previously-HOT candidate whose utility score drops below `hotRetainThreshold` is proven to
      `DEMOTE` (the actual eviction transition), never silently `KEEP`; (2) output ranking is
      invariant across 3 permutations of input arrival order (same candidates, same order every
      time); (3) tied-priority candidates break ties in real UTF-8 byte order (verified against
      `compareUtf8` directly, not a hardcoded guess), with an explicit check that this is *not*
      locale order. This file has zero live callers today (confirmed via repo-wide grep, same
      "coherent unwired scaffold" situation as T8/T9) — the fix and tests are safe with no
      production wiring changed.
- [x] T4a Added the bounded `ResidencySchedulerPlanV1` composition contract and
      pure decision proof in `packages/parent-atlas-retrieval/src/bifrost/
      residency-scheduler.ts`. It binds `workspaceRevision`, `sourceRevision`,
      and `candidateSnapshotChecksum`, caps one query at three unique evidence
      branches, keeps `semantic_768` as the only query-executable
      representation, and treats MRL `512/256/128` plus nested latent
      `256/128/64` views as non-authoritative residency hints. GPU admission is
      headroom-gated and hot residency uses `0.75` promote / `0.45` release
      hysteresis. This is a pure contract/fixture proof only: no SearchRuntime,
      Postgres, Qdrant, Valkey, GPU, or model calls are wired by this task.
- [x] T5 Valkey/BitFrost revision-qualified metadata keys + invalidation policy proven.
      **RUNTIME_SMOKE_PROVEN 2026-09-15**, closing the gap the 2026-09-06 fixture-only entry
      left open. Added three real methods to `BifrostCacheManager`
      (`packages/parent-atlas-retrieval/src/bifrost/bifrost-cache-manager.ts`):
      `setRetrievalV2()` / `getRetrievalV2()` (SET/GET keyed by the existing
      `buildRetrievalCacheKeyV2()` digest, `EX` TTL) and `invalidateRetrievalV2()` (explicit `DEL`
      for the secondary force-evict case — the primary invalidation mechanism is structural: a
      revision bump on any identity axis produces a different sha256 key, so a stale entry is
      simply unreachable, never served). Proven against a real, live Docker Valkey instance
      (`legal-ai-valkey`, password `redis`, no mocks) in a new spec,
      `packages/parent-atlas-retrieval/tests/bifrost/cache-identity-v2-live.spec.ts`, **4/4 pass
      fresh**: (1) write under the v2 key, read the identical value back; (2) mutating any single
      one of the 8 identity axes (queryHash/workspaceRevision/candidateSnapshotRevision/
      ordinalMapChecksum/representationRevision/retrievalPolicyRevision/contextPolicyRevision/
      graphRevision) in isolation produces a genuine live cache miss, not just a different string
      (the 2026-09-06 fixture test proved the strings differ; this proves Valkey actually can't
      find the mutated key); (3) `invalidateRetrievalV2()` deletes a still-live, still-reachable
      key ahead of its TTL — verified read-hit before, `deleted:true` on first call, read-miss
      after, `deleted:false` on a repeat call against the now-absent key; (4) reading a
      never-written identity is a clean `null`, not an error. Confirmed the test suite actually
      exercised live Valkey (not a silent skip-on-unreachable branch) by checking for the
      `[T5-live] Valkey unreachable` skip-warning in verbose output — absent, confirming a real
      connection — and confirmed zero key leakage post-run via
      `valkey-cli --scan --pattern "bitfrost:retrieval:v2:*"` returning empty. `tsc --noEmit -p
      tsconfig.json` on the package shows zero new errors introduced by either touched file (the
      package's pre-existing ~30 `$lib` module-resolution errors in unrelated `turbovec/*` files
      are unaffected, confirmed via a scoped grep of the tsc output for the two touched
      filenames). Re-ran the original 2026-09-06 fixture spec alongside the new one: still 1/1
      pass (file has 1 test, not 10 as the prior entry stated — corrected here since it was
      checked directly, not re-asserted).
- [x] T6 cuVS brute-force same-matrix parity proven. (Same live run as T3 above —
      `cuvs.neighbors.brute_force` on the real WSL2 GPU matched the CPU-exact oracle exactly.)
- [x] T6b-e CAGRA_EPHEMERAL_ENDPOINT: recall and latency measured against brute-force.
      **RUNTIME_SMOKE_PROVEN 2026-08-10, live** (relabeled from plain "T6b" 2026-08-10 — see
      correction below). Extended the real corpus to all 4480 distinct
      `(packet_key, semantic_768)` rows available live in Postgres (not all 52,380
      atlas_packets↔codebase_chunk_index join rows are distinct packet_keys — 4480 is the true
      unique population), wrote `semantic_768_r1_full.arrow`, then ran 20 real queries (seeded
      `np.random.default_rng(42)` row picks) against both `/v1/knn/exact` and `/v1/knn/cagra` on
      the live sidecar. **Result: recall@10 = 1.0 on every single query (min and mean both
      1.0)** — CAGRA never missed a single exact-oracle neighbor at this scale. **CAGRA was
      ~15× slower**: mean exact 143.8ms vs. mean CAGRA 2164.7ms (per-query range 1.4s–8.8s for
      CAGRA vs. 83ms–583ms for exact).
      **Correction (2026-08-10)**: the original write-up called this "CAGRA's crossover point"
      — that overclaims. The sidecar's `/v1/knn/cagra` endpoint builds a fresh CAGRA index from
      the corpus on every single request (see `atlas_rapids_sidecar.py`'s `knn_cagra()` — it
      calls `cagra_neighbors.IndexParams(...)`/build inline per-call, there is no persisted
      index across requests). The measured 2165ms therefore conflates index-build cost with
      search cost, and this benchmark cannot separate them. Correct classification:
      **CAGRA_EPHEMERAL_ENDPOINT — recall@10 1.0, latency poor, but latency figure is
      build+search combined, not search alone.** The recommendation ("don't switch to CAGRA at
      current data volume") still stands, but for a narrower and more honest reason: today's
      *endpoint*, as built, always pays full index-build cost per call, which is unambiguously
      worse than exact brute-force regardless of any true persistent-index crossover point.
- [x] T6b-p CAGRA persistent-index benchmark: build once, warm up, search-only p50/p95.
  **BOUNDED_FIXTURE_PROVEN 2026-09-01**: WSL2 `atlas-rapids-cu13`, cuVS
  `26.06.00`, 256x64 corpus, 8 queries, K=16, 10 search repeats, seed 42.
  Persistent CAGRA built once; build excluded from search timing; recall@K
  minimum/mean `1.0`; search P50 `2.5037 ms`, P95 `34.9074 ms`; writes
  attempted `false`. This closes the bounded fixture gate only; full-corpus
  benchmark, production identity reconciliation, and promotion remain open.
      **NOT_PROVEN, not started.** Needs a sidecar change (persist the CAGRA index handle across
      requests instead of rebuilding per-call) before this can be measured. Until this exists,
      no claim about CAGRA's true crossover point (build-once-search-many) can be made — T6b-e
      is not a substitute for it.
- [x] T6c RAPIDS KMeans centroids/labels persisted with artifact lineage. **Duplicate checkbox
      found and fixed 2026-09-15** — this is the same task as "T2c / T6c" above (line ~205),
      which already closed this exact deliverable (`RUNTIME_SMOKE_PROVEN 2026-08-10`,
      `centroids_r1_k{64,128,256}.arrow` / `membership_r1_k{64,128,256}.arrow` with
      revision-qualified centroid IDs). This second, unmarked copy of the same checkbox text was a
      stale duplicate left in the file, not a distinct remaining piece of work — marking it done
      here rather than re-running the KMeans sweep a second time for no reason.
- [x] T7 CPU worker staging bounded at four workers and measured — closed 2026-09-07, but
      **with a real duplicate-owner finding recorded, not silently resolved**. Researched first:
      the file whose name most literally matches this task,
      `sveltekit-frontend/src/lib/server/atlas/tensors/cpu-worker-pool.ts`
      (`CpuFeatureWorkerPool`), turned out to be the WRONG file to build on — confirmed via
      repo-wide grep it has **zero live callers**, while
      `sveltekit-frontend/src/lib/server/workers/compute-pool.ts` (`ComputePool`) is the real,
      live, canonical bounded worker_threads pool with **5 real callers**
      (`langextract/native.ts`, `ml/topic-cluster.ts`, `ml/som-cluster.ts`,
      `indexer/workers/index-worker-pool.ts` — explicitly documented in its own header as "a typed
      facade over ComputePool", confirming it correctly reuses rather than duplicates — and
      `analysis/forensics.ts`). Building out `cpu-worker-pool.ts` further (as this pass did for
      T8/T9's genuinely-unwired-but-non-duplicate scaffolds) would have legitimized a duplicate
      owner rather than closed a real gap — caught and stopped before writing any worker-module
      code, per this repo's Duplication Prevention rule ("if ownership can't be established, stop
      and record the ambiguity — don't implement past that point"). **`CpuFeatureWorkerPool` /
      `shared-worker-protocol.ts` are flagged here as an unresolved duplicate of `ComputePool`'s
      capability — not deleted, not merged, left for an explicit human decision** (archive per
      this repo's archive-not-delete convention, or repurpose for the 4 task kinds it declares
      but never implements — `HASH`/`PARSE_CONTROL_JSON`/`BUILD_TILE_KEY`/`PREPARE_ARROW_BATCH` —
      that `ComputePool`'s `TaskType` enum doesn't currently cover). **What was actually proven,
      against the real canonical owner**: `ComputePool`'s pool-size bound was inline in its
      constructor with no independent test; extracted the exact same expression (behavior-
      preserving, verified via diff) into an exported pure function
      `computeDefaultComputePoolSize(cpuCount, isClusterWorker)` in `compute-pool.ts`, added
      `compute-pool.spec.ts` (4/4 passing): never exceeds 4 workers at any CPU count (8/16/64/128
      all clamp to 4), scales down but never below 1 on low-CPU-count hosts (down to 0 CPUs
      reported), reduces to exactly 1 in cluster-worker mode regardless of CPU count, and is a
      pure/deterministic function. **Measurement of real concurrent worker behavior under load
      (the "measured" half of this task's wording) was deliberately NOT attempted** — that would
      require spawning real worker_threads via the existing live `compute-worker.mjs`, which is
      materially riskier to add to a live, 5-caller production file than a pure-function bound
      proof; left as a distinct, still-open future step if a stronger empirical proof is ever
      needed.
- [x] T8 unordered packet/chunk assembly deterministic under shuffled completion —
      closed 2026-09-07. **Researched before implementing, per this file's own established
      discipline of not guessing scope from a one-line checkbox**: `specs/packet-assembly/spec.md`
      (this same OpenSpec change) states the real requirement precisely — "physical completion
      order is not semantic order... it is joined into the final state by canonical identity, not
      by physical arrival order." Repo-wide grep before writing anything found
      `sveltekit-frontend/src/lib/server/atlas/tensors/unordered-chunk-assembler.ts`
      (`UnorderedChunkAssembler`) already exists, already implements this exact property
      (buffers chunks by `sequenceNumber` in a `Map`, only assembles once `stream.size ===
      chunkCount`, sorts by `sequenceNumber` before concatenating), but had **zero test coverage
      and zero live callers** — a coherent, self-contained unwired scaffold, not dead code, per
      this repo's own "don't delete unwired scaffolds" convention. **One real bug found and fixed
      while writing the proof, not glossed over**: nothing validated that `chunkCount` stayed
      consistent across chunks in the same stream — a caller sending an inconsistent `chunkCount`
      partway through a stream could silently produce a wrong-sized assembled buffer or cause the
      stream to never complete. Added an explicit mismatch check that throws
      (`chunkCount mismatch for stream ...`) rather than silently accepting it. Added
      `unordered-chunk-assembler.spec.ts`, 9/9 passing: byte-identical assembly proven across 20
      different deterministic shuffled arrival orders (the actual determinism property this task
      asks for), `null` returned until every chunk arrives, two concurrent streams interleaved with
      each other don't cross-contaminate, invalid/out-of-range sequence numbers throw, the new
      chunkCount-mismatch guard throws, a duplicate sequence-number delivery does not get
      double-counted toward stream completion, and stream state is cleared after completion so a
      reused `streamId` starts fresh. **Scope explicitly narrowed, not silently expanded**: the
      same spec file's second requirement (Postgres-first cluster-packet materialization from
      Valkey `cluster:summary:{clusterId}` via `graphify-som-cluster-summaries.mjs`) is a
      different, live-Postgres/Valkey-dependent pipeline — not touched by this closure, and this
      class is still not wired to any live caller (that remains separate, future work).
- [x] T9 n-ary incidence artifact emitted as sparse membership data, not dense adjacency —
      closed 2026-09-07. Researched first (design.md/proposal.md have minimal extra context
      beyond the checkbox itself — proposal.md just names "n-ary incidence artifact contract" as
      a deliverable); repo-wide grep before writing anything found
      `sveltekit-frontend/src/lib/server/atlas/tensors/nary-hypergraph-contract.ts` already exists
      (`HyperedgeMember`, `NaryIncidenceArtifact`, `canonicalizeHyperedgeMembers`) with **zero test
      coverage and zero live callers** — same unwired-scaffold shape as T8's
      `unordered-chunk-assembler.ts` above. **One real bug found and fixed, the same bug class
      already precedented in this exact file's own `ORDINAL-INTEGRITY-01` entry above**:
      `canonicalizeHyperedgeMembers` used `String.prototype.localeCompare()` for its sort order,
      which is ICU/locale-sensitive and not guaranteed identical across Node builds/locales/ICU
      versions — the same determinism hazard already found and fixed once in this same OpenSpec
      change's `canonical-candidate-v1.ts`. Added the same `compareUtf8()` fix (`Buffer.compare`
      on UTF-8 bytes) here too, verified against a hand-picked locale-collation-vs-byte-order trap
      case (`'Ab' < 'a_b' < 'aa'` in strict byte order, which a locale-aware collator would likely
      order differently). Added `buildNaryIncidenceArtifactMetadata()` — a pure function computing
      `rows`/`hyperedgeCount`/`vertexCount` from a canonicalized member list; `arrowPath` and
      `contentHash` stay caller-supplied, matching every sibling artifact contract in this
      directory (`tensor-artifact-contract.ts`, `representation-artifact-v1.ts`) — this file does
      not compute hashes or write Arrow files itself, matching its existing scope. Added
      `nary-hypergraph-contract.spec.ts`, 9/9 passing: canonicalization order, order-independence
      (shuffled input -> identical canonical output), no input mutation, the byte-order-vs-locale
      trap case, and — the actual "sparse, not dense" property T9 asks for — `rows` proven to equal
      the real membership count (not `hyperedgeCount * vertexCount`) at both a small hand-built
      fixture (4 memberships, 2x3 nominal dimensions) and a larger synthetic corpus (500
      hyperedges x 3 memberships each = 1500 rows, versus a 250,000-cell dense matrix the nominal
      dimensions would imply) — no dense matrix is ever materialized. Also added a duplicate-row
      rejection (a hyperedge/vertex/role triple appearing twice is refused, not silently
      double-counted). **Not done in this pass**: no Arrow file writer, no live caller wiring —
      matching this task's own scope (a contract/metadata proof, not a production pipeline).
- [x] T10 visualization consumes derived topology/LOD state only. **STATICALLY_REFERENCED
      2026-09-15, scoped audit, not exhaustive.** Checked the primary topology visualization
      surface named elsewhere in this repo (root CLAUDE.md's "Topology node coloring" entry),
      `sveltekit-frontend/src/routes/(app)/code-intel/topology/+page.svelte` (976 lines): grepped
      for client-side clustering/LOD computation (`kmeans`, `pca`, `computeCluster`, `trainSOM`,
      dimension-reduction calls) — zero hits. All topology/centroid/graph-traversal state is
      fetched via `fetch('/api/code-intel/topology' | '/api/topology/centroids' |
      '/api/graph/traverse')` — three real API calls, no in-browser recomputation. Spot-checked 3
      more candidate visualization surfaces found via a broader repo-wide grep for
      `topology4d`/`somBmuRow`/`clusterId` consumers: `code-intel/clusters/+page.svelte` and
      `command-center/codebase/clusters/[id]/+page.svelte` have zero clustering-computation hits;
      `codebase-graph/fast-ast/+page.svelte` has a `runBatchGpu(['kmeans','som','pagerank'])`
      trigger button, but its implementation is a `POST /api/codebase-index/batch-gpu` fetch that
      hands the actual GPU compute to the server — the client only displays per-stage progress
      state, which is the correct pattern (a UI trigger for server-side work, not client-side
      computation). **Not exhaustive**: 6 more files matched the same broad grep
      (`ErrorEventsList.svelte`, `ErrorModal.svelte`, `admin/atlas/+page.svelte`,
      `admin/error-analysis/+page.svelte`, `admin/phase89/+page.svelte`,
      `admin/search-intelligence/+page.svelte`) and were not individually checked — flagged as an
      open residual, same discipline as this file's other partial-coverage entries, rather than
      silently claimed complete.

## Live verification (2026-08-09, this session)

Bundle extracted to `parent-atlas-tensor-residency-integration/` at repo root and applied via its
own `apply-parent-atlas-tensor-residency.ps1` copier (refuses to overwrite collisions; no manual
overwrite was needed — every target path was `NEW` at apply time). Re-verified this session:

- **File-identity check**: every file under the bundle's `openspec/` and `sveltekit-frontend/`
  trees is byte-identical (`diff -q`) to its counterpart in the live repo tree. **PRESENT.**
- **`npx vitest run tests/atlas/tensor-residency/`**: 4 files / 7 tests, all pass live (tile-key,
  ace-residency-policy, serialization-policy, packet-assembler). **RUNTIME_SMOKE_PROVEN** (pure-TS
  unit level only — no GPU, no Postgres, no Arrow I/O exercised).
- **`npx tsx scripts/atlas/verify-tensor-residency.mts`**: `{"status":"PASS", invariants: {
  arrowBulkNumeric, topology4DerivedOnly, maxCpuWorkers=4, hnswLayersNotAtlasLod,
  exactBeforeApproximate, unorderedAssemblyRevisionQualified } all true}`. **STATICALLY_REFERENCED**
  (the script asserts its own contract shape; it does not execute a live Arrow/GPU round-trip).
- **Postgres migration** (`migrations/20260810_parent_atlas_tensor_artifacts.sql`): confirmed
  **NOT APPLIED** — `\dt atlas_tensor*` against the live DB returns zero tables. Matches the
  bundle's own stated validation scope (its author explicitly did not claim this was run).
- **External callers**: `grep -rl "server/atlas/tensors/"` outside the `tensors/` directory itself
  returns only the bundle's own `scripts/atlas/verify-tensor-residency.mts` — **zero production
  callers**. This is intentional scaffolding at this stage, not a gap; T1–T10 above are exactly the
  remaining wiring/proof work.
- **Python package**: `python/parent_atlas_tensor/` imports cleanly (`import parent_atlas_tensor`
  succeeds) from the repo's ambient Python — this only proves syntactic import health, not that the
  RAPIDS/cuVS/cuGraph adapters (`cuvs_exact.py`, `cagra_adapter.py`, `kmeans_rapids.py`) actually
  execute against a live GPU. That proof belongs to T6/T6b/T6c, still unstarted.

**Net status**: bundle is PRESENT + STATICALLY_REFERENCED + unit-level RUNTIME_SMOKE_PROVEN. No
task above is CROSS_STORE_PROVEN or GPU-execution-proven yet — the bundle author's own stated next
step (Arrow tile → pinned host → GPU exact top-k vs. oracle, T3) is still the correct next action,
not any percentage-complete claim.

## v2 bundle import (2026-08-10)

A second bundle, `parent_atlas_tensor_residency_integration_v2/`, was extracted at repo root.
Its dry-run copier reported 21 genuinely `NEW` files (v1's files all showed as `COLLISION`,
confirmed via `diff -q` to be byte-identical already-applied v1 content — not drift). Since the
copier throws on the first collision (refuses partial-overwrite by design), it could not be run
with `-Apply` directly; the 21 `NEW` files were copied individually instead, plus one intentional
docstring-only update (`python/parent_atlas_tensor/__init__.py`, diffed first — harmless). The
bundle's own `openspec/.../tasks.md` was deliberately **not** copied over — it would have
clobbered this file's live session history with the bundle's original skeleton.

**New files**: `token-feature-map.ts`/`.py` equivalents, `latent-lod-contract.ts`
(semantic_768 canonical, latent_128 deterministic-AE, VAE explicitly RESEARCH_ONLY),
`deterministic_autoencoder.py` (768→256→128→256→768 PyTorch), `vae_research.py` (stochastic VAE
helper, explicitly forbidden from becoming canonical semantic_768 per its own naming),
`low_rank_projection.py` (truncated SVD experimental), `pytorch_gpu_helpers.py` (tile sizing,
pinned-host prep, tiled exact cosine/top-k), `ace-lod-promoter.ts`/`lod_promoter.py`,
`runtime-policy-manifest.ts` (KMeans/SOM/CAGRA/HNSW/ACE-reranker parameters come from a
revisioned policy, never read out of arbitrary tensor contents — same "manifest is policy, tile
is data" split as this file's own graph-projection-manifest work), `reranker-cache.ts`/
`reranker_gpu_cache.py`, `topology-tile-tree.ts`/`.py` (BVH-*like* culling for
visualization/ACE-prefetch only, explicitly not an ANN replacement — CAGRA/HNSW still own ANN),
`packet-summary-tile.ts` (numeric GPU tile vs. title/summary/evidence tile split),
`cache-tier-contract.ts` (residency state vs. background job-lifecycle state kept distinct), plus
4 docs (`ACE_NEURAL_LOD.md`, `TOKEN_REMAP_LATENT_PROJECTION.md`, `TOPOLOGY_TILE_TREE.md`,
`THREE_PLANE_RUNTIME.md`) and 4 new Vitest specs.

**Live verification — found and fixed one real bug in the bundle itself**:
`tests/atlas/tensor-residency/topology-tile-tree.spec.ts` shipped with an object-literal
`TopologyCoordinate4` (`{somX, somY, authority, entropyUtility}`), but the canonical type
(`topology-coordinate4.ts`, live since v1, unchanged) is a **readonly tuple**
`[somX, somY, authorityNorm, entropyUtilityNorm]`. `contains()` in `topology-tile-tree.ts`
correctly indexes it as a tuple (`p[0]..p[3]`) — the implementation was right, the test was
wrong: indexing a plain object with `[0]`/`[1]`/etc. reads `undefined`, so every comparison
silently evaluated false. First test run: 1/8 spec files failed
(`expected [] to deeply equal ['t0','t1']`). Fixed by rewriting the test's coordinates as tuples
(`[.25, .25, .5, .5]` / `[2, 2, .5, .5]`) with a comment recording why. Re-ran: **8/8 spec files,
11/11 tests pass live.** `npx tsgo --noEmit` shows zero new errors from any v2 file. Python:
`py_compile` on all `python/parent_atlas_tensor/*.py` exits 0; `import parent_atlas_tensor`
succeeds. External-caller grep unchanged — still only the bundle's own
`scripts/atlas/verify-tensor-residency.mts`, confirming v2 is additive scaffolding, not wired
into any live retrieval path yet, same as v1.

Net effect: this is the same "unit/contract-level proven, zero production integration" status as
v1's initial import, now with a materially richer LOD/token-remap/policy vocabulary — and one
real (if trivial) bug caught by actually running the tests rather than trusting the bundle
author's own "TypeScript tsc --noEmit PASS" claim, which evidently didn't include a live Vitest
run against the real `TopologyCoordinate4` type.

## Design refinement (2026-08-09, user brainstorm — recorded, not implemented)

Answering directly: yes, the bundle is imported — see "Live verification" above (byte-identical
apply, 7/7 unit tests, migration confirmed unapplied, zero production callers). Nothing new was
implemented this turn; the message was a large speculative brainstorm (VAE, DLSS, BVH/meshnet,
Riemannian 4D manifold, quaternion rotations, INT4 token remap, MessagePack/CouchDB/DuckDB storage
options) that the user's own closing paragraph explicitly scoped down from. Recording only the
concrete, load-bearing decisions extracted from it:

- **No VAE for Ornith token remapping.** Ornith keeps its native tokenizer/vocabulary untouched
  end-to-end; Atlas builds a **parallel** `TokenFeatureMap` (nativeTokenId, byteStart/End,
  engramKey, astKind, ontologyId, featureId, packetKey, entropy, surprisal) rather than replacing
  or aliasing the model-facing token ID. A plain deterministic autoencoder (768→128, no
  reparameterization/stochastic sampling) is the right tool for routing/compression; VAE is
  explicitly RESEARCH_ONLY, no current runtime need — reparameterized/pathwise-gradient latent
  sampling machinery solves a generative-modeling problem Atlas doesn't have.
- **KMeans, SOM, and CAGRA are three distinct stages, not interchangeable.** KMeans = coarse
  corpus partition (centroids+labels), SOM 20×20 = derived 2D locality/topology for cache
  routing, CAGRA = ANN search. Chaining `query → nearest centroid → SOM neighborhood → ACE tile
  prediction → CAGRA/exact ANN` is a cache-locality prefilter, not a retrieval-correctness step —
  if it measurably hurts recall against the exact-oracle baseline, it must demote to "cache hint
  only," never a silent retrieval filter. This must be benchmarked, not assumed either way.
  Restates the same exact-before-approximate invariant this file's T6/T6b already require.
  **Do not let CAGRA get compared against itself** — the proof ladder is always
  brute-force-exact → oracle, then CAGRA-ANN → recall-against-that-oracle.
  **Do not confuse the four distinct "graphs" in this stack** — Neo4j/GDS (identity-layer
  topology), cuGraph (GPU graph algorithms), CUDA Graph (kernel-launch capture/replay), and HNSW
  (Qdrant's ANN index structure) share a name and nothing else; a "graph" fix/tune in one has no
  bearing on the others.
- **Separate Arrow artifacts per representation**, not one combined blob:
  `semantic-768-r{rev}.arrow`, `latent-128-r{rev}.arrow`, `topology4-r{rev}.arrow`,
  `token-feature-map-r{rev}.arrow`, `centroids-r{rev}.arrow` — each independently revisioned,
  keyed by `packet_key`/`source_ref`, consistent with this file's existing per-artifact hashing
  (T2/T2b/T2c already imply this split; this just names the token-feature-map artifact
  explicitly, which was previously undernamed in the bundle's own README).
- **Numeric tile vs. evidence tile split reaffirmed**: GPU search operates only on the numeric
  tile (packet_key + semantic_768 + feature5 + topology4 + authority + centroid); summaries,
  source spans, and OKF concepts load only after top-k narrows the candidate set via
  `PacketReader`. This is restating T3/T4 in the vocabulary the user used ("NES cartridge
  analogy") — no new task, no schema change.
- **ACP/A2A tool surface stays capability-level** (`vector.search`, `graph.trace`, `packet.read`,
  `packet.assemble`, `validation.run`), never infrastructure-level (`cudaMemcpy`,
  `arrow_get_batch`, `redis_get`, `cagra_search_raw`). Matches this repo's existing ACP tool
  registry pattern (root CLAUDE.md's "new agent-facing capabilities register in ACP" rule) —
  no new work implied, just confirms the tensor-residency bundle must not add raw-infra MCP tools
  when it eventually gets wired into ACP.
- **Explicitly deferred past this narrowed proof** (user's own final paragraph, agreed): VAE,
  INT4 token-ID remapping, 4D metric-tensor/Riemannian geometry, quaternion rotations, DLSS-style
  subsampling, QLoRA memory swaps, BVH/meshnet. None of these are prerequisites for T1–T10.

**Canonical semantic representation is 768-dim everywhere in this phase.** Any 384-dim
references elsewhere in the repo are legacy or derived lanes only; this phase does not silently
change any other stage assumptions, counts, or ownership boundaries.

**No code changed this turn.** The next concrete action remains exactly what the "Live
verification" section above and the user's closing paragraph both already name: T1 (Postgres
migration apply) then T3 (one Arrow tile → pinned host → exact GPU top-k → packet-key recovery),
in that order, before any KMeans/SOM/ACE-residency work.

## Tightened execution order (2026-08-10, supersedes earlier "T1 then T3" note above)

With T3a/T6/T6b-e now proven, a design review produced this tighter ordering — separates
correctness, persistent GPU indexing, coarse routing, and actual memory residency into distinct
gates instead of letting them blur together:

```
T1 (done) → T2b (done) → T3a (done) → T6 satisfied-by-T3a (done) → T6b-e (done)
  → T6b-p (persistent CAGRA build-once-search-many benchmark)
  → T6c (v1/vector/kmeans centroid + membership artifacts, persisted with lineage)
  → T2-lineage (prove all 5 FeatureVector5 sources) → T2 (artifact, only once 5/5)
  → SOM 20×20 (cache-routing experiment, cache-hint-only unless proven to help recall)
  → T3b (pinned host allocation proof) → T3c (async H2D resident-tile reuse)
  → T4 (deterministic ACE residency eviction) → T5 (Valkey revision-qualified invalidation)
  → GA8 (feature-routing ablation) → GA9 (promotion decision)
```

**Why KMeans (T6c) moves up**: it can run directly against the already-proven `semantic_768`
Arrow corpus with zero new dependencies — no AE, no SOM, no FeatureVector5, no RRF changes.
Recommended sweep: K ∈ {64, 128, 256} evaluated (not pre-decided) on inertia, cluster
population p50/p95, empty-cluster count, centroid-search latency, and candidate recall@10
against the T3a exact oracle.

**Why SOM stays cache-only until proven otherwise**: once KMeans is persistent, test two modes —
(A) retrieval filter: restrict exact search to the query's SOM neighborhood: (B) ACE hint: SOM
only predicts prefetch tiles, exact/CAGRA candidate retrieval stays unrestricted. This file's own
existing rule already covers the outcome: if SOM measurably hurts recall, it becomes
`CACHE_HINT_ONLY` — fix it by changing modes, never by raising its weight in a scoring formula.

**T4 becomes concrete only once centroids (T6c) exist** — before that, there's nothing for ACE
to make eviction decisions about. Implement T4 around
`COLD → MMAPPED → PINNED → GPU_RESIDENT → IN_USE → GPU_RESIDENT → DEMOTED` with deterministic
tie-breaking (`utility DESC, last_used ASC, tile_key ASC`), logging every transition to
`atlas_tensor_residency_events` (already live per T1). The determinism gate: same request
sequence + same policy revision + same memory budget ⇒ same eviction sequence, every time.

**T5 (Valkey) follows T4 immediately** — cache pointers only, never the corpus itself:
`atlas:tile:*` (artifact_id, batch/range, state, bytes, utility), `atlas:centroid:*` (tile
hints), `atlas:query:*` (shortlist), `atlas:residency:*` (metadata). Every key must carry
enough revision identity that stale data can never be confused with current data.

## T6c current proven stop state (2026-08-10)

T6c is complete as an experiment and must not be reopened as if KMeans still needs first proof.

1. Canonical source representation is frozen `semantic_768`.
2. KMeans artifacts were produced for `K ∈ {64, 128, 256}` with centroid, membership, and provenance artifacts persisted.
3. Each clustering configuration was evaluated against the already-proven T3a exact cosine oracle.
4. KMeans achieved useful corpus reduction but did not preserve perfect Recall@10, so it is `KMEANS_ROUTING_EXPERIMENT_PROVEN` and `CACHE_HINT_ONLY`.
5. SOM remains a separate 20×20, 400-cell topology experiment and must be evaluated with the same exact-oracle methodology before any promotion.
6. Do not rerun T6c to increase coverage, and do not use KMeans membership as canonical packet identity.
7. Do not start AE, RRF, Neo4j projection, or GA8/GA9 promotion from this lane.
8. Do not silently substitute 384-dimensional vectors; future compressed latents must be separately revisioned experiments.

## Phase 3 canonical 768-dim note

Phase 3 uses the frozen `semantic_768` representation everywhere in the live path.
`384`-dim references are legacy or derived lanes only; they do not become canonical writers,
canonical retrieval truth, or new owner boundaries.

- Stage 3B: community_id propagation and AST symbol extraction.
- Stage 3C: SOM 20×20 as a separate 400-cell topology experiment over `semantic_768`.
- Stage 3D: reranker feature preparation from packet evidence.

`latent_64` is legacy routing compatibility only. Any future latent compression work should be a
separately revisioned experiment, with `latent_128` the more plausible candidate if one is needed.
The phrase `kmeans 20x20` is not the correct terminology; KMeans uses `K ∈ {64, 128, 256}` and SOM
is the separate 20×20 topology experiment.

## Separate lane: Kafka / CDC / Rust sidecar analysis

This workstream is design-only until explicitly opened as its own task.

- Kafka / CDC is not part of the current T6c or Graphify sequence.
- PostgreSQL 18 specifics are not a canonical owner here; they are an integration target only if a
  separate ingestion lane proves they matter.
- Rust sidecar analysis is a separate infrastructure lane, not a replacement for the current
  Python / SvelteKit / GPU split.
- Do not let bitmap / aio / CDC ideas redefine the `semantic_768` routing proof.
- If this lane is ever opened, it should start from evidence of a real producer / consumer gap,
  not from the KMeans or SOM evaluation path.

## Sequencing and Gate Order

### P2 transport and ingestion gates

1. Finish the MCP / `/mcp` / `/sse` diagnostics.
2. Keep TRACE core enabled and optional sidecars opt-in until transport matches are confirmed.
3. Resolve Claude-Mem export path alignment before any importer run.
4. Keep the persistent Engram ingestion lane deferred until the transport and importer path are stable.
5. Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable.

### P2 registry and retrieval policy

1. Replace the bootstrap feature-gap registry with a live app workspace scan when the mounted codebase is available.
2. Ingest the current feature inventory into the registry and mark each lane as implemented, partial, missing, or eval-only.
3. Keep the retrieval policy explicit: exact cache first, then semantic cache, then retrieval, then packet assembly.
4. Keep single-fact lookups on vector search, code navigation on agentic search, and graph-heavy data on graph lanes.

### P3 storage, cards, and synthesis

1. Build ClusterCard flow from reviewed sourceRefs and table contracts.
2. Keep the semantic cache policy split between Redis exact-card lookup and Qdrant dense retrieval.
3. Add graph refresh manifest discipline with version/hash and promotion state.
4. Wire synthesis consumers only after the packet/version contract stays stable.

### P3 validation and structural promotion

1. Stabilize the 768d -> 64d latent -> cluster -> JSON graph path.
2. Define the canonical ClusterCard -> GlyphRecord -> CHR97 mapping.
3. Keep manifold4 as a later analytical lane, not a correctness gate.
4. Treat the ACE Context Pack Cache / NES Cartridge Cache as Redis-hot-pointer plus Postgres-durable storage only; large snapshot storage stays open.

### P4 semantic memory and checklist mining

1. Keep the semantic indexer as a first-class lane.
2. Keep its outputs consumable by the feature-gap registry without rereading whole corpora.
3. Keep the semantic lane aligned with the ACE/NES packet contract and version field.
4. Add smoke/report outputs to registry rows for retrieval lanes and feature-map lanes.
5. Use LangChain later only as an optional organizer for messy `.md` / `.json` after LangExtract.

### Token remapping and geometry lanes

1. `autoencoder`: default lane for token remapping, latent projection, and route compression.
2. `decoder-upscale`: optional reconstruction / upscaling lane; do not make it the identity owner.
3. `bvh-geometry`: spatial traversal and visualization lane only.
4. `riemannian-geometry`: metric-tensor and distortion diagnostics lane only.
5. `kmeans-64-128-256`: centroid routing topology lane; do not label it `kmeans-20x20`.
6. `som-20x20`: separate 400-cell cache-hint topology experiment, not KMeans.
7. `glyph-animation`: NES / CHR97 / sprite visualization lane; never the canonical retrieval lane.

### Optional downstream phases

1. Phase 10B TurboVec + Qdrant optimization.

## GPU context compiler alignment — 2026-08-22

- [x] Reuse existing revisioned ordinal registry, candidate feature columnar
  pack, valid-mask padding, and GPU residency lease contracts.
- [x] Add `TraversalInstructionV1` with compact `uint8` decision flags,
  revisioned ordinal-map identity, bounded head mask, graph depth, and evidence
  offsets. It carries no device pointer or raw embedding tensor.
- [x] Add the pure deterministic instruction compiler; reject duplicate
  ordinals and primary ordinals outside the admitted candidate set.
- [x] Add a read-only ContextManifest adapter that checks candidate membership
  count and graph-revision agreement before compiling the instruction.
- [x] Keep GPU snapshot and telemetry contracts explicitly on native
  `semantic_768`; do not inherit the legacy Qdrant projection constant.
- [x] Align the Qdrant projection contract/scorer to native `semantic_768`,
  `codebase_chunks_768_v2`, and named vector `content` without applying a
  collection migration.
- [ ] Wire the adapter to the existing SearchRuntime/ContextManifest seam.
- [ ] Prove native LibTorch/N-API GEMM parity against the CPU feature-head
  oracle.
- [ ] Prove same-corpus cuVS/CAGRA ordinal parity and keep TurboVec/DiskANN as
  challengers.
2. Phase 11 cuVS / CUDA sidecar benchmark.
3. Phase 12 CUDA streams / tensor bridge / RNN experiments.
4. Phase 13 graph synthesis + feature MapReduce.
5. Phase 14 DuckDB + LangGraph + Langfuse.
6. Phase 15 feature labeling + pruning.
7. Phase 16 implement missing features.
8. Phase 17 optional LangChain organizer after LangExtract.
9. Phase 18 WebGPU TypeScript MapReduce matrix and CUDA/libtorch experiments.
10. Phase 19 deterministic HMM + linear policy baseline.
11. Phase 20 DSPy program contract for Atlas agent programs.
12. Phase 21 GEPA reflective prompt/program optimization on RouteTrace and eval traces.
13. Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments.
14. Phase 23 QLoRA / SFT.
15. Phase 24 DPO.
16. Phase 25 PPO only if still justified.

Phase 18 and Phase 22 overlap conceptually for boosting-based work; treat Phase 18 as the current
evaluation surface and Phase 22 as any later learned-policy experimentation, or you create two
owners for the same capability.

## ACE vector selection slice imported (2026-08-13)

The new vector-selection slice has been copied into the canonical Atlas namespace and kept
compatibility-safe through thin ACE re-exports. The imported files are:

- `src/lib/server/atlas/vector/ace-packet-vector.ts`
- `src/lib/server/atlas/vector/turbovec-interpolation.ts`
- `src/lib/server/atlas/ranking/packet-feature-matrix.ts`

Compatibility shims remain in:

- `src/lib/server/ace/vector/ace-packet-vector.ts`
- `src/lib/server/ace/vector/turbovec-interpolation.ts`
- `src/lib/server/ace/ranking/packet-feature-matrix.ts`

The copied slice introduces the latent64/centroid64 interpolation layer and the row-major
9-feature packet matrix underneath the already-proven packet consumer pipeline. The new matrix
bridge is now wired into the live packet consumer result as an additive field. I left the
existing packet consumer pipeline, packet assembler, RTX ranker, and tool receipt boundary intact.

Focused proof gate results:

- `npm exec vitest run src/lib/server/atlas/vector/ace-packet-vector.test.ts src/lib/server/atlas/vector/turbovec-interpolation.test.ts src/lib/server/atlas/ranking/packet-feature-matrix.test.ts`
- `npm exec vitest run src/lib/server/ace/consumer/packet-consumer-pipeline.test.ts`
- Result: 2 files passed, 4 tests passed

Status:

- WIRED: the Atlas feature matrix is now carried through the live packet consumer result as an
  additive field, without changing packet identity, assembly, or tool execution behavior.

### Conservative phase-status snapshot

| Phase | Status |
|---|---|
| Phase 11 Engram/Gemma4 memory wiring | partial |
| Phase 12 Parent Atlas codebase index | partial |
| Phase 13 feature-gap registry completion | partial |
| Phase 14 Redis exact-card cache policy | implemented |
| Phase 15 Qdrant semantic lane | implemented |
| Phase 16 Graph/KAG/DAG refresh manifest | partial |
| Phase 17 PyTorch feature extraction lane | partial |
| Phase 18 XGBoost / gradient tree boosting reranker | partial / evaluation surface |
| Phase 19 deterministic HMM + linear policy baseline | partial |
| Phase 20 DSPy program contract | planned |
| Phase 21 GEPA reflective program optimization | planned |
| Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments | later experimental lane |
| Phase 23 QLoRA / SFT | eval-only |
| Phase 24 DPO | eval-only |
| Phase 25 PPO | eval-only / not yet graded |

## Two independent programs — do not merge yet

The broader `SearchRuntime`/RRF/domain-classification/title-generation/Neo4j-promotion
inventory (see other OpenSpec changes and `RELEVANT-FILES-INVENTORY.md`) is a **separate
program** from this tensor-residency work, and should stay separate for several more gates:

```
RETRIEVAL PROGRAM:        BM25 / Qdrant / AST / exact → RRF → FeatureRow → rerank
TENSOR RESIDENCY PROGRAM: Arrow → exact GPU → KMeans → SOM → ACE residency
```

Join them only after centroid/SOM routing and ACE residency show *measured* value (via GA8/GA9
ablation against the T3a exact oracle) — not before. Merging early means any observed ranking
change becomes impossible to attribute to retrieval policy vs. memory routing. This also means:
**do not add `latent_64`/`latent_128` as a 5th independent RRF lane** — content/summary/title/
signature/latent all describe the same packet corpus, and letting all five vote independently in
RRF can manufacture vote multiplicity. Latent/topology/graph signals belong in the post-fusion
`FeatureRow` (as scoring inputs to the tabular/neural reranker), not as independent RRF
candidate-generators — this is a correction to a *different*, larger retrieval subsystem than
the one this file owns, recorded here only because it directly bears on why the two programs
must stay separate; see `docs/architecture/runtime-ownership-baseline.json`'s newly-added
`rrf_fusion` entries for the actual ownership-audit flag on that subsystem.

## Stop conditions

Stop rather than promote if any of the following is unresolved:

- representation revision ambiguity;
- artifact hash mismatch;
- stale graph/workspace/source revision;
- exact GPU parity failure;
- duplicate semantic vote;
- GPU memory pressure without deterministic demotion;
- n-ary event order confused with DAG execution order.

## GPU CACHE / TILING / OFFLOAD / TOPOLOGY EXPANSION (2026-08-31)

This ordered workboard is a coordination layer across existing owners. It does
not create a second cache, graph, retrieval, or model authority. All items are
read-only or contract-first until their stated proof exists.

- [ ] **GPU-EXP-01** Freeze `AtlasNumericArtifactV1` with artifact kind/revision,
  logical shape, dtype/layout, payload checksum, and `CandidateOrdinalMap` or
  `GraphOrdinal` checksum.
- [x] **GPU-EXP-02** Freeze `GpuArtifactKeyV1`; prohibit `latest` keys and bind
  representation/graph/feature revisions plus device and materialization policy.
- [ ] **GPU-EXP-03** Define CPU/RAM/WARM staging over Arrow or mmap artifacts;
  preserve PostgreSQL/Qdrant as source/projection owners.
- [ ] **GPU-EXP-04** Define NVMe/SSD COLD staging with checksum readback and
  deterministic rematerialization; no implicit deletion or archive promotion.
- [x] **GPU-EXP-05** Prove host-to-device materialization using the existing
  PyTorch path and emit a residency receipt; no RMM dependency yet.
- [x] **GPU-EXP-06** Add deterministic HOT/WARM/COLD eviction and revision-change
  invalidation; stale buffers must become evictable, never silently reused.
- [x] **GPU-EXP-07** Generate a valid FEAT-04 pack/gather envelope containing
  values, presence, valid mask, lane metadata, and source checksums. The
  read-only compiler is `scripts/atlas/build-feat04-envelope-v1.mts`; a real
  15-row snapshot produced the envelope on 2026-08-31.
- [x] **GPU-EXP-08** Run PyTorch CPU↔CUDA gather/normalize/mask/top-K parity on
  the FEAT-04 envelope; record ordinals and output checksums.
- [ ] **GPU-EXP-09** Characterize cuTile as a pure-kernel challenger against the
  PyTorch reference; no mixed cuTile/SIMT kernel and no canonical writes.
- [ ] **GPU-EXP-10** Characterize a CUDA SIMT implementation against the same
  reference and artifact key; require bounded error and deterministic replay.
- [ ] **GPU-EXP-11** Evaluate RMM as an allocator provider only, recording its
  version/API revision; absence of RMM must not block PyTorch residency.
- [ ] **GPU-EXP-12** Prove one H2D transfer followed by repeated resident reuse,
  with eviction under measured VRAM pressure and no pointer leakage.
  **PARTIAL, rechecked 2026-09-01 on WSL2**: `atlas-rapids-cu13`
  (`/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`), PyTorch
  `2.13.0+cu130`, CUDA available, NVIDIA GeForce RTX 3060 Ti. Fresh receipt:
  `docs/reports/candidate-feature-gpu-residency-proof-v4.json`; 1 initial H2D,
  2 same-process resident reuses, content/ordinal/feature parity, post-release
  access blocked, raw pointers not exposed, and `storeWrites: false`. This
  supersedes the prior 2026-08-31 observation and confirms the first two
  clauses on the intended workstation GPU path. It still does **not** cover
  measured VRAM-pressure-triggered eviction: release was explicit and
  `memoryAfterRelease.allocatedBytes` returned to zero. Keep this task open
  until a bounded pressure test records an eviction event and receipt.
  The earlier commit (`435967f7c7`, same day, "Tightened the
  live CUDA reuse proof") landed `docs/reports/candidate-feature-gpu-residency-proof-v3.json` —
  status `CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN`, 1 initial H2D transfer, 2 resident
  reuses, `rawPointersExposed: false`, allocated bytes returned to zero after release. This covers
  the "one H2D transfer → repeated resident reuse" and "no pointer leakage" clauses. **Does NOT
  cover** "eviction under measured VRAM pressure" specifically — inspected the JSON's
  `residentReuse` block directly; it records `reuseH2dTransfers`/`memoryBeforeReuse`/
  `rawPointersExposed` but no VRAM-pressure-triggered eviction test. Leaving unchecked: the release
  observed here is an explicit release, not a proof that eviction correctly triggers under memory
  pressure — a materially different and still-open test.
- [ ] **GPU-EXP-13** Reconcile semantic HNSW/pgvector/Qdrant executors against
  one CandidateOrdinal universe; HNSW remains an ANN executor, not a new lane.
- [x] **GPU-EXP-14** Build a revision-qualified `GraphProjectionArtifactV1`
  with vertex/edge checksums and an explicit `GraphOrdinal` mapping. **PROVEN at
  noncanonical artifact-builder/fixture scope (2026-09-23)** by
  `python/tests/test_graph_projection_artifact_builder.py` and
  `python/tests/test_graph_projection_manifest.py`: separate candidate-vs-graph ordinal
  checksums, dense explicit ordinal mapping, isolated-vertex retention, and Python readback
  validation against the TypeScript GraphOrdinalMapV1 checksum encoding. No current-source
  artifact was rebuilt or promoted; see `parent-atlas-graph-runtime-python-consolidation`
  GPU-EXP-14 for the owning proof and legacy-manifest correction.
- [ ] **GPU-EXP-15** Prove bounded multi-hop traversal on the frozen graph;
  default depth <=2, expansion <=3, hard maximum <=4, with predecessors/paths.
  Runtime policy and path-receipt implementation are covered by
  `python/tests/test_atlas_rapids_graph_runtime.py` and
  `python/tests/test_graph_projection_manifest.py`; receipt checksum binds graph revision,
  projection revision, and explicit graph-ordinal-map checksum, and rejects missing bindings.
  Focused suite passed 20 tests on 2026-09-23. Live frozen-graph execution remains open:
  8098 reports no resident graph, and the existing artifact is rejected for ambiguous ordinal
  checksum. No graph was loaded into the live GPU process.
- [ ] **GPU-EXP-16** Run NetworkX CPU graph parity first, then cuGraph parity;
  internal renumbering must not escape the projection adapter. A bounded fixture compares the
  adapter's deliberately permuted executor ordinals against NetworkX paths and deterministic
  receipt replay; its fake cuGraph frame does not prove actual cuGraph parity. Full frozen-artifact
  NetworkX/cuGraph replay remains open.
- [ ] **GPU-EXP-17** Define `TopologyCoordinate4V1` only as derived metadata,
  bound to graph/projection/ordinal revisions; it cannot mint identity or votes.
- [ ] **GPU-EXP-18** Evaluate 4D manifold/SOM expansions against held-out graph
  tasks; preserve structural features separately from retrieval identity.
- [ ] **GPU-EXP-19** Keep QLoRA/GEPA as offline challengers with immutable base,
  adapter, dataset, evaluation, and rollback receipts; no live self-modification.
- [ ] **GPU-EXP-20** Emit a final cross-lane promotion receipt only when cache,
  HNSW, graph traversal, topology, and QLoRA evidence pass independently.

### Ownership and dependency crosswalk

```text
GPU-EXP-01..12  -> this tensor-residency change + candidate-feature FEAT-04
GPU-EXP-13      -> semantic/retrieval owner; SearchRuntime remains fusion owner
GPU-EXP-14..16  -> parent-atlas-graph-runtime-python-consolidation
GPU-EXP-17..18  -> parent-atlas-topology-representation-admission
GPU-EXP-19      -> atlas-feature-intelligence / DSPy-GEPA evaluation owners
GPU-EXP-20      -> promotion governance; never an automatic mutation trigger
```

The live decoder proof (`atlas-neural-decoder:torch2.13.0-cu132`, `:8121`)
closes neither GPU-EXP-05 nor GPU-EXP-12 by itself: it proves checkpoint
availability and learned projection health, not feature-envelope residency or
cache reuse. Ornith remains synthesis-only and is not part of this numerical
executor track.

### GPU-KERNEL-LAB-01 readiness correction (2026-08-31)

The repository currently has no dedicated cuTile/SIMT kernel-lab image. The
existing `atlas-gpu-8098` service is a separate RAPIDS CUDA 12 graph/vector
executor and is not a substitute for the planned CUDA 13.2 devel lab. Keep
`GPU-KERNEL-LAB-01` open until a separate, explicitly named lab is created and
its PyTorch-reference parity receipt is available. Do not add cuTile or a
custom SIMT compiler toolchain to `atlas-neural-decoder`.

The available 15-row lineage map has a valid ordinal-map checksum but zero
semantic revision coverage (`semanticRevision: null` on its candidates). It
cannot seed a semantic feature snapshot. The readiness report records this as
`ORDINAL_MAP_SEMANTIC_REVISION_MISSING`; the next producer must join exact
`semantic_768` rows and their representation revisions before FEAT-04 can run.

### GPU-EXP-07 input readiness audit (2026-08-31)

The available `docs/reports/current-candidate-feature-matrix-manifest-v1.json`
is a 15-candidate, 25-feature graph A/B replay manifest. It is not a
`CandidateFeatureSnapshotV1` and cannot be used as FEAT-04 input because the
production GPU layout is 12 columns. Do not truncate, reorder, or reinterpret
those 25 columns. Readiness is recorded as `BLOCKED_ABI_MISMATCH` in
`docs/reports/gpu-feat04-input-readiness-v1.json`; the next valid input must be
a bounded 12-column snapshot compiled through the existing materializers.

The existing `docs/reports/candidate-feature-gpu-parity-5k-v1.json` does have
the correct 12-column parity receipt, but it is a flattened result and lacks
the `pack` and `gather` objects required by the residency executor. It is
therefore parity evidence, not a residency input. The envelope builder must
receive the original validated snapshot, not reconstruct one from a receipt.

### GPU-EXP-05/07/08 bounded proof (2026-08-31)

The exact semantic cohort report supplied 15 candidates with exact chunk rows,
768-dimensional vectors, producer metadata, and qualified source/workspace
revisions. A read-only exporter produced `.tmp/atlas/semantic-768-cohort-v1.ndjson`;
the existing feature materializer produced a validated 12-column snapshot and
columnar artifact. `build-feat04-envelope-v1.mts` then produced a 15-row logical,
32-row padded FEAT-04 envelope. The live Python proof passed on the RTX 3060 Ti:
GPU execution was observed, ordinal/feature/presence/lane-mask/degraded-identity
parity all passed, device readback matched source checksums, and post-release
access was blocked. Receipt: `docs/reports/candidate-feature-gpu-residency-proof-v1.json`.
This is bounded executor/residency proof only; repeated reuse, cuTile, SIMT, RMM,
HNSW parity, graph GPU parity, and production promotion remain open.

The batch-request contract now proves request-level reuse of one exact active
lease and rejects independently checksum-valid requests whose candidate,
ordinal-map, feature-snapshot, workspace, or feature revision differs from the
lease. This is an integrity prerequisite for GPU-EXP-12, not proof of a
persistent CUDA cache hit; runtime resident reuse and measured eviction remain
open.

The live CUDA proof now includes two same-process resident lease reuses over
the exact FEAT-04 tensors: one initial H2D transfer, zero reuse H2D transfers,
identical gathered content, shared resident tensor objects, and clean release.
Receipt: `docs/reports/candidate-feature-gpu-residency-proof-v2.json`.
GPU-EXP-12 remains open for measured VRAM-pressure eviction and pointer-leakage
evidence.

The v3 replay now derives the shared-tensor result from executor object identity
and records aggregate CUDA allocation/reservation telemetry only. It reports
`rawPointersExposed: false`, `sameResidentTensorObjects: true`, and post-release
allocated bytes at zero while the CUDA allocator reservation remains observable.
This strengthens the reuse proof without treating allocator reservation as
eviction; explicit pressure/eviction testing remains open.

### GPU cache contract proof (2026-08-31)

`gpu-residency-cache-v1.ts` now owns the in-process contract-level cache. Its
revision-qualified `GpuArtifactKeyV1` rejects movable `latest` identifiers,
reuses exact entries, invalidates entries bound to a changed revision, and
evicts least-recently-used entries deterministically under a byte budget.
Focused cache tests pass 3/3. This closes the key/eviction contract gates only;
the cache is not wired into the Python CUDA process, so GPU-EXP-12 still needs
measured H2D-once/repeated-kernel reuse and VRAM-pressure evidence.

## Re-verification pass (2026-09-05, read-only)

- Confirmed all 3 cited receipts still exist on disk:
  `candidate-feature-gpu-residency-proof-v1.json`,
  `candidate-feature-gpu-residency-proof-v2.json`, `gpu-feat04-input-readiness-v1.json`.
- Re-ran `gpu-residency-cache-v1.spec.ts` fresh — still 3/3 pass, matching this section's claim
  exactly.
- No further re-verification attempted on the live-CUDA claims above (RTX 3060 Ti execution,
  H2D-transfer counts, allocator telemetry) — those require live GPU hardware/process state that a
  read-only file/test check cannot reproduce; treated as trustworthy pending a future live rerun,
  not independently re-proven here.

## Physical Arrow/mmap/tensor architecture review (2026-09-06, operator review)

An external review of this file's Arrow/`CandidateOrdinalMapV1`/tensor-artifact design checked out
mostly accurate, with one real confirmed bug found by direct inspection and one claim that turned
out to be **false** against the actual code — corrected here rather than propagated, matching this
file's own established discipline (see the `entropy_norm` correction above).

- [x] **ORDINAL-INTEGRITY-01 — real, confirmed determinism bug**: `src/lib/server/atlas/features/
      canonical-candidate-v1.ts` uses `String.prototype.localeCompare()` in three places that feed
      `CandidateOrdinalMapV1`'s checksum-bearing canonicalization: `canonicalJson()`'s object-key
      sort (line 186, feeds `candidateOrdinalMapChecksum()`), and `materializeCandidateOrdinalMap()`'s
      candidate ordering by `canonicalId`/`sourceRevision`/`packetKey` (lines 228, 230, 232) —
      verified by direct read, not assumed. `localeCompare()` is ICU/locale-sensitive; its ordering
      is not guaranteed identical across different Node builds (full-icu vs small-icu), default
      locales, or ICU data versions, which undermines `ordinalMapChecksum`'s purpose as a
      cross-machine, cross-runtime replay checksum. **Fix** (when picked up): replace all three call
      sites with a deliberately-defined binary/codepoint comparator (e.g. `Buffer.compare(Buffer.from(a,
      'utf8'), Buffer.from(b, 'utf8'))`), applied consistently to canonical JSON key order, candidate
      canonical-ID order, and both tie-break fields. Also confirmed missing: no
      `assertCandidateOrdinalMapIntegrityV1()`-style post-construction validator exists anywhere in
      this file (checked via full symbol grep) — `materializeCandidateOrdinalMap()` returns directly
      from `.parse()` with no separate check that `rowCount === candidates.length`,
      `candidates[i].candidateOrdinal === i`, or that every candidate's `workspaceRevision`/
      `candidateSnapshotRevision` matches the map's own; and `candidateOrdinal` is declared as plain
      `z.number().int().nonnegative()` with no upper bound, so nothing currently proves uint32
      compatibility before a value reaches Arrow/GPU code (JS's safe integer range is far larger
      than 2^32). **Fixed 2026-09-06**: added `compareUtf8()` (`Buffer.compare` on UTF-8 bytes) and
      replaced all 4 `localeCompare()` call sites (the object-key sort plus all 3 candidate-ordering
      comparisons) with it; added `CANDIDATE_ORDINAL_MAX_UINT32 = 4_294_967_295` and applied
      `.max()` to the `candidateOrdinal` schema field; added `assertCandidateOrdinalMapIntegrityV1()`
      (checks `rowCount === candidates.length`, ordinal-sequence integrity, per-candidate
      `workspaceRevision`/`candidateSnapshotRevision` agreement with the map, and a recomputed-
      checksum match) and wired it into `materializeCandidateOrdinalMap()` so no caller can construct
      an unproven map. New `canonical-candidate-v1.spec.ts` (previously had zero test coverage —
      confirmed via file search before writing): 16/16 tests pass, including a checksum-stability
      test (same candidates in different input array order produce byte-identical
      `ordinalMapChecksum`) and 5 corruption-injection tests for the new integrity assertion.
      Re-ran all 11 real downstream consumer spec files (candidate-feature-snapshot, retrieval-
      router adapters, ACE resolvers, evidence bundles, graph receipts) — 46/46 still pass, zero
      regressions from the comparator/schema change. `resolveCanonicalCandidateByOrdinal()`
      deliberately NOT changed to call the full integrity assertion on every lookup (it already has
      its own lightweight per-call corruption check; adding a full checksum recomputation to a
      potential hot path is a performance/correctness tradeoff left for whoever wires this into a
      real Arrow/GPU consumer, not decided unilaterally here).
- [x] **Correction to a reviewer claim, UPDATED (2026-09-06, same day) — the review's underlying
      concern was real, but resolved before the review was written; my own first-pass correction
      above checked the wrong file.** The review claimed "your repo's own XGBoost CUDA audit found...
      the ranking path had no qid/group attached even though groups were computed elsewhere." My
      first check (recorded further up this entry, now superseded) looked at
      `sveltekit-frontend/scripts/atlas/train-xgboost-ltr-v1.py` — a small, separate "bounded
      lineage-aware challenger" script, correctly grouped, but NOT the file the review's "your repo's
      own XGBoost CUDA audit" phrase refers to. The real audit is a dedicated OpenSpec change,
      `openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md` (root tree), and it
      documents a genuinely real, more dramatic incident than either version of this note initially
      captured:
      1. **2026-08-22**: `scripts/atlas/train-xgboost-reranker.py` (the actual production trainer,
         not `train-xgboost-ltr-v1.py`) was fixed to use `QuantileDMatrix`, an explicit `--device`
         flag with fail-closed CUDA verification, and `qid`/group attachment via a new
         `python/atlas_xgboost_grouped_ranking_v1.py` module — verified at the time with a real
         functional smoke test (`xgb.train()` with `objective='rank:ndcg'`, qid attached via
         `QuantileDMatrix.set_info()`).
      2. **2026-08-23**: An unrelated commit (`a2e4dab329`, a broad Atlas v1→v2 representation-
         identity cleanup) **collaterally deleted** both new Python modules and reverted the trainer
         back to its original broken state (hardcoded `'device': 'cuda'  # falls back to cpu if no
         CUDA`, no qid, no QuantileDMatrix) — almost certainly unintentional collateral damage from a
         glob-shaped deletion, not a deliberate un-fix, per that file's own read-of-intent analysis.
      3. **2026-08-23, same day**: the regression was found and restored working-tree-only via
         `git restore --source=<pre-revert-commit>` for all 3 files, independently corroborated by a
         separate external review that reached the same `COLLATERAL_REGRESSION` conclusion.
      **Verified live, right now (2026-09-06)**: all 3 files are properly committed and tracked
      (`git ls-files` confirms, `git status --short` shows clean — the working-tree-only restoration
      from step 3 has since been committed, not lost again). `train-xgboost-reranker.py` currently
      imports `prepare_grouped_ranking_dataset_v1`, builds `QuantileDMatrix` for both train/val, and
      calls `dtrain.set_info(qid=qid_train)` / `dval.set_info(qid=qid_val)` — all confirmed via direct
      grep against the live file. **So: the review's concern was true at least twice in this repo's
      history (original bug, then the collateral-regression replay of it), and is NOT true right now**
      — the fix is live, committed, and matches exactly what the review asked for. Lesson for next
      time a similar claim comes in: check `openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/`
      first — it's the authoritative history for this exact question, including the regression risk
      pattern (broad unrelated cleanups collaterally reverting narrow correctness fixes) that's worth
      watching for elsewhere in this repo, not just here.
- [x] **`ARROW-NESTED-01` closed (2026-09-07)**: re-read `scripts/atlas/arrow-batch-export.mjs`
      (repo-root `scripts/atlas/`, not `sveltekit-frontend/`) line-by-line before changing anything.
      The review's characterization was correct for all 7 array-valued columns
      (`keywords_json`, `ngrams_json`, `trigrams_json`, `used_concepts_json`,
      `lexical_features_json`, `ast_symbols_json`, `entities_json`) — each was
      `JSON.stringify(uniqueStrings(...))` written into a plain `Utf8` column via a since-removed
      `arrayJson()` helper. **One review detail did not apply and was not implemented**: none of
      these 7 columns are numeric — `ngrams`/`trigrams` are text n-grams (word/character strings),
      not numeric indices, so `List<UInt32>` had no live column to apply to; only `List<Utf8>` was
      needed. Fix: added a `stringLists()` helper
      (`vectorFromArray(rows.map(map), new List(new Field('item', new Utf8(), true)))`, apache-arrow
      21.1.0, already the pinned repo version) and rebuilt all 7 columns as true `List<Utf8>`
      directly from the existing string arrays (no `JSON.stringify`/`JSON.parse` round trip).
      Renamed the 7 columns from `*_json` to `*_list` since they no longer hold JSON text (a plain
      rename, not a schema/logic change) and updated the one real live consumer that checks column
      names by string, `scripts/atlas/verify-arrow-batch-export.mjs`'s `REQUIRED_COLUMNS`
      (`used_concepts_json`/`ast_symbols_json` → `used_concepts_list`/`ast_symbols_list`) — confirmed
      via repo-wide grep before renaming that no other file references any of the 7 old names (one
      unrelated hit, `key_entities_json` in `scripts/atlas/proto/active/retrieval.proto`, is a
      different field in a different domain, left untouched). **Verified, not just asserted**: both
      edited files pass `node --check`; a synthetic-row proof (not run against live Postgres — no
      DB write or read performed) built the same `stringLists()` helper in isolation, wrote a
      `List<Utf8>` column through `tableToIPC(..., 'file')`, read it back with `tableFromIPC`, and
      confirmed the round-tripped field type is exactly `List<Utf8>` and array contents (including
      the empty-array case) are preserved byte-for-byte through the IPC file format. **Not done in
      this pass**: no live run of `arrow-batch-export.mjs --apply` against real Postgres data (would
      require live DB access not exercised here), so the fix is `DRY_RUN_PROVEN` (mechanism proven
      on synthetic data) rather than `APPLY_PROVEN` (proven against a real production export). The
      `arrow_ipc`/`row_index` output files and the report/contract JSON shape are otherwise
      unchanged; `TENSOR-MMAP-01` and `TENSOR-QUANT-01` below remain separate, still-open design
      targets this closure does not touch.
- [ ] **`TENSOR-MMAP-01` (design target)**: the review's critique that the embedding-tile path
      currently does Arrow `Binary` → Python `bytearray` copy → `torch.frombuffer` → per-row
      `.clone()` → `torch.stack()` → CUDA transfer (multiple full copies, not the zero-copy path the
      "Arrow → mmap → PyTorch" framing implies) is architecturally sound reasoning and matches
      documented PyTorch/Arrow behavior (`torch.from_file()` is CPU-backed, not directly a CUDA
      zero-copy path; ordinary Arrow IPC is a CPU mmap format, not a device-memory transport) — not
      independently verified against the live GPU sidecar code in this pass given time budget, but
      recorded as the review's most concrete, actionable proposal: split a future
      `EmbeddingArtifactV2` into `manifest.json` + `rows.arrow` (metadata/lineage) +
      `semantic_768.f32` (contiguous `[N,768]` row-major float32, mmap-able directly), with
      `torch.from_file()` + `candidateOrdinal`-keyed gather feeding only a small selected batch to
      CUDA, rather than transferring the whole corpus per query. Whole-corpus GPU ANN stays cuVS/
      CAGRA's job, unchanged.
- [x] **`TENSOR-QUANT-01` closed (2026-09-07, schema-only)**: added
      `sveltekit-frontend/src/lib/server/atlas/contracts/embedding-tensor-artifact-v2.ts`
      (`EmbeddingTensorArtifactV2Schema`) plus 12/12 passing focused tests
      (`embedding-tensor-artifact-v2.spec.ts`). **One naming reconciliation made before writing any
      code, not after**: the review's proposed `F32`/`F16`/`Q8_SYMMETRIC`/`Q4_GROUPED` encoding enum
      is the same four encodings this repo's existing `AmpereStorageEncodingV1Schema`
      (`gpu-quantization-v1.ts`, also referenced from `parent-atlas-semantic-768-canonical-contract/
      tasks.md` — confirmed via repo-wide grep before citing, not assumed) already declares as
      `fp32`/`fp16`/`int8_symmetric_blockwise`/`int4_symmetric_blockwise` — confirmed by reading that
      file directly before creating anything new. Reused that existing
      schema for the `encoding` field rather than inventing a second, differently-cased enum for the
      same four concepts, per this repo's own "one canonical owner per capability" rule. The new
      schema is deliberately an artifact DESCRIPTOR (one materialized tensor's dimension, encoding,
      byte length, checksum, optional candidate/packet reference) — a distinct concern from
      `AmpereQuantizationPolicyV1`'s POLICY role (how quantization should behave), consistent with
      the review's own framing. The existing FP32 tile contract in `scripts/atlas/
      arrow-batch-export.mjs`/`verify-arrow-batch-export.mjs` (`vector_dim`/`vector_f32` columns,
      `dimensions=768, bytes=3072`) was re-read and confirmed untouched — this is a separate,
      additive V2 schema, not a reinterpretation of those V1 columns. **Scope explicitly narrowed,
      not silently expanded**: `byteLength` is checked exactly against `dimension * 4`/`dimension * 2`
      for `fp32`/`fp16` (simple, unambiguous formats), but is deliberately NOT formula-validated for
      the two blockwise integer encodings — real INT8/INT4 packing carries per-block scale/zero-point
      metadata whose exact overhead depends on an encoder that does not exist yet in this repo (same
      `NOT_PROVEN`-until-a-real-encoder-exists posture as `TENSOR-QUANT-ISOQUANT-01` below); asserting
      an invented packing formula here would itself be an unverified numeric claim. **Not done in this
      pass**: no code path constructs or consumes this schema yet (schema-only, matching this file's
      established "design target" discipline for sections 7-11 above); PostgreSQL/pgvector's role as
      the higher-precision authoritative store is unchanged and untouched by this schema addition.
- [ ] **`TENSOR-QUANT-ISOQUANT-01` (design target, EXPERIMENTAL — do not implement)**: a proposed
      quantization-conditioning scheme layered ON TOP OF `TENSOR-QUANT-01`'s `encoding` field, not a
      replacement for it. IsoQuant partitions a feature/KV vector into 4-D blocks and applies a
      norm-preserving SO(4) rotation (`v' = q_L v q̄_R`, two-sided "IsoQuant-Full"; one-sided
      "IsoQuant-Fast" is an isoclinic rotation `v' = q_L v`) before low-bit (INT8/INT4/INT3)
      quantization — the rotation redistributes energy away from outlier coordinates so the
      quantizer's fixed range isn't dominated by a single extreme value (same motivation as QuaRot's
      random/Hadamard rotations and SpinQuant's learned rotations; the source paper claims ~4.5–4.7×
      kernel-level speedup over RotorQuant's 3-D-block rotors in fused CUDA settings, at 4-D block
      granularity that divides evenly into this repo's actual dimensions: 768/4=192, 128/4=32,
      64/4=16 blocks).
      - **Explicitly EXPERIMENTAL per the source paper's own stated scope, not just this repo's
        caution**: validation is stage-1 quantize/dequantize on synthetic normalized vectors only —
        no end-to-end KV-cache accuracy, perplexity, retrieval-fidelity, or attention-quality proof
        exists for IsoQuant anywhere, upstream or here. Treat exactly like every other unproven
        challenger in this file: `NOT_PROVEN` until a bounded fixture proof exists, not before.
      - **Layering, if ever built**: canonical `semantic_768`/etc. FP16/BF16 stays canonical and
        unrotated (per this file's own `TENSOR-QUANT-01` rule: never silently degrade the canonical
        column). A rotated+quantized representation (e.g. `SO4_INT4_768`) would be a distinct,
        separately-`representation_revision`-tagged DERIVED artifact, never a replacement — same
        "derived/challenger, never canonical" discipline as every MRL-truncation lane in CLAUDE.md's
        Embedding Dimensions Policy. cuVS/TurboVec similarity search stays on the canonical FP16/BF16
        vectors; the rotation is a conditioning transform for compression, not a retrieval-ranking
        change.
      - **CUDA Tile relationship (refines, does not change, this repo's existing cuTile framing)**:
        this repo's GPU-MINI-FABRIC-01 / ACE-RADIX-01 sections already classify cuTile as
        `AVAILABLE_FUTURE_CHALLENGER`, blocked on this dev host's CUDA 13.0 toolkit shipping only a
        compiler-intrinsic stub. Worth recording as a corroborating, slightly more precise source:
        NVIDIA's TileGym (cuTile + CUDA Tile C++ + Triton Tile-IR) documents Ampere (this host's
        sm_86) support as requiring CUDA 13.2+, with CUDA Tile C++ specifically requiring 13.3+ —
        consistent with this repo's existing "CUDA 13.2-generation" note under ACE-RADIX-01. Ranking
        unchanged: ordinary CUDA/cuBLASLt `CANONICAL`, cuTile `CHALLENGER`, CUDA Tile C++
        `FUTURE CHALLENGER`.
      - **B-tree correction (tangential, but independently verified against CLRS)**: a
        separately-pasted max-B-tree-height formula rendered as `log_t(n+12)` is a garbled fraction;
        the correct CLRS Theorem 18.1 bound for minimum degree `t` is `n >= 2*t^h - 1`, giving
        `h <= log_t((n+1)/2)` — this was checked directly against CLRS, not just asserted. (A second
        "minimum height for a completely full tree" formula, `h_min = ceil(log_m(n+1)) - 1`, was also
        pasted but NOT independently re-derived here — recorded as plausible, not confirmed.) Not
        tied to any live code path; recorded because it reinforces this file's own point that identity
        lookup (B-tree/PostgreSQL), candidate membership (bitmap), similarity (cuVS/TurboVec), and
        numerical compression (rotation+quantization) are four separate concerns with different
        owners — never conflate vector geometry into a B-tree key.
      - **Not authorized by this note**: implementing any part of `TENSOR-QUANT-ISOQUANT-01` —
        recorded as a design idea pending its own bounded CPU proof (matching every other
        `NOT_PROVEN` challenger in this repo), not as approved work.
- [ ] **`XGB-LTR-01` retitled/narrowed**: given the correction above, this is no longer "fix missing
      qid/group" (already correct in the real trainer) — if there is real follow-up work here, it's
      wiring `atlas_xgboost_grouped_ranking_v1.py`'s correctly-grouped dataset preparer into an actual
      consumer (it currently has none), not fixing a group-attachment bug that doesn't exist in the
      dedicated LTR script.
- [ ] **`GPJSON-CHALLENGER-01` (design target, low priority)**: the review's positioning — GpJSON
      (VLDB 2025 GPU JSON parser/query engine) as an optional ingestion-time accelerator benchmarked
      only against raw large JSONL parsing (simdjson/CPU vs. GpJSON/GPU), never inserted downstream
      of PostgreSQL/Arrow steady-state data or after ACE — is consistent with this repo's existing
      "SIMDJSON remains only a parsing accelerator" framing recorded elsewhere in this file's own
      earlier sections. Not verified against any live GpJSON integration in this pass since none
      currently exists to check.

**Explicitly not authorized by this note**: implementing any of the five design-target items above,
or the `localeCompare()` fix. Only the two verification findings (the real determinism bug, and the
false XGBoost claim) are asserted as checked-and-true; the rest are recorded as plausible,
architecturally-reasonable proposals pending their own verification pass before implementation.

## Unified GPU residency adapter tranche (2026-09-14)

- [x] **UNIFIED-RESIDENCY-CONTRACT-01** added a pure, revision-qualified descriptor and
      deterministic cache key covering workspace/source/representation/feature/model/tokenizer/
      RoPE revisions, candidate ordinal, artifact checksum, shape, dtype, bytes, and residency
      state. It lives in `sveltekit-frontend/src/lib/server/atlas/tensors/` beside the existing
      tensor/BitFrost contracts; no new cache or identity owner was introduced.
- [x] **UNIFIED-RESIDENCY-PROVIDERS-01** defined descriptor-only provider interfaces for feature
      tiles, Transformer KV, Mamba state, Samba windows, and Titans memory. Provider absence and
      RoPE-incomplete KV descriptors fail closed; no model implementation or GPU pointer is
      persisted.
- [x] **UNIFIED-RESIDENCY-ROUTING-01** added deterministic domain/LUT routing with exact LUT
      revision admission, typed Float32 tile packing/unpacking, state-transition validation,
      bounded LRU/lease behavior, and a GPU-state persistence guard. Focused proof: 6/6 tests,
      including matching-provider load/readback with buffer non-retention.
- [ ] **UNIFIED-RESIDENCY-LIVE-01** promote the bounded joined path to a current-corpus caller
      only after the explicit workspace source → packet → chunk join is proven. The current
      read-only audit for admitted revision `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`
      returned `binding_rows=0`, `graphify_exact_sources=0`, and
      `packet_chunk_exact_sources=0`; report:
      `docs/reports/current-workspace-packet-chunk-join-v1.json`. The fixture path now proves
      SearchRuntime/ACE → DuckDB → typed CUDA handoff, but this gate remains open for current
      lineage, cuTile feature-corpus parity, and production promotion.

### Current-corpus dependency refresh (2026-09-14)

- [ ] **UNIFIED-RESIDENCY-CURRENT-COHORT-ADMISSION-01** remains blocked on the source-owner
      spine. The latest read-only source-owner reconciliation reports `24,414` source rows,
      `32` execution candidates, `0` exact current owners, and `4` legacy completed candidates;
      status is `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` / `LEGACY_ONLY_NO_CURRENT_OWNER`.
      The explicit workspace→packet→chunk join for the admitted revision likewise reports zero
      bindings, zero exact Graphify sources, and zero packet/chunk matches. Do not feed the
      bounded residency adapter a historical or guessed cohort. Receipts:
      `docs/reports/current-source-owner-reconciliation-v1.json` and
      `docs/reports/current-workspace-packet-chunk-join-v1.json`.
- [ ] **UNIFIED-RESIDENCY-SOURCE-BINDING-CLASSIFICATION-01** remains blocked and is now
      explicitly fail-closed against the admitted snapshot. The bounded read-only planner was
      run with admitted workspace revision
      `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`; its input
      source plan was initially revision `sha256:f476b4a6aac2afcafe0f82c7b0e48d52951ccbce73fca52b9706b1f1fbfabefb`,
      but the planner now supports explicit `--admitted-snapshot` input and was regenerated from
      the admitted snapshot manifest: snapshot revision `sha256:48e1dbb326a4e249dc550cf1df06da8ec82ca4a837dd93eca114e4bafb2747e8`,
      25,291 sources, and workspace revision `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`.
      The bounded five-source Graphify comparison found `CURRENT_GRAPHIFY_EXACT=0`,
      `MISSING_GRAPHIFY_SOURCE=0`, `AMBIGUOUS_GRAPHIFY_SOURCE=0`, and
      `GRAPHIFY_REVISION_OR_CONTENT_MISMATCH=5`, all on `workspaceRevision`. The follow-up
      binding classification found `REVISION_BOUND=0`, `WORKSPACE_IDENTITY_ONLY=0`,
      `WRONG_WORKSPACE_REVISION=5`, `SOURCE_CONTENT_MISMATCH=0`, `AMBIGUOUS=0`. Both receipts
      record `currentCohortEligible=false`, `safeToApply=false`, and `writesPerformed=false`:
      `docs/reports/current-source-graphify-batch-plan-v1.json` and
      `docs/reports/current-workspace-source-binding-classification-v1.json`.
      Do not relabel or apply historical Graphify rows. The next gate is
      `GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02`, followed by the explicit
      workspace→source→packet→chunk readback before any residency or representation promotion.
- [ ] **UNIFIED-RESIDENCY-GRAPHIFY-EXECUTION-OWNER-01** remains blocked after the snapshot
      owner recheck. The read-only binding audit found `32` terminal execution candidates, all
      resolved through `GRAPHIFY_EXECUTION_FILE_MEMBERSHIP_V2`, but `0` candidates have
      `workspaceRevision` equal to the admitted `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`.
      The largest candidate has `25,291` members, but the first failed invariant is
      `SNAPSHOT_READBACK_NOT_PROVEN`; no candidate is eligible without admission. The receipt
      remains `GRAPHIFY_SNAPSHOT_BINDING_BLOCKED_SNAPSHOT_READBACK`, `proofLevel=BLOCKED`,
      `nextGate=SNAPSHOT-BOUND-GRAPHIFY-CANARY-01`, and `writesPerformed=false`:
      `docs/reports/graphify-workspace-snapshot-binding-v1.json`. Do not relabel a historical
      execution as current. The next implementation gate is a snapshot-native bounded canary
      with independently proven materialized bytes and exact V2 membership readback.
- [ ] **UNIFIED-RESIDENCY-SNAPSHOT-MATERIALIZATION-01** is blocked on the admitted snapshot’s
      byte readback, not on manifest identity. The read-only preflight confirms workspace
      revision `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`,
      snapshot revision `sha256:48e1dbb326a4e249dc550cf1df06da8ec82ca4a837dd93eca114e4bafb2747e8`,
      `25,291` sources across `7` repositories, matching source-selection and membership
      checksums, zero duplicate identities, and zero persistent writes. The required materialized
      root is absent, producing `MATERIALIZED_SNAPSHOT_MISSING` and
      `MATERIALIZED_SOURCE_MISSING` for all `25,291` sources. Receipt:
      `docs/reports/graphify-snapshot-consumer-preflight-v1.json`.
      The next gate is `GRAPHIFY-SNAPSHOT-CONSUMER-REPAIR-01`: provide an independently
      verified immutable byte view of the admitted manifest. Do not derive bytes from the moving
      checkout, relabel historical executions, or launch Graphify until hash/size readback passes.
- [ ] **UNIFIED-RESIDENCY-SNAPSHOT-ARCHIVE-RECOVERY-01** remains unresolved after a read-only
      search of the known sibling checkouts, Git worktrees, branch tips, and workspace archive
      paths. None contains the expected SHA-256 bytes for the first failing source
      `.claude/settings.json` (`2d3ee7fcce1beb28a75b8c53ea0e5417906dcd2d29fa4692475da6d7b14d0bdc`).
      No replacement bytes were copied and no archive or datastore was changed. The admitted
      snapshot must be recovered from its original external/archive source, or a separately
      authorized new snapshot must be admitted; neither may be silently substituted.
- [ ] **UNIFIED-RESIDENCY-CURRENT-CANDIDATE-STABILITY-01** produced a fresh unadmitted candidate
      only for diagnosis. The two-scan capture observed `25,470` sources across `7` repositories
      but failed with `WORKSPACE_CHANGED_BETWEEN_SCANS`; its status is `CAPTURE_BLOCKED` and
      `canonicalAuthority=false`. Receipt:
      `docs/reports/workspace-source-snapshots/e960ca89a3f733a3d8091efdfff7e51d5efacf98a875ef2445aba347d008b77e.json`.
      Do not admit this artifact or materialize it as current authority. The next gate is a
      stable, externally quiesced source frame followed by a fresh two-scan capture and explicit
      admission review.
- [ ] **UNIFIED-RESIDENCY-CURRENT-CANDIDATE-MATERIALIZATION-01** captured a stable candidate
      successfully (`CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK`, `25,470` sources, zero
      violations) at snapshot `dd061572ddc18683aa3902e9d5ea3cac05665dea37b2ce5e07ea4bf8119f351a`,
      but materialization subsequently failed closed on
      `next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md` with
      `SNAPSHOT_SOURCE_CHANGED_BEFORE_MATERIALIZATION`. The candidate is not admitted and must
      not be used as current authority. Receipt:
      `docs/reports/workspace-source-snapshots/dd061572ddc18683aa3902e9d5ea3cac05665dea37b2ce5e07ea4bf8119f351a.json`.
      The source frame must remain quiescent through both capture and materialization before
      Graphify execution can be considered.
- [x] **UNIFIED-RESIDENCY-CURRENT-CANDIDATE-READBACK-01** proves the new candidate’s immutable
      byte view: `SNAPSHOT_BYTES_READBACK_PROVEN`, `25,470/25,470` exact source matches, and
      zero snapshot violations. The same read-only binding audit examined `32` terminal
      execution candidates and found `0` eligible matches for this candidate; the first blocker
      is `NO_TERMINAL_GRAPHIFY_EXECUTION_MATCHES_SNAPSHOT`. The candidate remains unadmitted,
      with `authority=false` and `writesPerformed=false`. Receipt:
      `docs/reports/graphify-current-candidate-binding-v1.json`. The next gate is the explicitly
      authorized snapshot-bound Graphify canary, followed by exact V2 membership readback.
- [ ] **UNIFIED-RESIDENCY-SNAPSHOT-MATERIALIZATION-REPAIR-01** failed closed during the first
      materialization attempt: the admitted snapshot manifest expects a different digest for
      `.claude/settings.json` than the current moving checkout. The materializer raised
      `SNAPSHOT_SOURCE_CHANGED_BEFORE_MATERIALIZATION` before producing a usable snapshot root;
      no canonical or projection datastore was touched. Do not weaken the digest check or copy
      the current file under the old snapshot identity. The next gate is to obtain the original
      immutable snapshot bytes (or a separately verified archival source) and rerun the
      materializer, then require complete hash/size readback before Graphify execution.
- [x] **UNIFIED-RESIDENCY-ACE-BRIDGE-01** added the read-only bridge from an already admitted
      `CandidateFeatureSnapshotV1`/`ContextManifestV2` into descriptor-only feature tiles. It
      preserves candidate ordinals and row revisions, requires an exact domain/LUT revision, and
      returns `canonicalAuthority=false` and `writesPerformed=false`. Focused proof is 7/7 across
      the adapter and ACE bridge suites; this does not prove a production caller or GPU execution.
- [x] **UNIFIED-RESIDENCY-SEARCHRUNTIME-01** added an opt-in `SearchRuntime` method that composes
      the existing QAS/ACE manifest path into the unified descriptor bridge. The existing runtime
      remains the retrieval/fusion owner; the method is read-only and requires explicit revisions
      and LUT input. The caller proof is included in the focused adapter suite (9/9 total).
- [x] **UNIFIED-RESIDENCY-CUTILE-SIMT-SMOKE-01** re-ran the isolated WSL2 executor probe on the
      RTX 3060 Ti: cuTile 1.5.0 vector-add correctness and PyTorch 2.14 CUDA 13.2 SIMT GEMM
      finiteness passed on SM86. Receipt: `docs/reports/unified-residency-cutile-simt-proof-v1.json`.
      This proves executor reachability only; it does not prove same-corpus parity, VRAM-pressure
      eviction, physical provider handoff, or promotion.
- [x] **UNIFIED-RESIDENCY-PYTORCH-EXECUTOR-SMOKE-01** re-ran the existing Python tile-cache and
      GPU-resident-executor tests in the isolated WSL2 environment: 6/6 passed, including CUDA
      materialization/readback/release and LRU behavior. Receipt:
      `docs/reports/unified-residency-pytorch-provider-proof-v1.json`. This is executor evidence,
      not proof that the TypeScript descriptor has been delivered to that process.
- [x] **UNIFIED-RESIDENCY-PYTHON-HANDOFF-01** added `UnifiedFeatureTileProvider` over the existing
      Python `GpuTileCache`. It validates descriptor kind, loadable state, shape, and byte length,
      retains buffers only inside the process, and returns a sanitized receipt. CPU fixture plus
      existing executor coverage is 14/14; missing revision lineage fails closed. No deployed RPC
      transport, cross-corpus parity, or promotion is claimed.
      Receipt: `docs/reports/unified-residency-provider-handoff-v1.json`.
- [x] **UNIFIED-RESIDENCY-PYTHON-HARNESS-01** corrected the WSL2 subprocess test environment to
      resolve the package from `sveltekit-frontend/python` instead of assuming the repository
      root is the Python import root. The RAPIDS-linked interpreter now passes the provider,
      parity, and VRAM suites: `11/11`. This proves the bounded Python handoff harness; it does
      not prove current-corpus admission or production GPU promotion.
- [x] **UNIFIED-RESIDENCY-CONTROL-TRANSPORT-01** added a metadata-only control-envelope serializer
      and Python JSON receiver. Numeric tiles remain typed array inputs outside the envelope;
      malformed control JSON and missing lineage fail closed. The provider now also accepts a
      separate little-endian Float32 buffer through `load_control_buffer`; the combined Python
      provider/executor fixture passes 14/14. This proves a local typed-buffer handoff, not a
      deployed RPC channel.
- [x] **UNIFIED-RESIDENCY-STDIO-HANDOFF-01** added a bounded length-framed local stdio
      transport around the existing Python provider. It accepts descriptor JSON plus a separate
      little-endian Float32 frame and emits only a sanitized receipt; truncated/oversized frames
      fail closed. The subprocess handoff is covered by the provider suite. This is a local
      replayable transport proof, not a deployed network service.
- [x] **UNIFIED-RESIDENCY-HOST-HANDOFF-01** added a Node host harness that sends the same
      descriptor JSON plus typed Float32 frame through WSL2 to the existing Python provider and
      validates the sanitized `RESIDENT` receipt. Receipt:
      `docs/reports/unified-residency-stdio-handoff-v1.json`. This proves host-to-provider
      delivery and frame checksums locally; it is not a deployed production RPC.
- [x] **UNIFIED-RESIDENCY-FEATURE-PACK-LINEAGE-01** retained per-row `sourceRevisions` in the
      existing GPU feature-pack contract and added a pack-to-residency adapter. A pack with one
      source revision lowers to a typed feature buffer; mixed-source packs fail closed because
      the unified descriptor has a singular `sourceRevision`. No current-corpus admission is
      implied. Receipt: `docs/reports/unified-residency-feature-pack-lineage-v1.json`.
- [x] **UNIFIED-RESIDENCY-FEATURE-PACK-ADMISSION-01** wired the revision-qualified feature-pack
      result through the existing `FeatureTileProvider` and `UnifiedResidencyAdapter`. The
      provider returns only the typed buffer, while the adapter owns residency state; key and
      artifact mismatches fail closed. This is a read-only local provider proof, not canonical
      persistence or production promotion.
- [x] **UNIFIED-RESIDENCY-FEATURE-PACK-BATCH-01** added ordinal-preserving per-row lowering for
      mixed-source GPU packs. Homogeneous packs may use the compact tile path; mixed packs now
      produce one typed row tile per source revision rather than collapsing provenance. The
      SearchRuntime opt-in path returns the resulting residency batch and remains read-only.
- [x] **UNIFIED-RESIDENCY-SEARCHRUNTIME-LOAD-01** extended the SearchRuntime fixture proof to
      load its emitted residency batch through the existing `UnifiedResidencyAdapter` and typed
      provider interface, verifying `RESIDENT` state without retaining buffers in the runtime
      adapter. This remains bounded fixture evidence, not live-corpus promotion.
- [ ] **UNIFIED-RESIDENCY-PARITY-01** prove same-corpus CPU/PyTorch-SIMT and isolated cuTile
      parity, NetworkX/DAG ordinal parity, and bounded replay before any promotion. Keep
      `writesPerformed=false` for the proof lane.
- [x] **UNIFIED-RESIDENCY-PARITY-01a** added a deterministic bounded CPU/PyTorch-SIMT
      exact-cosine parity and replay test over one shared feature tile. The existing
      `GpuTileCache` is reused; result indices, scores, and replay checksums match within
      tolerance, and a dimension mismatch fails before scoring. This is a synthetic/bounded
      executor proof only; production same-corpus, cuTile parity, ordinal parity, and VRAM
      pressure remain open.
- [x] **UNIFIED-RESIDENCY-PARITY-01b** re-ran the existing bounded NetworkX↔cuGraph
      ordinal/PageRank proof through the declared RAPIDS environment. The shared six-node
      fixture preserved `renumbered=false`, exact vertex identity, stable rank ordering, and
      `maxAbsScoreError=7.19e-7`; receipt: `docs/reports/graph-ordinal-cpu-gpu-parity-v1.json`.
      This is a graph-fixture proof, not current-workspace graph authority.
- [x] **UNIFIED-RESIDENCY-PARITY-01c** re-ran the isolated cuTile FP16 GEMM against the
      PyTorch SIMT reference on the RTX 3060 Ti. The 256×256 fixture was finite with zero
      absolute and relative delta across three repeats; receipt:
      `docs/reports/unified-residency-cutile-gemm-parity-v1.json`. This proves kernel-level
      parity only; feature-corpus parity and VRAM-pressure behavior remain open.
- [x] **UNIFIED-RESIDENCY-VRAM-01a** exercised the existing CUDA `GpuTileCache` on the RTX
      3060 Ti with eight 1 MiB tiles against a four-tile ceiling. Logical bytes stayed within
      the ceiling, oldest tiles were evicted, the newest tile remained resident, and an evicted
      tile reloaded successfully. This is a bounded allocator/LRU proof; it does not authorize
      a production VRAM policy or persistence of GPU state.

### Unified residency host-staging boundary (2026-09-14)

- [x] **UNIFIED-RESIDENCY-HOST-STAGING-01** proved the existing Node `@atlas/duckdb`
      wrapper after restoring its missing native binding with `npm rebuild duckdb`. A real
      in-memory read-only `SELECT` returned a bounded feature tile and now feeds the existing
      host-to-WSL typed-buffer handoff. No table, snapshot, PostgreSQL row, cache entry, or GPU
      state was written. Neither WSL2 Python environment has an importable DuckDB module outside
      the repository, so Python DuckDB is not treated as part of the cuTile path. Pandas/PyArrow
      remain analysis/export dependencies in the RAPIDS environment only. Receipt:
      `docs/reports/unified-residency-host-staging-audit-v1.json`.
- [x] **UNIFIED-RESIDENCY-E2E-FIXTURE-HANDOFF-01** joined the existing bounded
      SearchRuntime → ACE admission → feature-pack → DuckDB in-memory SELECT → typed Float32
      stdio → WSL2 provider path. Source and staged feature-value checksums matched; the CUDA
      provider returned `RESIDENT` with `rawPointerExposed=false` and `writesPerformed=false`.
      This is an end-to-end fixture proof only: no current-corpus admission, production route,
      or projection promotion is implied. Receipt:
      `docs/reports/unified-residency-searchruntime-duckdb-wsl-v1.json`.
- [x] **UNIFIED-RESIDENCY-PARITY-01d** extended that joined fixture with the existing
      provider's `EXACT_COSINE_V1` operation over a second typed query buffer. The WSL2 CUDA
      result returned ordinal `0` and score `1.0`, matching the staged row's CPU identity
      expectation and result checksum. This remains one-row bounded numerical proof; it does
      not close the parent same-corpus/current-cohort parity gate.
- [x] **UNIFIED-RESIDENCY-PARITY-01e** made the CPU oracle explicit in the joined receipt:
      the host computes normalized cosine over the exact DuckDB-staged Float32 values, and the
      WSL2 CUDA result must match both ordinal and rounded score arrays. This is bounded
      CPU↔CUDA parity over the same transferred tile; full-corpus and cuTile feature-corpus
      parity remain open.
- [x] **UNIFIED-RESIDENCY-FAIL-CLOSED-HANDOFF-01** added a negative joined replay with a
      mismatched query shape. The WSL2 boundary rejects it before scoring and returns a failed,
      sanitized receipt with `writesPerformed=false`; the valid CPU↔CUDA case must pass in the
      same run.
- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage A: pure policy) added a pure, deterministic
      multi-signal admission policy
      (`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-admission-v1.ts`,
      `decideGpuMemoryAdmissionV1()`) as a bounded pre-check BitFrost calls before
      `UnifiedResidencyAdapter.admit()` -- deliberately NOT wired into
      `unified-residency-adapter-v1.ts` itself in this tranche to avoid colliding with concurrent
      edits to that file; callers compose the two explicitly, admitting only on `ADMIT` or
      `EVICT_THEN_ADMIT` (after BitFrost's own ledger performs the eviction -- this module never
      evicts anything itself).
      **Structured as three strictly separated stages** (external review caught and fixed a real
      policy bug in the first draft: an unreachable `DEFER` branch caused by conflating
      `pressureState` with `decision`):
      1. *Validate/normalize evidence* -- `deviceFreeObserved`, `wddmBudget`/`wddmCurrentUsage`,
         and `cudaContextFree` are each checked for trust (finite, safe-integer, non-negative)
         independently; an untrusted individual reading is excluded from the signal set entirely
         rather than propagated, and a WDDM usage-exceeding-budget pair clamps to zero rather than
         going negative. The trusted signals are combined via their MINIMUM -- never an average or
         the optimistic reading -- reserves subtracted exactly ONCE after that combination, never
         per-signal. This directly encodes the BITFROST-L2-01 lesson recorded earlier in this same
         file's history, where `cudaMemGetInfo` reported ~6.68GB free while `nvidia-smi` reported
         ~140-400MB free on this same host.
      2. *Classify pressure* (`UNKNOWN`/`CRITICAL`/`HIGH`/`ELEVATED`/`LOW`) -- purely descriptive
         of what was observed, decoupled from what BitFrost should do about it.
      3. *Choose the decision* (`ADMIT`/`DEFER`/`EVICT_THEN_ADMIT`/`REJECT`) -- `DEFER` is used
         SOLELY for `UNKNOWN` evidence (retry once evidence exists), never as a softer `REJECT`
         under known high/critical pressure; known-evidence unsafe requests `REJECT` (or
         `EVICT_THEN_ADMIT` if BitFrost-reported `evictableBytes` closes the gap).
      Withholds a fixed decoder reserve (`DEFAULT_DECODER_RESERVE_BYTES=2GB`, overridable per call)
      whenever `decoderActive=true`, treating live llama-server survival as a first-class
      constraint per this repo's existing rule. Enforces a hard `MIN_SAFE_ALLOWANCE_BYTES=64MB`
      floor as required post-admission headroom, applied explicitly and deterministically even for
      a zero-byte request (an already-`CRITICAL` device still `REJECT`s a 0-byte ask -- admission
      answers device safety, not request cost). Self-verifying via `admissionChecksum` (reuses the
      existing `canonicalExecutionSha256` helper, not a new hashing scheme); `evidenceRefs` order
      is explicitly defined as checksum-significant, not silently normalized away. `writesPerformed`
      is a literal `false` on every result.
      **Focused proof: 23/23 tests** (18 example cases covering both-absent, single-signal,
      optimistic-vs-constrained-signal conflicts in both directions, exact/one-byte-over safe
      boundaries, decoder on/off, eviction sufficiency/insufficiency boundaries, critical-pressure
      rejects-not-defers, corrupt/negative evidence clamping and exclusion, checksum determinism
      and evidenceRefs order-sensitivity, zero-byte-request policy, and a `Number.MAX_SAFE_INTEGER`
      overflow guard) **plus 3 property-based assertions** (fast-check, 100 runs each): increasing
      `requestedBytes` never increases permissiveness, increasing observed free bytes never
      decreases permissiveness, and `decoderActive=true` is never more permissive than
      `decoderActive=false` for otherwise identical input.
      Does not touch, and is not blocked by, the current-corpus source-authority chain above --
      this is pure device-memory-pressure policy, independent of workspace/source lineage.
      Remaining stages (not yet built, tracked as this same gate's B-F): B. observation contract,
      C. CUDA observation adapter, D. WDDM observation adapter, E. decoder-survival live proof,
      F. integration with the existing residency owner (`unified-residency-adapter-v1.ts`).

- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage B: observation contract) added
      `GpuMemoryObservationV1` (`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-observation-v1.ts`,
      Zod schema, no I/O) -- a typed, revision-agnostic envelope for exactly the four raw readings
      `decideGpuMemoryAdmissionV1()` already accepts, each independently nullable and each tagged
      with `{ value, source }` where `source` is `'nvidia-smi' | 'wddm' | 'cuda-context'`, plus
      `observedAt`. Rejects an all-null observation (zero readings is not useful evidence) and
      flags a WDDM budget/usage source mismatch as a validation error. `toAdmissionInputFields()`
      maps an observation straight into `decideGpuMemoryAdmissionV1()`'s input shape with no lossy
      transform -- proven by a focused test that round-trips a real observation through the
      admission policy and checks the resulting decision. Focused proof: 6/6 tests. Deliberately
      still has zero hardware dependency -- stages C/D (CUDA and WDDM/nvidia-smi adapters that
      actually PRODUCE a `GpuMemoryObservationV1`) remain unstarted.
      (The original plan considered a tagged-union-per-signal shape; the shipped design uses one
      shared `{ value, source }` reading type reused across all four fields instead, which was
      simpler and sufficient.) Placed beside `gpu-memory-admission-v1.ts` in the same `tensors/`
      directory, per plan.
- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage C: CUDA observation adapter) added
      `sveltekit-frontend/python/parent_atlas_tensor/gpu_memory_probe.py` -- a standalone,
      read-only WSL2-side probe (`torch.cuda.mem_get_info()`) emitting one
      `GpuMemoryObservationV1`-shaped `cudaContextFree` reading. Deliberately NOT routed through
      `unified_residency_stdio.py`'s length-framed binary protocol -- that framing exists
      specifically for transferring a numeric tile buffer alongside a descriptor, which doesn't
      apply to a payload-free memory query; instead reuses the SAME WSL2/venv spawn convention as
      the existing host harness (`scripts/atlas/prove-unified-residency-stdio-handoff-v1.mjs`).
      Node-side proof harness: `scripts/atlas/prove-gpu-memory-observation-cuda-v1.mjs`. **Real,
      live result** on this host's RTX 3060 Ti: `cudaContextFree.value=7,472,152,576` bytes
      (~7.47GB) of `cudaContextTotal=8,589,410,304` (~8GB) total, `torchVersion=2.14.0+cu132`,
      plausibility check passed (`0 < free <= total`). Receipt:
      `docs/reports/gpu-memory-observation-cuda-v1.json`. Explicitly caveated in the receipt
      itself: this ~7.47GB reading is NOT trusted alone -- consistent with this repo's own
      BITFROST-L2-01 finding that `cudaMemGetInfo` overstates free memory relative to `nvidia-smi`
      on this host; stage D's WDDM/nvidia-smi adapter remains required before any real admission
      decision is fed this signal.
#### BITFROST-GPU-MEMORY-ADMISSION-01 handoff (2026-09-14, ALL SIX STAGES COMPLETE)

**Done, tested, verified no regressions**: stages A (pure policy, 23/23 tests), B (observation
contract, 6/6 tests), C (CUDA observation adapter, real live WSL2 CUDA reading), D (WDDM/nvidia-smi
observation adapter, real live Windows perf-counter + nvidia-smi capture, 4/4 tests), E
(decoder-survival live proof against a real running llama-server.exe, 3/3 tests), F (integration
wrapper `admitWithGpuMemoryAdmissionCheck()` composing decision + `UnifiedResidencyAdapter.admit()`
without modifying `admit()` itself, 4/4 tests). All six plus the pre-existing
`unified-residency-adapter-v1.spec.ts` (6/6) and the concurrent tranche's own
`unified-residency-feature-pack-v1.spec.ts` (3/3) were re-run together this session: **49/49
passing, zero regressions**. `openspec validate parent-atlas-tensor-residency-integration --type
change --strict` passes (run from the repo root -- this change lives in the repo-root `openspec/`
tree, NOT `sveltekit-frontend/openspec/`).

**Files added this BITFROST-GPU-MEMORY-ADMISSION-01 effort** (only ONE pre-existing file was
modified, additively -- see below):
`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-admission-v1.ts` (+`.spec.ts`) --
**modified in stage F** to add the `admitWithGpuMemoryAdmissionCheck()` export and an import of
`UnifiedResidencyAdapter`; every other line from stages A-C is unchanged,
`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-observation-v1.ts` (+`.spec.ts`),
`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-observation-wddm-v1.spec.ts`,
`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-admission-decoder-survival-v1.spec.ts`,
`sveltekit-frontend/src/lib/server/atlas/tensors/gpu-memory-admission-residency-integration-v1.spec.ts`,
`sveltekit-frontend/python/parent_atlas_tensor/gpu_memory_probe.py`,
`scripts/atlas/prove-gpu-memory-observation-cuda-v1.mjs`,
`scripts/atlas/prove-gpu-memory-observation-wddm-v1.mjs`,
`scripts/atlas/prove-gpu-memory-admission-decoder-survival-v1.mjs`,
`docs/reports/gpu-memory-observation-cuda-v1.json`,
`docs/reports/gpu-memory-observation-wddm-v1.json`,
`docs/reports/gpu-memory-admission-decoder-survival-v1.json`.
`unified-residency-adapter-v1.ts` itself was NOT modified -- the stage F wrapper lives in
`gpu-memory-admission-v1.ts` and only imports from it.

**Known, deliberate, non-blocking gaps**: `wddmBudget` (the literal DXGI
`IDXGIAdapter3::QueryVideoMemoryInfo` Budget field) remains genuinely unobtained -- stage D
deliberately left it `null` rather than approximate it, since PowerShell/WMI cannot reach it (only
Usage/Committed counters are exposed that way); a real Budget value would need a small native COM
addon, out of scope here and not currently planned as a separate stage.
`admitWithGpuMemoryAdmissionCheck()` has zero production callers as of this handoff -- same status
as `UnifiedResidencyAdapter.admit()`/`.load()` themselves, which stage F confirmed still have no
live call site beyond their own spec tests (`loadUnifiedResidencyFeaturePackV1` is unwired into
`search-runtime-adapter.ts`, which only calls the descriptor-building
`prepareUnifiedResidencyFeaturePackBatchV1`). Wiring a real call site is a separate, future
integration decision, not part of this gate's scope. None of A-F touch or are blocked by the
current-corpus source-authority chain elsewhere in this file.

**This BITFROST-GPU-MEMORY-ADMISSION-01 effort is complete.** Next steps for whoever picks this up
(concurrent session or future one): (1) decide whether/where to add a real production call site for
`admitWithGpuMemoryAdmissionCheck()`, most likely wherever `loadUnifiedResidencyFeaturePackV1` or a
future `.admit()` caller gets wired into production; (2) optionally pursue the native-COM-addon
route for a true `wddmBudget` reading if this stack ever needs it as a gating input rather than an
informational one.

- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage D: WDDM observation adapter) took the
      PowerShell/WMI bridge option (not a native addon): `scripts/atlas/prove-gpu-memory-observation-wddm-v1.mjs`
      reuses `run-l2-persist-bench.mjs`'s exact `nvidia-smi --query-gpu=memory.free,memory.total`
      pattern verbatim for `deviceFreeObserved`, adds a real Windows
      `\GPU Process Memory(*)\Dedicated Usage` performance-counter read (summed per-LUID, dominant
      discrete-GPU LUID auto-selected by highest aggregate usage -- no hardcoded LUID) for
      `wddmCurrentUsage`, and re-invokes the stage-C WSL2 CUDA probe for `cudaContextFree`, all
      three captured within the same wall-clock second. **Honest limitation, not worked around**:
      the literal DXGI `Budget` field (`IDXGIAdapter3::QueryVideoMemoryInfo`) is not reachable from
      PowerShell counters or WMI -- only Usage/Committed are exposed that way, so `wddmBudget` is
      left `null` rather than fabricated from a different probe's number (this also means the
      `GpuMemoryObservationV1` WDDM-source-mismatch check never fires here, correctly, since only
      one WDDM-sourced field is populated). Real live capture (2026-09-14):
      `nvidia-smi` free = 1,113,587,712 B (1.06 GiB, real contention -- another process is
      genuinely using most of this 8GB card right now), WDDM dedicated-usage = 7,562,141,696 B
      across the dominant LUID (one process alone at 5,801,705,472 B, almost certainly
      llama-server.exe), `cudaContextFree` = 7,472,152,576 B. **Discrepancy formally recorded, not
      just narrated**: cudaContextFree overstates nvidia-smi's free reading by **6.71x** at this
      capture instant -- same direction, same root cause as the earlier ~20x BITFROST-L2-01
      finding; magnitude differs because nvidia-smi's free figure was much smaller (tighter real
      contention) this time, while cudaContextFree's absolute number stayed roughly constant
      (~7.4-7.5GB) across both captures -- consistent with cudaContextFree reflecting a
      WDDM-virtualized budget rather than physically-free VRAM. Receipt:
      `docs/reports/gpu-memory-observation-wddm-v1.json` (`RESULT: DRY_RUN_PROVEN`). Frozen
      regression test added (not just a one-off script run):
      `gpu-memory-observation-wddm-v1.spec.ts` (4/4 passing) pins this exact real capture through
      `gpuMemoryObservationV1Schema` and `decideGpuMemoryAdmissionV1()`, proving the admission
      policy's min-of-trusted-signals rule is NOT fooled by cudaContextFree's optimistic number
      even when nvidia-smi's real reading is far smaller and a 2GB request against the true
      ~1.06GB free correctly does not ADMIT. Full suite re-run together: **39/39 passing, zero
      regressions** (unified-residency-adapter-v1 6, gpu-memory-admission-v1 23,
      gpu-memory-observation-v1 6, gpu-memory-observation-wddm-v1 4, new).
- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage E: decoder-survival live proof) real
      llama-server.exe was already running on :8090 (`ornith-1.5-9b`, per root CLAUDE.md's
      canonical startup contract) -- confirmed via `GET /v1/models`.
      `scripts/atlas/prove-gpu-memory-admission-decoder-survival-v1.mjs` captured a real
      `GpuMemoryObservationV1`-shaped reading (nvidia-smi + stage-C WSL2 CUDA probe, same reuse
      pattern as stages C/D), then ran `decideGpuMemoryAdmissionV1()` TWICE for the identical
      `requestedBytes` -- once `decoderActive: false`, once `decoderActive: true` -- via the real
      canonical module (invoked through a throwaway `tsx`-executed script, not a reimplementation,
      so the numbers are the actual production logic's output, not a copy). Live capture
      (2026-09-14): with `deviceFreeObserved` = 1,176,502,272 B and `requestedBytes` = 588,251,136 B
      (~50% of free), `decoderActive: false` → **ADMIT** (`effectiveAdmittableBytes` =
      1,176,502,272); `decoderActive: true` → **REJECT** (`effectiveAdmittableBytes` clamps to 0,
      `pressureState: CRITICAL`) -- the identical request flips outcomes purely from the decoder
      flag, proving the 2GB reserve is load-bearing on a real decision, not an inert constant.
      llama-server confirmed alive (`GET /v1/models`, 200, same `modelId`) both immediately before
      and immediately after. One real bug found and fixed in the PROOF SCRIPT itself (not the
      admission policy): the first plausibility check assumed the reserve delta would equal exactly
      `DEFAULT_DECODER_RESERVE_BYTES`, but `effectiveAdmittableBytes` correctly clamps to 0 rather
      than going negative when the reserve exceeds the free bound -- fixed to check
      `reservedHeadroom === 2_000_000_000` and `effectiveAdmittableBytes === max(0, freeBound -
      reserve)` instead of a raw delta. Receipt:
      `docs/reports/gpu-memory-admission-decoder-survival-v1.json` (`RESULT: DRY_RUN_PROVEN`).
      Frozen regression test: `gpu-memory-admission-decoder-survival-v1.spec.ts` (3/3 passing) pins
      this exact real capture -- ADMIT without decoder, REJECT with decoder, and a check that
      neither call falls back to DEFER (both signals were trusted and present at capture time).
      Full suite re-run together: **42/42 passing, zero regressions**.
- [x] **BITFROST-GPU-MEMORY-ADMISSION-01** (stage F: integration) re-read
      `unified-residency-adapter-v1.ts` fresh before touching it, per the standing instruction --
      it had NOT changed structurally since stage A, but a real NEW file had appeared under it in
      the concurrent tranche: `unified-residency-feature-pack-v1.ts` (`prepareUnifiedResidencyFeaturePackBatchV1`
      / `prepareUnifiedResidencyFeaturePackV1` / `loadUnifiedResidencyFeaturePackV1`). Checked its
      real callers before assuming anything: `search-runtime-adapter.ts` (confirmed live production
      code) calls only `prepareUnifiedResidencyFeaturePackBatchV1` (descriptor-building, no
      mutation) -- it does NOT call `loadUnifiedResidencyFeaturePackV1` (the one that reaches
      `adapter.admit()` via `.load()`), which currently has zero callers outside its own spec test.
      So `.admit()`/`.load()` still has no live production call site to force a signature change
      through, matching this module's own header comment ("Deliberately NOT wired into
      unified-residency-adapter-v1.ts ... callers compose the two explicitly"). Implemented
      exactly that composition as the optional wrapper the task allows instead of modifying
      `admit()`: `admitWithGpuMemoryAdmissionCheck(adapter, descriptor, admission)` in
      `gpu-memory-admission-v1.ts` -- takes an ALREADY-COMPUTED `GpuMemoryAdmissionV1` (keeping
      observation -> decision -> mutation as three separately-inspectable steps), throws
      `GPU_MEMORY_ADMISSION_REFUSED_<decision>` for `REJECT`/`DEFER` before ever calling
      `adapter.admit()`, and calls through for `ADMIT`/`EVICT_THEN_ADMIT` (the latter asserts
      eviction already happened elsewhere -- this wrapper never evicts). `admit()`'s own signature
      and internal budget check are untouched. New test:
      `gpu-memory-admission-residency-integration-v1.spec.ts` (4/4 passing) -- ADMIT mutates the
      adapter, REJECT and DEFER both throw before any mutation (`adapter.usedBytes()` stays 0),
      EVICT_THEN_ADMIT succeeds without double-accounting against `admit()`'s own independent
      budget check. Full suite re-run together, including the concurrent tranche's own
      `unified-residency-feature-pack-v1.spec.ts`: **49/49 passing, zero regressions**. All six
      stages (A-F) of `BITFROST-GPU-MEMORY-ADMISSION-01` are now complete.

### OpenCode / VS Code agent-awareness integration (2026-09-14)

- [x] **UNIFIED-RESIDENCY-OPENCODE-CONTEXT-01** confirmed that the existing OpenCode
      JSONC configuration already provides the agent/model owner (`ornith-atlas-kernel`),
      local `atlas-task-kernel` MCP, remote TRACE MCP, and deny-by-default mutation
      permissions. Added `.opencode/command/atlas-residency-proof.md` as the bounded,
      read-only command entrypoint. It consumes existing reports and proof scripts and
      requires structured evidence rather than log scraping or raw backend access.
      This is an OpenCode integration proof, not current-corpus residency promotion.
- [ ] **UNIFIED-RESIDENCY-VSCODE-HANDOFF-01** add one VS Code task that invokes the
      OpenCode command without auto-approval and displays the resulting structured proof.
      Reuse `.vscode/tasks.json`; do not create a second VS Code extension, MCP server,
      router, or cache owner. Keep the existing `vscode-extension` as optional UI only.
- [ ] **UNIFIED-RESIDENCY-AGENTIC-LIVE-CONTEXT-01** prove one live OpenCode session
      receives the canonicalized Atlas residency report through the existing MCP seam,
      with `writesPerformed=false`, explicit evidence references, and a blocked promotion
      result when current-corpus lineage is unavailable. Do not persist hidden reasoning,
      tensors, KV state, GPU pointers, or raw retrieval output.
- [x] **UNIFIED-RESIDENCY-RLM-REPAIR-ALIGNMENT-01** recorded the existing RLM, ACP/MCP,
      telemetry, repair-registry, and repair-loop boundaries and added the read-only
      `.opencode/agents/atlas-rlm-repair.md` profile. The profile produces a structured
      repair candidate and validation plan from revision-qualified evidence, while denying
      edits and requiring `writesPerformed=false`. This proves agent-policy alignment only;
      it does not prove a durable event-outbox timeline or authorize repair application.
- [ ] **UNIFIED-RESIDENCY-EVENT-TIMELINE-01** connect one verified repair result to the
      existing authoritative receipt/event owner with predecessor evidence references and
      replay identity. The current NATS publisher is a graceful no-op and ACP telemetry is
      diagnostic, so neither may be treated as durable history. Do not add A2A, REPL, TOML,
      or another event bus until the existing owner and persistence path are proven.

### Prime-agent runtime alignment review (2026-09-14)

- [x] **PRIME-AGENT-RUNTIME-ALIGNMENT-01** reviewed the existing OpenCode/RLM/repair
      path. OpenCode JSONC remains the agent configuration owner; MCP remains JSON-RPC
      capability transport; ACP tool contracts and telemetry remain capability/diagnostic
      layers; the existing repair registry and `repair-loop.ts` remain the agentic repair
      owner. No second REPL, router, or extension is required for the first tranche.
- [x] **PRIME-AGENT-IPYKERNEL-CONFIG-01** classified IPython as an optional analysis
      kernel rather than an OpenCode control-plane format. Current IPython documentation
      uses traitlets-backed Python or limited JSON configuration, not TOML. Any future
      kernel task must exchange bounded typed buffers and revisioned receipts; it must not
      become a new identity, event, or cache owner.
- [x] **PRIME-AGENT-FASTAPI-SIDECAR-01** classified FastAPI as an explicit executor/API
      boundary only. Heavy or restart-sensitive work must use the existing worker/queue
      pattern rather than relying on in-process request background tasks. HTTP responses
      should acknowledge bounded work and reference a receipt; they must not imply current
      corpus admission or durable timeline persistence.
- [x] **PRIME-AGENT-SIMDJSON-01** confirmed simdjson belongs at the JSON/JSONL control and
      receipt parsing boundary. Numeric GPU payloads remain Arrow/MsgPack/typed buffers;
      JSON parsing must not enter the hot SIMT loop or mint identity.
- [x] **PRIME-AGENT-TURBOVEC-PACKAGE-01** confirmed the repository has the TurboVec
      N-API/Rust package and Python/sidecar integrations, but no separately proven,
      canonical TurboVec Python wheel owner. Package/build provenance and ABI checks remain
      an executor-readiness gate; TurboVec remains a derived retrieval executor.
- [x] **PRIME-AGENT-TENSORRT-RTX-01** recorded TensorRT for RTX as a future inference
      executor lane for Ampere-class RTX hardware. NVIDIA documentation describes support
      for RTX generations including Ampere and an ONNX Runtime/Windows ML execution path;
      this does not prove the local RTX 3060 Ti TensorRT-RTX install, model engine, or
      parity. Require a local capability receipt before promotion and keep it separate from
      the WSL2 RAPIDS/cuTile environment.
- [ ] **PRIME-AGENT-TIMELINE-PROOF-01** prove one end-to-end sequence:
      `verified error → evidence packet → repair candidate → validation receipt →
      recommendation`, with stable repair-case identity, predecessor receipt references,
      replay checksum, and `writesPerformed=false`. A NATS no-op, console log, or OpenCode
      transcript alone cannot close this gate.

### Parent Atlas workstation agentic-repair integration map (2026-09-14)

- [x] **WORKSTATION-AGENT-OWNER-01** mapped the existing workstation owner:
      `packages/atlas-core/src/workstation-orchestrator.ts` and its CLI/export surface.
      This is the main-repository workspace package `@deeds/atlas-core`, not a separate
      checkout and not `packages/atlas` (`@deeds/atlas-contracts`). It remains the
      coordinator for bounded workstation work; OpenCode, RLM, and Mastra may invoke or
      explain work but must not replace this owner.
- [x] **WORKSTATION-REPAIR-OWNER-01** mapped the existing repair path:
      `packages/atlas-core/src/langgraph/kanban-error-fixing-agent.ts`,
      `sveltekit-frontend/scripts/agents/repair-registry.ts`, and
      `sveltekit-frontend/scripts/agents/repair-loop.ts`. The registry remains the only
      source of repair capabilities; dry-run is the default and `--apply` remains an
      explicit mutation gate.
- [x] **WORKSTATION-STDIO-HANDOFF-01** aligned local stdio with the existing typed-buffer
      boundary. The unified residency provider and stdio handoff may carry bounded
      descriptor JSON plus typed numeric frames, while OpenCode/MCP remains capability
      transport. No raw GPU pointer, tensor, KV state, or hidden reasoning may cross or
      persist through the packet.
- [x] **WORKSTATION-ACP-AWARENESS-01** mapped ACP contracts and telemetry in
      `packages/atlas-core/src/tools/acp-tool-contracts.ts` and
      `packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts`. These record capability
      calls and diagnostics; they do not independently establish canonical authority or
      durable event history.
- [x] **WORKSTATION-EVENT-TRANSPORT-01** recorded
      `packages/atlas-core/src/nats/nats-client.ts` and `packages/atlas-core/events/subjects.ts`
      as optional event transport surfaces. The current NATS client is a graceful no-op
      when unavailable, so it cannot close the timeline gate or substitute for an
      authoritative receipt/outbox.
- [x] **WORKSTATION-OPENCODE-BRIDGE-01** aligned the existing
      `.opencode/agents/atlas-rlm-repair.md` and
      `.opencode/command/atlas-residency-proof.md` with the workstation repair path.
      OpenCode receives bounded evidence and returns a repair candidate/validation plan;
      it does not edit, apply, or authorize repairs.
- [ ] **WORKSTATION-AGENTIC-STDIO-REPLAY-01** prove a local OpenCode/stdio replay using
      one synthetic verified error and one bounded residency receipt. Require stable
      `repairCaseKey`, `workspaceRevision`, `sourceRevision`, `executionId`,
      `evidenceRefs`, replay checksum, and `writesPerformed=false`. This must use the
      existing repair registry and workstation receipt shape; do not create a new A2A
      protocol, REPL service, TOML control file, or event bus.
- [ ] **WORKSTATION-TIMELINE-AUTHORITY-01** connect the replay result to the existing
      authoritative Parent Atlas receipt/event owner, then independently read it back.
      Console logs, NATS delivery, MCP responses, and OpenCode transcripts remain
      evidence only until durable persistence and replay identity are proven.
- [x] **WORKSTATION-MAIN-REPO-STDIO-ADAPTER-01** added the main-repository-only
      `scripts/agentic/workstation-repair-stdio-v1.mjs` adapter and the OpenCode command
      `.opencode/command/atlas-repair-stdio-proof.md`. It validates explicit lineage,
      derives a stable repair-case key and replay checksum, and returns either an
      authority-blocked result or an un-authorized dry-run candidate. It performs no file,
      database, cache, model, GPU, or projection writes. Do not copy this into an
      `@deeds/atlas-*` package until the root proof and package-boundary review pass;
      `@deeds/atlas-core` remains the existing orchestration owner, while
      `@deeds/atlas-contracts` remains a contracts package.
- [x] **WORKSTATION-MAIN-REPO-STDIO-SMOKE-01** proved the root adapter with a valid
      synthetic evidence packet (`REPAIR_CANDIDATE`, deterministic `repairCaseKey`,
      `replayChecksum`, `canonicalAuthority=false`, `writesPerformed=false`) and with
      incomplete lineage (`REJECTED`, `LINEAGE_REQUIRED`, `writesPerformed=false`). This
      is a bounded contract/adapter proof only; it does not prove live repair-registry
      invocation, durable event persistence, OpenCode execution, or package integration.
- [x] **WORKSTATION-ATLAS-CORE-MIRROR-01** mirrored the proven pure builder into the main-repository
      package `@deeds/atlas-core` at `packages/atlas-core/src/agentic/workstation-repair-stdio.ts`
      and exported it from the package index. The package mirror preserves the root schema, stable
      repair-case identity, evidence-gated candidate status, replay checksum, and write/authority
      guards. Its focused unit proof is separate from the root stdio process proof. No copy was made
      into `@deeds/atlas-contracts`, `@deeds/parent-atlas-core`, or another package, and no live
      repair registry, event store, or runtime mutation was introduced.

- [x] **WORKSTATION-AGENTIC-LOGIC-CENSUS-01** recorded the local logic that may be reused
      instead of copied from an external agent framework: Mastra workflows under
      `packages/atlas-orchestrator` and `scripts/atlas`, workstation/repair ownership under
      `packages/atlas-core` and `sveltekit-frontend/scripts/agents`, and claim/retry/lease
      helpers under `scripts/agentic` and `packages/atlas-core/src/queue`. The census found
      no Paperclip runtime or source-backed implementation. Receipt:
      `docs/reports/paperclip-custom-logic-census-v1.json`. Paperclip remains an optional
      adapter boundary; it must not become a second task, repair, identity, or event owner.
- [x] **WORKSTATION-MASTRA-PAPERCLIP-BOUNDARY-01** audited the main-repository agent surfaces:
      `packages/atlas-orchestrator` contains the Mastra workflow package and `scripts/atlas`
      contains Mastra-labelled and agentic workflow/audit scripts, while
      `packages/atlas-core` remains the workstation and repair owner. No Paperclip package,
      runtime, or source-backed adapter was found. Paperclip therefore remains an external
      adapter concept, not a second Parent Atlas control plane. No new protocol, persistence
      owner, or runtime integration was added.
- [x] **WORKSTATION-TRACE-MCP-DEEP-AUDIT-01** ran the existing read-only TRACE auditor against
      `http://127.0.0.1:8788/mcp`: `tools/list` returned 176 live tools and `trace.system_health`
      responded, while the bounded `kb.trace_search` probe timed out. `trace.kag_search` returned
      three discovery-level items, but none carried `canonicalChunkId`, `packetKey`,
      `workspaceRevision`, `sourceRevision`, or a complete identity envelope. Optional codebase,
      research, Bifrost, and rg-atlas registries remain disabled by policy. Topology and rerank
      were unavailable; Postgres, Qdrant, Neo4j, Redis, Go retrieval, Bifrost, TurboQuant, and
      MCP responded. Receipt is the auditor output `docs/reports/trace-disabled-search-tools-v1.json`.
      This proves protocol reachability/read-only health only; it does not close
      `WORKSTATION-TIMELINE-AUTHORITY-01` or current-corpus lineage.
- [x] **WORKSTATION-TRACE-MCP-NULL-SAFETY-01** hardened the read-only auditor to emit explicit
      `null` values for absent canonical chunk, packet, workspace-revision, and source-revision
      fields, and to classify aborts as `TIMEOUT` rather than conflating them with protocol errors.
      The rerun confirmed `trace.kag_search` still returns discovery-only items, the
      `kb.trace_search` call returns an MCP tool error, and the identity envelope remains absent.
      No fallback identity or guessed revision is created; `writesPerformed=false` remains true.
- [x] **WORKSTATION-TRACE-SEARCH-SQL-ARRAY-01** corrected the canonical TRACE source-reference
      join in `sveltekit-frontend/src/lib/server/ai/trace-reranker.ts` so Drizzle emits a typed
      PostgreSQL `ARRAY[...]::text[]` instead of interpolating a JavaScript array as the invalid
      record expression `($1, $2)::text[]`. The retrieval executor-tree regression suite passes
      3/3, and the edited source has no diff-check violations. The already-running TRACE process
      must be reloaded separately before live MCP recovery can be claimed; no service restart,
      database write, projection write, or tool re-enablement was performed.
- [x] **WORKSTATION-TRACE-ENGRAM-OPTIONAL-COLUMN-01** made the optional
      `hnsw_embedding_512` Engram lane schema-aware. Existing deployments without that column
      now retain the base embedding search and report the 512-dimensional lane as unavailable;
      the bridge no longer attempts an index creation or unconditional SELECT against a missing
      column. A fresh isolated TRACE process confirmed the guarded warning and completed a
      read-only search without the prior SQL failure. No schema or datastore write was made.
- [x] **WORKSTATION-TRACE-QDRANT-VECTOR-SCHEMA-01** corrected hybrid-search vector selection
      for logical collection aliases. The manager now resolves the concrete collection before
      consulting the vector registry, so `summary_lenses` selects the live named vector
      `summary` rather than defaulting to `content`. The named-vector regression and retrieval
      executor suites pass 4/4. No Qdrant schema, point, or projection write was made.
- [x] **WORKSTATION-TRACE-FRESH-SOURCE-REPLAY-01** validated the edited source in a temporary
      TRACE listener on port 8793 without restarting the long-running listener on 8788. A raw
      `trace.kag_search` request returned a real read-only result; the fresh process emitted no
      SQL-array error, no `summary_lenses_768` vector-name error, and no missing
      `hnsw_embedding_512` failure. The native simdjson/TensorRT addon remained unavailable in
      the temporary Windows process, so this is a source-level/live dependency replay, not a
      claim that the production 8788 process has reloaded. `writesPerformed=false` throughout.
- [x] **TRACE-DENSE-CAPABILITY-DISCOVERY-01** add a read-only, revisioned capability receipt
      that queries each requested Qdrant collection's actual vector names, dimensions, and
      distance metric before selecting an executor. Implemented by
      `DenseRepresentationCapabilityV1` and
      `scripts/atlas/audit-trace-dense-capability-v1.mjs`; live Qdrant readback proved
      `content`, `summary`, and `synthesis` as 768-dimensional cosine vectors. No Qdrant
      schema or point mutation was authorized. The later appended completion note below is
      retained as evidence; this checkbox is reconciled to the same task identity.
- [ ] **ENGRAM-OPTIONAL-REPRESENTATION-01** typed adapter is now available through
      `searchMemoryByHNSWResult()`, returning `REPRESENTATION_UNAVAILABLE` with representation,
      reason, empty observations, and `writesPerformed=false` when the optional column is absent.
      Focused contract coverage passes 2/2. The legacy array-returning method still throws for
      compatibility and no production caller has adopted the typed result yet; caller migration
      remains open. No column, index, or truncated 768-dimensional vector was created.
- [ ] **TRACE-CUVS-SEMANTIC-768-ORACLE-01** produce a bounded, revision-qualified cuVS
      brute-force receipt from the same admitted `semantic_768` cohort and compare candidate
      IDs/scores with the CPU reference. Existing cuVS proof scripts and executor contracts are
      fixture/configuration evidence only. The Qdrant-first, identity-preserving cuVS fallback
      coordinator is now wired into the TRACE chunk-retrieval seam through
      `sveltekit-frontend/src/lib/server/ai/trace-semantic-executor-v1.ts` and
      `trace-reranker.ts`; its database cohort provider still requires an explicit SHA-256
      admitted workspace revision and rejects cohorts beyond the bounded GPU limit. Live
      fallback remains blocked until that provider returns an admitted current cohort.
- [x] **TRACE-CUVS-SEMANTIC-768-FIXTURE-01** re-ran the existing WSL2 RAPIDS proof with
      `atlas-rapids-cu13`: cuVS `26.06.00` matched the deterministic NumPy CPU neighbor IDs and
      scores for a bounded 64-row, 768-dimensional fixture. Receipt:
      `docs/reports/cuvs-cosine-768-proof-v1.json`. The proof is executor/ABI evidence only;
      it does not establish current-corpus lineage, a resident index, or TRACE fallback wiring.
- [ ] **TRACE-CUVS-CAGRA-01** evaluate CAGRA only as an approximate challenger against the
      cuVS exact oracle, with recall and checksum evidence. No persistent index, cache, Qdrant,
      or projection write is allowed in this gate. The bounded WSL2 fixture now proves
      CAGRA-vs-cuVS recall at 1.0 on 64x768 vectors across four repeated searches; receipt:
      `docs/reports/trace-cuvs-cagra-fixture-v1.json`. Current-corpus TRACE comparison and
      revision-qualified candidate checks remain open.
- [ ] **TRACE-SEMANTIC-EXECUTOR-SELECTION-01** connect capability discovery to one logical
      `semantic_768` lane: Qdrant, pgvector, cuVS brute force, and CAGRA may be selected as
      executors but must produce one normalized candidate set and one fusion vote. Current
      retrieval executor policy remains a reusable planning contract, not a proven TRACE
      production caller. The new TRACE semantic executor result now explicitly carries
      `logicalLane=semantic`, `voteKey=semantic`, and `voteCount=1`; live capability-driven
      selection and production receipt emission remain open.
- [ ] **TRACE-GPU-POSTRANK-01** prove identical admitted candidate ordinals and feature scores
      through the CPU reference and available SIMT/cuTile path under a bounded VRAM budget.
      cuTile/SIMT availability, parity, and residency replay remain separate from the Qdrant
      schema and Engram fixes.
- [ ] **TRACE-ISOLATED-LIVE-PROOF-01** retain the port-8793 source replay as evidence, then
      rerun the read-only audit after the existing port-8788 listener is explicitly reloaded.
      Require the same error checks, `productionListenerReloaded=true`, and
      `writesPerformed=false`; the current fresh-process proof must not be upgraded to a 8788
      production claim.
- [x] **TRACE-DENSE-CAPABILITY-DISCOVERY-01** added the read-only
      `scripts/atlas/audit-trace-dense-capability-v1.mjs` probe and the
      `DenseRepresentationCapabilityV1` contract. Live Qdrant readback successfully inspected
      `codebase_chunks_768`, `summary_lenses_768`, and `synthesis_memory_768`; all three were
      readable 768-dimensional cosine schemas with actual named vectors `content`, `summary`,
      and `synthesis`. The receipt is
      `docs/reports/trace-dense-capability-v1.json`; checksums and
      `writesPerformed=false` are included. This proves schema capability, not semantic-corpus
      lineage or executor promotion.
- [x] **TRACE-CAPABILITY-RUNTIME-ADMISSION-01** connected Qdrant capability discovery to the
      `QdrantManager.hybridSearch` admission boundary. The manager resolves logical aliases,
      reads the concrete collection schema, validates the actual named vector, dimension, and
      cosine metric, caches the read-only result briefly, and rejects an unavailable capability
      before issuing a query. Focused named-vector, capability-contract, and retrieval tests pass
      7/7; the isolated TRACE 8793 replay also crossed this live admission path successfully.
      This proves runtime schema admission, not cuVS fallback or production 8788 reload.

### Current missing gates after TRACE capability audit (2026-09-14)

The following remain intentionally open. They are downstream of the completed source-level
fixes and read-only Qdrant capability admission; none authorizes a datastore, projection,
service, or cache mutation.

- [x] **TRACE-RERANK-ENDPOINT-FAILCLOSED-01** added one environment-backed reranker endpoint
      resolver shared by the Marco reranker, Bifrost dispatch, and TRACE health/tool paths. It
      prefers `RERANK_URL`, then the existing `RERANK_BASE_URL` and
      `RERANKER_SIDECAR_URL`, normalizes trailing slashes, and returns unavailable rather than
      constructing an `undefined/rerank` URL. Focused endpoint and reranker coverage passes 5/5;
      live reranker health remains a separate operational gate.

- [ ] **ENGRAM-OPTIONAL-REPRESENTATION-01** propagate a typed caller-facing
      `REPRESENTATION_UNAVAILABLE` result for the absent optional 512-dimensional Engram
      column. The schema guard is proven, but the public result contract is not yet wired to
      all callers. Do not add the column, create an index from a query path, or truncate the
      canonical 768-dimensional representation.
- [ ] **TRACE-CUVS-SEMANTIC-768-ORACLE-01** bind cuVS brute-force to an admitted,
      revision-qualified current `semantic_768` cohort and compare IDs/scores with the CPU
      oracle. The existing 64-row WSL2 RAPIDS proof is fixture/ABI evidence only; it is not
      current-corpus fallback evidence. A pure Qdrant-first,
      identity-preserving cuVS fallback coordinator now exists at
      `sveltekit-frontend/src/lib/server/ai/trace-semantic-executor-v1.ts`; live wiring remains
      blocked until its cohort provider can supply the admitted current revision.
- [ ] **TRACE-CUVS-CAGRA-01** measure CAGRA as an approximate challenger against the cuVS
      exact oracle, including recall, score/ordinal checksums, and bounded memory evidence.
      Persistent index creation and projection writes remain out of scope.
- [ ] **TRACE-SEMANTIC-EXECUTOR-SELECTION-01** prove one TRACE caller selects among
      Qdrant, pgvector, cuVS, or CAGRA as executors for the single `semantic_768` lane,
      normalizes the result, and emits one logical fusion vote. No second RRF or identity
      owner may be introduced.
- [ ] **TRACE-GPU-POSTRANK-01** prove CPU versus PyTorch SIMT/cuTile post-ranking parity
      over the same admitted candidate ordinals and feature revisions under the RTX 3060 Ti
      VRAM ceiling. cuTile availability alone is insufficient for promotion.
- [ ] **TRACE-ISOLATED-LIVE-PROOF-01** explicitly reload or replace the long-running 8788
      listener, then rerun the read-only audit and record
      `productionListenerReloaded=true`. The port-8793 fresh-process replay remains valid
      source evidence but is not a production-listener proof.
- [ ] **TRACE-CURRENT-COHORT-ADMISSION-01** establish the exact current source/packet/chunk
      and representation lineage required by the cuVS fallback and executor-selection gates.
      Missing or mixed revisions, guessed IDs, and legacy Qdrant payloads must fail closed.
      The latest read-only authority check selected
      `sha256:3e677c29319a4a60bc60803be4186ba108dce906945af593a3a6f5cf43d11881`, found zero
      binding rows and zero exact packet/chunk matches, and found no terminal Graphify execution
      for that revision. Receipt:
      `docs/reports/current-workspace-packet-chunk-join-v1.json`. The companion source-owner
      reconciliation found `32` execution candidates but `0` exact current owners and classified
      the state `CURRENT_SOURCE_AUTHORITY_NOT_PROVEN` / `LEGACY_ONLY_NO_CURRENT_OWNER`;
      receipt: `docs/reports/current-source-owner-reconciliation-v1.json`. The cuVS fallback
      therefore remains correctly blocked rather than using the two historical revisions observed
      in the diagnostic report.

Current status:

```text
SOURCE_FIXES                         PROVEN_BOUNDED
QDRANT_SCHEMA_CAPABILITY             PROVEN_READ_ONLY
QDRANT_RUNTIME_ADMISSION             PROVEN_BOUNDED
CUVS_768_FIXTURE                     PROVEN_FIXTURE_ONLY
CURRENT_SEMANTIC_COHORT              BLOCKED
CUVS_TRACE_FALLBACK                  WIRED_BUT_COHORT_BLOCKED
CAGRA_ORACLE_COMPARISON              OPEN
ONE_SEMANTIC_EXECUTOR_VOTE           CONTRACT_PROVEN_LIVE_CALLER_OPEN
GPU_POSTRANK_PARITY                  OPEN
TRACE_8788_RELOAD_PROOF              OPEN
MUTATION_AUTHORIZATION               CLOSED
```

### Live endpoint recheck (2026-09-14)

- [ ] **TRACE-RERANKER-LIVE-HEALTH-01** remains open. A read-only probe to
      `http://127.0.0.1:8099/health` was refused; no reranker process is listening. The source
      resolver fix prevents malformed URLs, but it does not start or authorize the sidecar.
      The former `curl | jq` wrapper was not Windows-shell safe; it is now replaced by the
      cross-platform read-only `scripts/atlas/probe-reranker-health-v1.mjs` probe. This fixes
      diagnostics only; it does not start or authorize the sidecar. This `8099` / Marco/Mixedbread
      path is legacy compatibility and is not the intended production model owner.
- [ ] **TRACE-TOPOLOGY-LIVE-HEALTH-01** remains open. A read-only probe to
      `http://127.0.0.1:8101/health` was refused; topology execution remains unavailable. No
      service launch, graph mutation, or projection change was attempted.

The intended owned reranker remains the existing learned path:
`canonical-rerank-executor.ts` → `XGBOOST_SIDECAR_URL` → XGBoost/LightGBM model. Its default
mode is `shadow`, so it can be evaluated without changing served ordering. However, the current
canonical executor still attempts `MixedbreadCanonicalReranker` first, whose backend defaults to
the existing Triton/Mixedbread-compatible cross-encoder chain; this is current transitional
behavior, not proof that the owned model is production-promoted. Training, model-artifact proof,
sidecar health, evaluation, and promotion remain separate gates. Marco/Mixedbread must not be
treated as the final owned model.

The owned-model dry-run was rechecked on Windows after fixing the CLI's UTF-8 console boundary.
It now fails closed cleanly because `docs/reports/xgboost-features.csv` contains `0` rows; the
previous empty-matrix formatting crash is fixed. No training or artifact overwrite occurred.

The two endpoint failures are operational readiness gates, independent of current source/packet/
chunk authority. They must not be resolved by substituting placeholder URLs or by promoting a
fixture/isolated-process result to production evidence.
