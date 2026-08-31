# Tasks

- [ ] T0 ownership audit completed; no duplicate canonical runtime owner introduced.
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
- [ ] T3b mmap CPU buffer → actual pinned (page-locked) host memory. **NOT_PROVEN.** T3a's
      `open_mmap()` read is an ordinary mmap, not `cudaHostRegister`/pinned allocation — no
      pinned-memory API was exercised. Do not describe T3a as having proven pinned-host transfer.
- [ ] T3c pinned host → `cudaMemcpyAsync` H2D → GPU-resident tile reuse across requests.
      **NOT_PROVEN.** T3a's sidecar call builds a fresh `cuvs.neighbors.brute_force` index
      per-request from data sent over HTTP each time — there is no persistent GPU-resident tile
      being reused across calls yet. This is real, separate future work, not implied by T3a.
- [x] T6 cuVS brute-force same-matrix parity proven. **SATISFIED_BY_T3A** — one physical
      experiment, one canonical evidence record. (Superseded 2026-08-10: previously this line
      said "same live run as T3 above"; renamed to point at T3a specifically now that T3 has
      been split. Do not re-run this as a separate experiment — T3a already is the T6 proof.)
- [ ] T4 ACE state transitions proven with deterministic eviction ordering.
- [ ] T5 Valkey/BitFrost revision-qualified metadata keys + invalidation policy proven.
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
- [ ] T6b-p CAGRA persistent-index benchmark: build once, warm up, search-only p50/p95.
      **NOT_PROVEN, not started.** Needs a sidecar change (persist the CAGRA index handle across
      requests instead of rebuilding per-call) before this can be measured. Until this exists,
      no claim about CAGRA's true crossover point (build-once-search-many) can be made — T6b-e
      is not a substitute for it.
- [ ] T6c RAPIDS KMeans centroids/labels persisted with artifact lineage.
- [ ] T7 CPU worker staging bounded at four workers and measured.
- [ ] T8 unordered packet/chunk assembly deterministic under shuffled completion.
- [ ] T9 n-ary incidence artifact emitted as sparse membership data, not dense adjacency.
- [ ] T10 visualization consumes derived topology/LOD state only.

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
- [ ] **GPU-EXP-13** Reconcile semantic HNSW/pgvector/Qdrant executors against
  one CandidateOrdinal universe; HNSW remains an ANN executor, not a new lane.
- [ ] **GPU-EXP-14** Build a revision-qualified `GraphProjectionArtifactV1`
  with vertex/edge checksums and an explicit `GraphOrdinal` mapping.
- [ ] **GPU-EXP-15** Prove bounded multi-hop traversal on the frozen graph;
  default depth <=2, expansion <=3, hard maximum <=4, with predecessors/paths.
- [ ] **GPU-EXP-16** Run NetworkX CPU graph parity first, then cuGraph parity;
  internal renumbering must not escape the projection adapter.
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
