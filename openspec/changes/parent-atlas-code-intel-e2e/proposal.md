## Why

An operator-drafted brief (2026-09-27) compared Parent Atlas against SocratiCode (a narrower,
more turnkey AST-chunking + hybrid-BM25/embedding + dependency-graph MCP tool) and concluded:
Parent Atlas has the broader architecture (revision-qualified identity, multiple lexical/semantic
lanes, ACE/BitFrost residency, GPU execution fabric, OpenSpec governance) but is *less complete
end-to-end* for the single concrete job SocratiCode already does well — "given a symbol, return
its definition/references/callers/callees/dependencies/blast-radius through one MCP call."

The brief's estimate: Parent Atlas is ~75% structurally implemented but only ~60-65% live-proven
for that narrower code-intelligence spine, because several of the most load-bearing joins are
still open (current-source authority, AST-observation-to-admitted-snapshot join, symbol/version
lineage, semantic representation writer ownership) even though the surrounding infrastructure
(Qdrant, Postgres, Neo4j, GPU bridges, CandidateOrdinalMap, ContextManifest contracts) is largely
built. This matches a pattern already recorded elsewhere in this repo (CLAUDE.md's
`LIBTORCH-DEPENDENCY-CENSUS-01`, corrected 2026-09-27 same day): an "optimistic" claim (there,
"5 dead LibTorch functions"; here, "components exist so the join must too") turned out wrong once
actually traced — evidence over assumption is the operating discipline this change inherits.

