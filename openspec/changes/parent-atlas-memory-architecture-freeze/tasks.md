# Tasks — Parent Atlas memory architecture freeze

## Operator decision addendum — 2026-09-05

Decision authority: the operator's explicit memory/agent ownership instruction.
2.3 and 2.4 are resolved below; this is decision closure, not implementation proof.
Evidence-type packets layer/project from ContextCandidate/ContextLane, never replace
that model or introduce another ContextManifest compiler. Existing LOD axes keep their
owners; new concepts use evidenceDepth and residencyTier.

Memory classes remain separate: model execution state; exact derived cache;
ACE control state; retrieved evidence; statistical/routing features; external discovery
observations; durable workflow outcomes. None grants another class canonical authority.

Section 5's unchecked implementation ideas are OWNED_BY_OTHER_CHANGE, not this
recording change's execution queue: fingerprints/lexical statistics -> candidate-feature
execution fabric; discovery snapshots -> deep-research-ingestion; runtime prefix
identity -> kv-cache-adaptation-research. The new owner tasks retain their evaluation
and admission prerequisites. This does not close those implementation gates.

This change is a **recording pass**, not an implementation pass. Tasks below are the audit steps
already completed plus the follow-up scoping work, not feature implementation — see
`proposal.md`'s "What's actually new and worth scoping" for the actual build candidates.

## 1. Audit — done this session (2026-08-23)

- [x] 1.1 Grepped for `ContextManifest`, `CandidateOrdinal`, `AcePacket`, Valkey `SETBIT`/`BITOP`
  usage, and `LOD`/`levelOfDetail` across `sveltekit-frontend/src` — all four concepts already
  have live implementations. Findings recorded in `proposal.md`'s comparison table.
- [x] 1.2 Read `context-compiler.parent-atlas.ts` header/exports — confirmed real, working
  `ContextManifest`/`ContextCandidate`/`ContextLane` types and `compileContext()` pipeline exist,
  organized by retrieval lane not evidence type.
- [x] 1.3 Read `packet-lod-manifest.ts` — confirmed 4-level (0-3) LOD keyed by cache destination,
  not the proposal's 7-level evidence-type axis.
- [x] 1.4 Read `packet-bitmap.ts` — confirmed existing bitmaps are per-packet gate flags, not
  per-category candidate-membership bitmaps; different purpose, not a duplicate, safe to add the
  proposal's version alongside it under a different key prefix.
- [x] 1.5 Grepped for Tang/low-rank-sampling and pinned-memory/mmap-CUDA implementations —
  Tang-inspired sampling has no existing owner (genuinely new); pinned-memory code exists in
  `python/parent_atlas_tensor/*` but was not read in enough detail to say whether it already
  matches the proposal's specified chain.

- [x] 1.6 **2026-08-23 follow-up pass**: read `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`
  (the repo's dated May/June 2026 master backlog doc, referenced from `.claude/CLAUDE.md` as
  authoritative for lane completion tracking) looking for alignment/conflicts with this proposal.
  Found the third/fourth "LOD" naming collision (recorded in proposal.md and 2.4 above) this way —
  the doc's Phase 101B section references `ace:telemetry:{id}:lod0` Redis replay directly. Most of
  the rest of that doc's content is either already superseded by later-dated work in this repo
  (it self-flags "historical notes... not current proof unless restated in a later gate table") or
  orthogonal to this proposal (NAPI-RS bridge roadmap, archive/retire promotion gates, Phase
  101A-C content) — no other direct conflicts found in the sections read.

## 2. Follow-up scoping — not started