This change is a durable record of that brief's proposed target and five bounded gates, plus a
session handoff note (see "Session state" below) — it is a planning/tracking artifact, not a
completed implementation. No code was written for this change; the `pageRankGPU` graph-
construction decision it references is a separate, still-open, unrelated small decision (see
`scripts/atlas/gemma4-semantic-embedding-cache.mts`, not part of this change's scope).

## What Changes

- Record `PA-CODE-INTEL-E2E-01` as the target user story: given a symbol/function in the current
  workspace, return definition, references, direct callers, direct callees, file/module
  dependencies, semantic neighbors, and blast radius — all revision-qualified, through one MCP
  operation.
- Record five bounded prerequisite gates in dependency order (see tasks.md).
- Record that Clang/libclang/clangd should be evaluated as a **C/C++ semantic evidence challenger**
  alongside Tree-sitter/ast-grep — never a replacement, and never a second canonical identity
  authority (parser/LSP observation is evidence, not identity, per this repo's existing Parent
  Atlas Frozen Identity Contract).
- Record that SocratiCode (if evaluated at all) is a challenger/UX benchmark only — never a
  persistent second index, symbol authority, retrieval fusion owner, or packet owner.
- Add a staged, isolated comparison of the distinct Graft projects—TrailHQ
  (`trailhq/Graft`, npm `@nanonets/graft`) for structural working-tree context,
  and `amaar-mc/graft` (npm `graftmap`) for file-dependency personalized
  PageRank—plus Understand Anything. Record the canonical upstream and any
  evaluated fork separately: the current candidate reference is
  `jaccas/understand-anything`, reported as a fork of
  `Egonex-AI/Understand-Anything`; historical `razor-ai/understand-anything`
  and `Lum1104/Understand-Anything` references must be resolved to exact
  ancestry and commit before treating them as the same source. Also evaluate
  SocratiCode (`giancarloerra/SocratiCode`) and CodeGraph
  (`andysom25/codegraph`) against the existing Graphify/8095 and Parent Atlas
  code-intelligence path. Candidate installs belong in a disposable evaluation
  worktree/container with pinned revisions; they must not rewrite shared agent
  configuration, index production data, or acquire canonical ownership.
- Treat Graft, Understand Anything, SocratiCode, and CodeGraph as alternative
  challenger executors, not four components to deploy together. Select at most
  one bounded capability after a frozen-query benchmark. Adapt admitted
  observations through existing Atlas identity/revision resolution and the
  existing TRACE or `atlas-tools` MCP owner; do not create another canonical
  graph, vector store, MCP server, or ContextManifest compiler.
- Evaluate Understand Anything's Karpathy-style knowledge-base view as a
  documentation/navigation projection only. Source-linked `.okf` and existing
  document-governance owners remain authoritative; generated relationships and
  summaries are proposals until grounded and admitted.
- Keep orchestration and memory boundaries explicit: Mastra may orchestrate an
  existing bounded workflow if its live runtime is available; HMM/policy owns
  state/action recommendation, not workflow execution. BitFrost may cache only
  admitted revision/checksum-addressed ACE artifacts after the existing
  ContextManifest/readback gate.
- Record session-state handoff notes so a fresh session can resume without re-deriving context.

## Non-Goals

- Does NOT implement any of the five gates in this change — each requires its own bounded
  read-first audit before any code is written, per this repo's Duplication Prevention rule.
- Does NOT install candidate tools into the application/runtime environment or
  enable production indexing. A temporary, pinned, isolated install is allowed
  only for the comparison gates below, after license, telemetry, network,
  platform, data-scope, and generated-file behavior are recorded.
- Does NOT add all candidate tools to agent/MCP configuration or make any
  candidate a canonical graph, identity, embedding, RRF, evidence, or memory
  owner.
- Does NOT resolve the pending `pageRankGPU` graph-construction decision from the same session —
  that is a separate, smaller, already-flagged-to-the-operator decision.
- Does NOT re-litigate or duplicate `parent-atlas-unified-symbol-ranking` (already closed/archived
  with its own retrospective) — this change starts from where that one left off, does not reopen it.

## Session state (handoff notes, 2026-09-27)

Recorded here because this change was created specifically as a compaction/handoff artifact at the
end of a long session, per explicit operator instruction ("update tasks.md to review the new tasks
make notes for compaction handoff").

- **A concurrent agent session** was independently working `parent-atlas-nlp-sidecar-feature-compiler`
  in this same repo around the same time (observed via a pasted transcript showing
  `openspec instructions apply --change parent-atlas-nlp-sidecar-feature-compiler --json` and a
  "six-change workboard... 176/344 complete" status). Not this session's work — flagged in case of
  overlapping edits; not investigated further here.
- **This same session corrected a real evidence-gathering error** (relevant precedent for this
  change's gates): `CLAUDE.md`'s `LIBTORCH-DEPENDENCY-CENSUS-01` originally claimed 5 LibTorch
  N-API functions had zero real callers; a narrow grep pattern (`.fnName(` only) missed direct
  identifier calls and calls from repo-root `scripts/atlas/*.mjs` pipeline scripts outside
  `sveltekit-frontend/src`. All 5 turned out to have real callers, including two live API routes.
  Corrected in place same-day. This is the same failure mode the brief warns about ("optimistic
  census" vs. traced evidence) — treat it as a concrete example, not just a cautionary anecdote.
- **`scripts/atlas/gemma4-semantic-embedding-cache.mts`** was found broken since inception (module-
  type conflict, wrong Qdrant endpoint, wrong GPU call argument shapes for all 4 of
  pageRankGPU/attentionScoreGPU/kmeansWithCentroids/trainSOM). Fixed 3 of 4 (attention/k-means/SOM
  now genuinely work, verified by running it against live Qdrant data). `pageRankGPU` remains
  broken on purpose, pending an operator decision on how to build a graph from flat embeddings
  (k-NN similarity graph vs. drop PageRank from this script vs. something else) — **still open at
  end of session, not part of this change's scope, needs a direct answer next session if not
  answered before then**.
- **6 GPU pipeline scripts** had their native-addon load path fixed to check
  `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node` (the CUDA/LibTorch build) before
  falling back to the stale `build/Release` path: `dir-pipeline.mjs`, `gpu-full-pipeline.mjs`,
  `gemma4-semantic-embedding-cache.mts`, `prototype_feature_extract.mjs`,
  `phase2b-lexical-extraction-kmeans.mjs`, `smoke-gpu-hardening.mjs`. None of these fixes are
  committed yet as of this change being written.
- **`docs/archive-manifest.json` had a real pre-existing corruption** (a stray JSON object appended
  after the array's closing `]`, making the whole file invalid JSON) — repaired via `jq`, not
  compounded. Also fixed same-day.
- **CUDA 13.4/TensorRT-RTX 1.6 direction** was researched and recorded in root `CLAUDE.md` (a
  "DIRECTION ONLY, not started" section): TensorRT-RTX needs a side-by-side CUDA 13.4 lane; LibTorch's
  real migration target is CUDA 13.2.2+ (not 13.4, still prototype in PyTorch); RAPIDS/cuVS stays on
  13.0-13.3. Reference docs saved to `docs/.okf/tensorRTX7_26/`. Nothing installed.
- **None of the git changes from this session are committed.** `git status` should be checked at
  the start of the next session before assuming any of the above is landed.