- [x] 2.1 **Done, 2026-08-23 follow-up pass — major finding.** Read `gpu_resident_executor.py`,
  `gpu_tile_cache.py`, `pytorch_gpu_helpers.py` in full. The pinned-staging chain already exists
  almost exactly as specified (`torch.empty(..., pin_memory=True)` →
  `tensor.to(device, non_blocking=True)` → `torch.index_select`). More importantly, these files
  are part of a much larger staged, gated, partially-applied integration bundle at repo root
  (`parent_atlas_tensor_residency_integration_v2/`, plus an earlier v1) that already covers most
  of this proposal's numerical-working-set and residency-state-machine scope via gates T0-T9 in
  its own `INTEGRATION_ORDER.md`. Its Gate T1 migration (4 `atlas_tensor_*` tables) is confirmed
  **applied but empty** live in Postgres (`docker exec legal-ai-postgres psql ... \dt
  atlas_tensor_*` → 4 tables, 0 rows each) — contradicting the bundle's own `CHECKS.json` which
  claims the migration is unapplied. Full writeup in proposal.md's "Pinned-staging /
  GPU-residency: a whole staged integration bundle already exists" section. **This substantially
  changes the recommended next action for this whole area of the proposal** — see the revised
  priority ranking in section 2 below.
- [x] 2.2 **Done, 2026-08-23 follow-up pass.** Field-by-field diff of the proposal's `AcePacketV2`
  shape against `canonical-packet-envelope.ts`'s `CanonicalAcePacketEnvelope` — see proposal.md's
  new "`AcePacketV2` vs. `CanonicalAcePacketEnvelope` — field-by-field" section. Net finding: the
  existing envelope already has real SOM/domain/community routing, real (differently-shaped)
  revision tracking, and already keeps bulk vector data out-of-band via `mmap_vector_refs`
  (independently arrived at the proposal's own "reference, don't inline" rule). Genuine gaps: no
  numeric ordinal identity field, no residency/LOD field (would be a 4th LOD meaning — see 2.4),
  no explicit policy-scoring fields (`hot`/`nextTopicProbability`/`historicalUtility`). Extending
  the existing type looks more appropriate than a parallel `AcePacketV2` type, but this is still
  an operator call per 2.3, not decided here.
- [x] 2.3 DECIDED 2026-09-05 by operator: layer/project from ContextCandidate/ContextLane;
  no replacement or second compiler. Historical question (resolved):
  Decide (operator call, not an agent call per `CLAUDE.md`'s Duplication Prevention
  section): does the evidence-type-axis typed packet model (`SourceEvidencePacket`/
  `AstEvidencePacket`/etc.) replace, layer onto, or project from the existing lane-axis
  `ContextCandidate`/`ContextLane` model? Do not start implementation of typed packet classes
  before this is answered — this is the single highest-risk item for creating a second
  uncoordinated "the" context-compilation system.
- [x] 2.4 DECIDED 2026-09-05 by operator: retain existing LOD owners; new axes use
  evidenceDepth/residencyTier, no fourth LOD meaning. Historical question (resolved):
  Decide (same caveat): does the 7-level evidence-axis LOD scheme replace or layer onto
  the existing 4-level cache-destination-axis LOD scheme in `packet-lod-manifest.ts`? **Updated
  2026-08-23 follow-up pass**: a third, unrelated "LOD" meaning was found live —
  `parent_atlas_documents.summary_lod0/1/2` (Drizzle schema + real Postgres columns, a
  summary-verbosity axis scoped to one document row, read by `hyperrag-packet-rpc.ts`) plus a
  single-tier `ace:telemetry:{packetId}:lod0` Redis key in `telemetry-compressor.ts`. This
  decision now needs to reconcile three existing "LOD" naming schemes (cache-destination,
  summary-verbosity, telemetry-compression-tier), not two, before layering on a fourth
  (evidence-kind) meaning under the same short name. At minimum, any new LOD axis introduced by
  this proposal should use a distinct term (e.g. `residencyTier`/`evidenceDepth`) rather than
  reusing "LOD" a fourth time, given how much collision the name already has.
- [ ] 2.5 If proceeding with the candidate-ordinal-indexed membership bitmap + `BITOP AND`
  admission-mask capability (lowest-risk item, no conflict with existing `PacketBitmapCache`):
  scope as its own small change, propose a Valkey key naming convention (e.g.
  `ace:membership:{category}:{value}` vs. the existing `atlas:mask:packet:{packetId}`) that's
  unambiguously distinct from the existing per-packet gate bitmap prefix.
- [ ] 2.6 Verify PyTorch's `torch.from_file`-cannot-be-pinned constraint against the actual
  PyTorch version pinned in this repo's Python environment (`requirements*.txt`/`pyproject.toml`)
  — lower priority now that 2.1 found the pinned-staging code already avoids this exact trap
  (stages via `torch.empty(..., pin_memory=True)` + `index_select`, not `torch.from_file` mmap
  directly to pinned), but still worth confirming the version-specific constraint for anyone
  extending that code.
- [x] 2.7 **Done, 2026-08-23 same-day follow-up — Gates T2 and T3 both PASS.** Correction first:
  the bundle isn't merely "unapplied" — nearly all 29 of its TypeScript files are already
  byte-identical in the live tree (`sveltekit-frontend/src/lib/server/atlas/tensors/*`), and the
  3 that differ (`feature-matrix-contract.ts`, `latent-lod-contract.ts`,
  `tensor-artifact-contract.ts`) are *live-tree-ahead* of the bundle (e.g.
  `tensor-artifact-contract.ts` is 124 lines live vs. 39 in the bundle) — the live repo continued
  developing this system past the bundle's snapshot. Ran the actual gate work directly:
  - **Gate T2** (`python -m parent_atlas_tensor.cli build-feature`): built a real `feature_matrix_5`
    Arrow IPC artifact from a 3-row JSONL fixture, round-trip-verified via `pyarrow.ipc.open_file`
    — schema confirmed `features5: fixed_size_list<float>[5]` + `topology4:
    fixed_size_list<float>[4]`, content matched input exactly, sha256-stamped.
  - **Gate T3** (`GpuTileCache.promote()` + `.exact_cosine()` directly): staged a real 200×768
    float32 matrix through the actual pinned-memory → async-H2D path onto `cuda:0` (RTX 3060 Ti,
    confirmed live via `torch.cuda.get_device_name(0)`), computed exact cosine top-10 on GPU, and
    compared against an independent from-scratch CPU numpy oracle. **Exact index match, max
    float-value diff 7.45e-9** (float32 rounding noise, not a real discrepancy).
  - Full receipt: `docs/reports/tensor-residency-gate-t2-t3-proof-2026-08-23.json`. Explicitly
    scoped `notProven` in that receipt: CAGRA parity (Gate T6), real production packet data (this
    used a synthetic fixture/matrix, which Gate T2's own wording explicitly allows), and ACE
    residency-policy wiring (Gate T4) — the tile cache was called directly, not through
    `ace-residency-policy.ts`.
  - Per this repo's own status-language convention, this is genuine `DRY_RUN_PROVEN` /
    `APPLY_PROVEN`-adjacent evidence for T2/T3 specifically (real code path, real GPU, real
    verification against an independent oracle) — not yet `XGBOOST_GPU_RUNTIME_PROVEN`-style full
    production proof, since it didn't touch live packet data or the ACE wiring layer.
- [ ] 2.8 Reconcile `parent-atlas-tensor-residency-integration/` (v1) against
  `parent_atlas_tensor_residency_integration_v2/` — confirm v2 supersedes v1 (both share the same
  Gate T0-T9 structure and T1 migration filename; v2 adds a "Neural LOD extension order" section
  v1 doesn't have) before working from v2 as canonical, and decide whether v1 should be archived
  per this repo's archive-not-delete convention once confirmed superseded.

- [x] 2.9 **Done, 2026-08-23 same-day follow-up — Gate T4 proof, PASS with a real gap found.**
  Wired `ace-residency-policy.ts`'s actual `tileUtility()`/`rankEvictionCandidates()` (still zero
  other production callers, confirmed via grep before writing this proof) to compute a real
  residency decision over 5 synthetic tiles under a memory budget that fits only ~2, wrote it as
  JSON (`scripts/atlas/prove-tensor-residency-gate-t4.mts`), then drove the real
  `GpuTileCache` on the live RTX 3060 Ti with that decision
  (`python/parent_atlas_tensor/prove_gate_t4.py`). **First attempt (promote in ACE's
  utility-descending order) produced the WRONG residency outcome** — `GpuTileCache` is a plain LRU
  cache (oldest-inserted = first evicted), and its docstring says the caller must promote in
  ascending-utility order for LRU recency to align with ACE's utility ranking; promoting in the
  naive descending order silently kept the *lowest*-utility tiles resident and evicted the
  highest-utility ones, with no error or warning. Second attempt (ascending order, per the
  documented convention) matched ACE's prediction exactly. Full evidence, both runs:
  `docs/reports/tensor-residency-gate-t4-proof-2026-08-23.json`.
- [x] 2.10 **Fixed same-day, 2026-08-23.** Added `GpuTileCache.promote_ranked()` (Python) — takes
  tiles in ACE's natural utility-descending order and performs the ascending-order LRU reversal
  internally, so a caller passing ACE's ranking straight through can no longer get backwards
  residency. Confirmed zero other callers of `GpuTileCache.promote()` existed before this change
  (safe to add an API surface, nothing else depends on the old contract). Updated
  `prove_gate_t4.py` to use the new helper (still passes). Added
  `python/parent_atlas_tensor/test_gpu_tile_cache.py` (3 tests, previously this module had **zero**
  test coverage): one pins down the old plain-`promote()` footgun as a documented regression
  guard (so a future refactor can't silently reintroduce or silently fix it without a test
  noticing either way), one proves `exact_cosine()` against a CPU oracle (mirrors the Gate T3
  proof as a permanent regression test, not just an ad hoc script run), one proves
  `promote_ranked()` produces the correct residency outcome. All 3 new tests pass, plus the 2
  pre-existing tests in this Python package (`test_gpu_resident_executor.py`,
  `test_exact_space_partition.py`) still pass — 12/12 total.

- [x] 2.11 **Done, 2026-08-23 same-day follow-up — Gate T6, real negative result.** Ran
  `python -m parent_atlas_tensor.prove_gate_t6` under WSL2 (`atlas-rapids-cu13` conda env, cuVS
  26.06.00 — RAPIDS is Linux-only on this workstation). Step 1 (cuVS `brute_force` exact vs. an
  independent CPU numpy oracle): 100% recall at both 5,000 and 15,000 rows, confirmed trustworthy.
  Step 2 (CAGRA vs. that same brute-force result): recall 77% → 45% going from 5K → 15K rows
  (worse with more data, not better) and slower than brute-force at both scales on this 8GB GPU
  (VRAM-constrained during the run, ~1.2GB free — `llama-server.exe` held ~5.8GB — capping the
  test below real corpus scale). **Verdict: CAGRA NOT cleared for promotion with default params at
  these scales** — correctly matches Gate T3/T6's own "no CAGRA promotion before this passes"
  precondition. Full receipt: `docs/reports/tensor-residency-gate-t6-proof-2026-08-23.json`. New
  script kept per this repo's "never delete working scripts" convention:
  `python/parent_atlas_tensor/prove_gate_t6.py`.
- [ ] 2.12 **New follow-up, found by 2.11.** If CAGRA is revisited later: (a) tune
  `graph_degree`/`intermediate_graph_degree`/`itopk_size` instead of library defaults, and
  (b) re-run at real corpus scale (40K-105K rows) with the full 8GB GPU budget free (stop
  `llama-server.exe` first, or run on a machine without that contention) before drawing any
  conclusion about production viability. Brute-force `exact_cosine`/`exact_search` (both already
  proven in Gates T3/T6) remain the trustworthy ANN path until then — do not let this finding be
  read as "CAGRA doesn't work," only as "CAGRA isn't proven ready at the scales/params tested
  here."

- [x] 2.13 **Done, 2026-08-23 same-day follow-up — the headline finding of this whole
  tensor-residency exploration.** Ran `npx vitest run tests/atlas/tensor-residency/` (8 files,
  11 tests, all PASS — shallow structural tests, not behavioral proofs like the T2-T4/T6 receipts)
  then audited all 34 non-spec files under `src/lib/server/atlas/tensors/` +
  `src/lib/client/atlas/visualization/lod-glyph-contract.ts` for real logic vs. pure type/interface
  stubs, and for callers anywhere in the app outside that directory. **Result: zero files in this
  entire subsystem are imported by anything outside `src/lib/server/atlas/tensors/` itself** —
  `grep`ed `src/routes/`, `src/lib/server/ace/`, `src/lib/server/retrieval/`, and
  `src/lib/server/atlas/` (excluding `tensors/`) for imports of any tensor-residency module or
  `tensor-runtime`/`tile-directory`/`ace-residency-policy`/`gpu-backend-contract`, zero hits. Every
  gate this session proved (T2/T3/T4 PASS, T6 correctly FAIL) was proven by directly invoking the
  Python/TS modules from bespoke proof scripts — **none of it is reachable from a real request**.
  3 files (`cache-tier-contract.ts`, `gpu-backend-contract.ts`, `metrics-registry.ts`) are pure
  type/constant declarations with zero runtime logic at all — `CREATED` only, not even minimally
  wired, per this repo's own status-language convention.
  - **Separately confirmed**: there IS a real, live, production-reachable GPU path that has
    nothing to do with this subsystem — `src/routes/api/v1/chat/completions` (via
    `openai-facade.ts`) → `attention-head-ranker.ts` → `LibTorchReranker`
    (`src/lib/server/ai/libtorch-reranker.ts`) → the native LibTorch N-API bridge
    (`tensorrt_bridge.node`, C++, in-process, zero-copy). This is architecturally different from
    `parent_atlas_tensor` (stateless per-call candidate scoring vs. persistent GPU-resident tile
    caching across requests) — not necessarily a duplicate in *purpose*, but there is **zero
    evidence anyone has decided how or whether the two should connect**, and today the elaborate,
    individually-gate-proven residency system contributes nothing to any live request while this
    separate, simpler path does the actual production GPU reranking work.
  - **This reframes every T2/T3/T4/T6 result recorded above**: they prove the *mechanisms* work
    (Arrow artifacts round-trip, GPU tile staging is correct, ACE utility ranking can drive real
    residency decisions, CAGRA isn't ready) — they do NOT prove the *pipeline* is finished, because
    a pipeline with no entry point delivers zero user-facing value regardless of how many
    internal gates pass. "Finishing the pipeline" requires an explicit wiring decision before
    further gate-proving is worth the effort.
- [ ] 2.14 **New, highest-priority follow-up from 2.13 — an operator decision, not an agent
  decision, per `CLAUDE.md`'s Duplication Prevention section.** Before any further work on Gates
  T5/T7/T8/T9 or on wiring `parent_atlas_tensor` into a real caller: decide what
  `parent_atlas_tensor`'s relationship to the live `LibTorchReranker`/`attention-head-ranker.ts`
  path actually is. Candidate framings (not decided here): (a) **complementary layers** — residency
  system manages which large `semantic_768`/candidate matrices stay GPU-resident, `LibTorchReranker`
  scores whatever's already resident; wiring means having the residency system feed materialized
  matrices to the reranker instead of the reranker's callers building fresh Float32Arrays each
  call; (b) **the residency system is a research/experiment track** (`EXPERIMENT` per this repo's
  classification vocabulary) not intended for near-term production wiring, in which case further
  gate-proving should stop until that changes; (c) **the residency system should replace** the
  current stateless-scoring approach for high-QPS paths where repeated re-transfer of the same
  candidate data is wasteful. Whichever framing is chosen determines whether Gates T5/T7/T8/T9 are
  worth running next, or whether this whole change should pause pending a real integration plan.

## 3. Governance-only, zero implementation cost

- [x] 3.1 **Done.** Added the wire-format layering rule to `claude.md` as a new canonical section
  ("🧮 Wire Format Layering Rule") — see the commit that recorded this proposal.

## 4. Explicitly out of scope for this change

- [ ] 4.1 Do not implement `TANG_INSPIRED_LOW_RANK_SHORTLIST`'s actual sampling math here — this
  change only records the naming/role decision (it decides which valid candidates deserve more
  compute; it never decides which evidence is true). The algorithm itself is unscoped.
- [ ] 4.2 Do not touch `context-compiler.parent-atlas.ts`, `packet-lod-manifest.ts`, or
  `packet-bitmap.ts` as part of this change — this is a recording pass; 2.3/2.4 must be answered
  by the operator before any of those files change.

## 5. Lexical/BoW/query-fingerprint layer + Ornith recurrent-state boundary (2026-09-05, fifth
   addendum — recording only, nothing built)

- [x] 5.1 Audited whether `LexicalFingerprintV1`, `QueryFingerprintV1`, `SearchSnapshotV1`,
  `OrnithPrefixIdentityV1` already exist as real types before recording the proposal — grep found
  zero matches for all four across `sveltekit-frontend/src`. Genuinely new, not a duplicate.
- [x] 5.2 Audited existing lexical/FTS infrastructure before proposing `LexicalFingerprintV1` —
  `to_tsvector`/`websearch_to_tsquery` FTS and pg_trgm fuzzy matching already exist across 30+
  files; confirmed `ts_stat()` (the corpus-statistics/IDF-enabling function) has zero live usage.
  The gap is specifically the corpus-statistics layer, not lexical search itself.
- [x] 5.3 Audited existing SearXNG/LDR integration before proposing `SearchSnapshotV1` — confirmed
  live and extensive (35+ files: `ldr-orchestrator.ts`, `web-search.ts`, `research_tools.ts`,
  `ldr-ace-bridge.ts`). Read `web-search.ts`'s real `WebSearchResult`/`WebSearchResponse` types
  directly and confirmed neither carries a checksum, `observedAt`, or reproducibility contract —
  the gap is durable/reproducible snapshot identity, not search capability.
- [ ] 5.4 Not built: `OrnithPrefixIdentityV1` (checksum-bound llama.cpp prefix-cache identity —
  `sha256(modelRevision, chatTemplateRevision, toolSchemaRevision, systemPromptRevision,
  contextManifestPrefixChecksum)`). Hard rule recorded: never build a "save/restore Ornith's
  recurrent (Gated DeltaNet-style) state" feature — upstream llama.cpp itself treats rewinding that
  state as not equivalent to a conventional KV-cache rewind, and general state
  injection/restoration is an active, unresolved upstream concern. Use `cache_prompt`/
  `cache_reuse` (already mandated by this repo's canonical llama-server startup contract) as-is;
  record cache hit/miss as telemetry only, never as a correctness input.
- [ ] 5.5 Not built: `LexicalFingerprintV1` and the `ts_stat()`-derived IDF feature. Explicitly
  gated: do not build unless an evaluation proves value over what FTS/pg_trgm already provide —
  matches this repo's existing "don't add a 5th retrieval lane" discipline, applied to lexical/BoW.
- [ ] 5.6 Not built: `SearchSnapshotV1`. Hard rule recorded: a SearXNG/web-search snippet is
  discovery evidence, never canonical document evidence — the correct path snapshots the query/
  result-set, then fetches and hashes the real source URL through the existing canonical evidence
  pipeline, never persists snippet text as if it were retrieved document content.
- [ ] 5.7 Not built: `QueryFingerprintV1`. Recorded as a routing hint only, explicitly not an
  identity or authorization boundary — same posture already required of
  `TANG_INSPIRED_LOW_RANK_SHORTLIST` and SOM clustering elsewhere in this document.
- [ ] 5.8 Not decided: where this addendum's items slot into the frozen P0–P4 queue (section 2's
  fourth addendum). This section is additive to that queue; sequencing is an explicit operator
  decision, not made here.
