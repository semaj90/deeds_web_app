Gate-by-gate, matching this repo's established discipline for large external
plans (see `parent-atlas-agentic-repair-bundle-integration`,
`parent-atlas-graph-runtime-enhancement`, and this session's own
`parent-atlas-graph-analysis-contract` Patch C–E precedent — audit before
code, live-verify before calling anything done, record findings in this
file as they're discovered). Nothing past task 0.1 is implied to start just
because an earlier task finished.

## OD. Runtime ownership governance (2026-08-09) — DONE, before any pass-registry code

Governance-only slice, landed ahead of the rest of this change's tasks per
explicit user direction: "the ownership governance should happen BEFORE new
sidecar passes/backends are added." No sidecar code touched by this section.

- [x] OD0 Audited before editing: read `CLAUDE.md`'s existing "Duplication
      Prevention" section, this change's own proposal/design, this change's
      `acp-sidecar-tool-registration` spec, `canonical-rerank-executor.ts`,
      `graph-analysis-runner.ts`, `router-matrix.ts`/`query-router-4x4.ts`,
      `ACPToolRegistry.ts` — all already confirmed live earlier this session,
      reused rather than re-verified to conserve context budget.
- [x] OD1 Extended `CLAUDE.md`'s existing "Duplication Prevention" section
      with a new "One Canonical Runtime Owner Per Capability" subsection —
      the classification vocabulary (`CANONICAL_OWNER`/`BACKEND`/`ADAPTER`/
      `EXPERIMENT`/`COMPATIBILITY`/`FIXTURE_ONLY`/`DEAD`), the "search →
      classify → extend, don't create a peer owner" rule, explicit
      prohibitions (duplicate RRF votes, duplicate canonical writers,
      duplicate `representation_id`s, duplicate dispatchers, duplicate ACP
      tools, duplicate AST identity authorities, sidecars created just
      because a library exposes an API), and the baseline/new-violation
      distinction. Extended the existing section rather than creating a
      parallel one — same governance topic.
- [x] OD2 Added the `runtime-owner-deduplication` OpenSpec capability
      (`specs/runtime-owner-deduplication/spec.md`, 5 requirements) to this
      change — cross-cutting, not an NLP implementation detail, per explicit
      direction.
- [x] OD3 Created `docs/architecture/runtime-ownership-registry.json`
      (schema `atlas.runtime-ownership.v1`). Populated **only** from
      repository evidence already gathered live this session — `graph_analysis`
      (owner: `graph-analysis-runner.ts::runGraphAnalysis`, 4 proven
      backends, 4 known-duplicate entries classified DEAD/FIXTURE_ONLY/
      COMPATIBILITY), `rerank` (owner: `canonical-rerank-executor.ts`, 13
      unclassified peer files listed, not silently assumed safe), `structural_extraction`
      (canonical contract `AstUnit`/`atlas_ast_nodes` vs. current producer
      `treesitter-chunker` kept distinct), `lexical_exact` (owner:
      `router-matrix.ts`), `acp_sidecar_tools` (owner: `ACPToolRegistry.ts`).
      `semantic_768`'s owner recorded as `UNKNOWN`/`unproven: true` —
      **not guessed**, per explicit instruction, since this session never
      independently confirmed which service generates it in production.
- [x] OD3b Created `docs/architecture/runtime-ownership-baseline.json` — the
      baseline/new-violation distinction the user identified as the critical
      missing piece ("without it the first ownership CI run will discover
      all the architectural debt you already know exists and either fail
      forever or tempt the agent into a giant cleanup"). Lists the 13
      unclassified reranker files and 4 graph_analysis duplicates as
      `tolerated` — known debt, not failures.
- [x] OD4 Created `scripts/atlas/audit-runtime-ownership.mjs` — mechanical
      checks only (schema version recognized, no duplicate capability IDs,
      no entry double-classified as both `CANONICAL_OWNER` and a
      backend/duplicate, baseline-aware new-vs-known-existing distinction).
      Does not attempt the more ambitious checks from the original brief
      (ACP tool name uniqueness, `FeatureRegistry` ID uniqueness, RRF
      fusion-vote counting) — those require registries/integrations not yet
      proven to exist this session; building checks against unconfirmed
      systems would itself violate this governance layer's own "don't guess"
      rule. Extending the script once those systems are confirmed is a
      follow-up task, not done here.
- [x] OD5 Audit output format implemented per spec:
      `schema_version, status, capabilities_checked, violations, warnings,
      known_existing, not_proven`.
- [x] OD6 Added `npm run atlas:audit:ownership` (points to
      `node ../scripts/atlas/audit-runtime-ownership.mjs` from
      `sveltekit-frontend/`, matching this repo's existing `atlas:*` script
      naming convention).
- [x] OD7 `scripts/atlas/audit-runtime-ownership.test.mjs` — runnable-script
      convention (matching `qdrant-parity-repair.test.mjs`), not vitest,
      since `scripts/atlas/*.mjs` in this repo run standalone. Covers the 4
      required minimum cases (one owner + backends passes; two
      `CANONICAL_OWNER` entries for one capability fails; a baseline-listed
      item is `known_existing` not a violation; an item not in the baseline
      is a new violation) via a pure reimplementation of the audit's core
      check, plus a 5th cross-check that runs the real script against the
      real live repo registry to catch drift between the test's
      reimplementation and the actual logic. **Live run 2026-08-09: 6/6
      cases PASS.**
- [x] OD8 This section itself is the OpenSpec task checkpoint requested —
      placed before section 0 (pre-flight) rather than after, so it's
      structurally impossible to reach the sidecar-implementation gates
      without this section already being visible as done-or-not.

**OD-Result (2026-08-09, live)**: `npm run atlas:audit:ownership` from
`sveltekit-frontend/` → `status: 'PASS'`, `capabilities_checked: 6`,
`violations: []`, 1 `known_existing` entry (the 13 unclassified reranker
files, correctly recognized as baseline debt not a new violation), 1
`not_proven` entry (`semantic_768`, correctly flagged rather than guessed).

**Explicitly not done in this slice** (per hard scope): no reranker files
consolidated or deleted, no PageRank code modified, no graph algorithm
behavior changed, no retrieval scoring/RRF/Qdrant/AST-identity changes, no
sidecar migration, no promotion of CheiRank/k-core/betweenness. Graph status
unchanged: PageRank/Louvain/Leiden/CheiRank/k-core remain exactly
`RUNTIME_SMOKE_PROVEN`, not re-evaluated or promoted by this governance work.

## 0. Pre-flight (do this before any pass-registry code)

- [x] 0.1 Rebuild `docker/miniforge-nlp-sidecar` and hit its `/health`
      endpoint live — confirm `treesitterChunker.available: true` (the
      Dockerfile already lists `treesitter-chunker` as a pip dependency and
      the source already probes for it, but this has not been verified live
      in a running container this session). If false, diagnose why
      (import name mismatch, install failure) before proceeding — do not
      build pass-registry work on an assumption.
- [ ] 0.2 Read `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts`
      and its 22 dependent files in full. Confirm the existing
      `NlpAnalyzeRequest`/`NlpAnalyzeResponse` contract's exact shape and
      every distinct `extractionMode` value currently in use, so the
      additive pass-registry extension (task 1.1) doesn't collide with or
      break any of them.
- [ ] 0.3 Read `openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/`
      in full — it owns the 5-domain classification and
      `ExperimentFeatureMatrix` this change's `control5` slots into. Don't
      redefine the taxonomy here.
- [ ] 0.4 Read `openspec/changes/parent-atlas-semantic-768-canonical-contract/`
      in full — confirms which service actually owns `semantic_768`
      generation before this change's semantic-card work assumes it can call
      it directly.
- [x] 0.5 Add a read-only bind mount to
      `docker/miniforge-nlp-sidecar/docker-compose.yml`
      (`../..:/workspace:ro` or equivalent — confirmed live 2026-08-09 that
      none currently exists). Required before any structural pass that reads
      files from disk (as opposed to inline request content) can work at all.
- [ ] 0.6 Read `sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts`
      and `query-router-4x4.ts` in full — confirm `lexical_exact`'s current
      live behavior before deciding whether `lexical.rg_evidence` (design.md
      D7) is needed at all, and if so, exactly what it should and should not
      overlap with.
- [ ] 0.7 Read `src/lib/server/services/knowledge-search/ACPToolRegistry.ts`
      in full — confirm the registration API shape
      (`name, description, category, inputSchema, outputSchema, examples`,
      `supportsDryRun`) before designing the coarse-grained sidecar tool
      wrappers (design.md D8).

**Sequencing boundary (2026-08-11)**: packet-level NLP can start once the
preflight contract audit is complete. Document-root / tree-dependent
promotion stays blocked until the duplicate-root / idempotency issue in the
tree-lineage work is closed.

## 1. AnalysisPassResult envelope + pass registry wiring (NLP1)

- [x] 1.1 CORRECTED 2026-09-03 (found while working `parent-atlas-search-classifier-sidecar` task
      2.0) — this checkbox was stale. `AnalysisPassResult` dispatch is fully wired and live:
      `python/miniforge_nlp_sidecar.py::_build_pass_results()` (~line 1794) dispatches all 7 pass
      families (structural/lexical/linguistic/semantic/sequence/rerank/grounded) via an `add_pass()`
      helper, called from `_analyze()` and populated onto `AnalyzeResponse.pass_results`
      (snake_case on the wire; matches the TS `AnalysisPassResult` type per design.md D1). Read the
      code directly, not assumed — this task is done, not open.
- [x] 1.2 CORRECTED 2026-09-03 — confirmed by code inspection: `_build_pass_results()` line 1803-1805
      returns `[], [], [], [], None, None` immediately when `req.passes` is empty and
      `grounded_extraction_required` is falsy — the existing `extractionMode`-only request shape (no
      `passes` field) hits this early-return and produces zero `pass_results`, i.e. byte-identical to
      pre-change behavior by construction. Not independently live-tested against a running server in
      this session — the code-level guarantee is confirmed, a live HTTP round-trip proof is not.

## 2. Structural pass (NLP2)

- [ ] 2.1 Wire `treesitter_chunk` pass to emit `AstUnit` records matching
      `atlas_ast_nodes`' live schema exactly (field names verified via `\d
      atlas_ast_nodes` in this change's design.md — don't re-derive from
      scratch). Confirm no `packet_key` is ever written at this stage.
- [ ] 2.2 Live-verify against a real file: run the pass, inspect the
      `AstUnit` output, confirm `parser_revision`/`grammar_revision` are
      populated (needed for the "swap the producer later" guarantee in
      design.md D2).

## 3. Linguistic pass (NLP-adjacent, spaCy)

- [ ] 3.1 Wire the `spacy` pass scoped to comments/docstrings/errors/query
      text only (per design.md D3) — explicitly exclude source identifiers
      from the input set.
- [ ] 3.2 Live-verify with one real docstring/comment example, confirm noun
      chunks / dependency edges come back sensible (not garbage on code
      tokens that slipped through the exclusion).

## 4. AST-conditioned semantic card wiring (NLP3)

- [ ] 4.1 Wire the `SemanticCodeCard` assembler (`AstUnit` + linguistic
      facts → bounded card text) per design.md's example shape. The schema
      already exists in `sveltekit-frontend/src/lib/server/analysis/nlp-feature-compiler.ts`;
      this task is to connect the producer and consumers, not invent a new
      representation.
- [ ] 4.2 Confirm the card is sent as embedding *input* to whatever service
      task 0.4 identified as the canonical `semantic_768` owner — do not
      re-implement embedding generation in this sidecar.
- [ ] 4.3 Live-verify: one real function → card → `semantic_768` vector,
      confirm the `AstUnit` fields remain independently queryable afterward
      (not just recoverable by decoding the vector).

## 5. HMM sequence pass (NLP4)

- [ ] 5.1 Define the discrete observation vocabulary (per design.md D4) and
      an observation-builder that derives it from other passes' outputs.
- [ ] 5.2 Wire `hmmlearn` `CategoricalHMM` — Baum-Welch (offline training)
      and Viterbi (online decoding), CPU-only. Confirm no GPU device is
      requested for this pass.
- [ ] 5.3 Live-verify against a small synthetic `RouteTrace` history —
      confirm Viterbi produces a plausible state sequence, not garbage.

## 6. Reranker ownership audit (must complete before section 7)

- [ ] 6.1 Classify all 14 files in
      `sveltekit-frontend/src/lib/server/retrieval/*reranker*` +
      `canonical-rerank-executor.ts` as live/orphaned/superseded — grep for
      actual call sites of each, not just existence. `canonical-rerank-executor.ts`
      is already confirmed canonical (imports `blendScores`/`RuntimeReranker`
      from `runtime-reranker.ts`); classify the other 13 explicitly.
- [ ] 6.2 Record the classification in this file (or a dedicated audit
      section) before task 7 starts — do not proceed to wiring new reranker
      tiers until this is done, matching this session's established
      "audit before code" discipline.

## 7. MiniLM + Mixedbread reranker tiers (NLP5) — blocked on section 6

- [ ] 7.1 Wire MiniLM (`ms-marco-MiniLM-L6-v2`, `sentence-transformers`
      `CrossEncoder`) as `RERANK_FAST` behind `canonical-rerank-executor.ts`
      — for the ~30-50 candidate tier, not a new standalone file.
- [ ] 7.2 Wire Mixedbread (`mxbai-rerank-base-v2`) as `RERANK_DEEP`, disabled
      unless explicitly requested — for the ~8-20 candidate tier.
- [ ] 7.3 Live-verify both against a real candidate set, confirm scores are
      sane and the existing canonical rerank cache/fallback behavior
      (24h CrossEncoder cache, XGBoost fallback per
      `canonical-rerank-executor.ts`'s existing docstring) still works
      correctly with the new backends plugged in.

## 8. NetworkX/cuGraph parity fixture (NLP6)

- [ ] 8.1 Cross-reference `openspec/changes/parent-atlas-gpu-graph-vector-substrate/`
      — this task may already be covered there (its Gate 5 covers cuGraph
      k-core/betweenness parity). Do not duplicate; extend if a BFS/SSSP
      parity fixture doesn't already exist there.

## 9. FeatureCompiler: pass results → ExperimentFeatureMatrix + control5 wiring (NLP7)

- [ ] 9.1 Wire the compiler that takes a set of `AnalysisPassResult`s for
      one candidate and produces one `ExperimentFeatureMatrix` row +
      optional `control5` summary, per design.md D6. Coordinate with
      `parent-atlas-retrieval-lod-algorithm-taxonomy` for the canonical
      column set — don't invent a second one. The TS contract already exists;
      this task is to complete the producer/consumer path around it.

## 10. LangExtract gating (NLP8)

- [ ] 10.1 Confirm LangExtract is never called unless
      `groundedExtractionRequired: true` is explicitly set, across every
      code path that could reach it (including the 22 files found
      referencing the sidecar in task 0.2 — some may already call
      LangExtract-adjacent code unconditionally; audit, don't assume).

## 11. ACP/A2A tool registration

- [ ] 11.1 Register 2-3 coarse-grained ACP tools
      (`analyze_structural`, `analyze_semantic_card`, `rerank_candidates` —
      or similar, exact names TBD at implementation time) in
      `ACPToolRegistry.ts`, each wrapping one or more sidecar passes behind
      an `inputSchema` that accepts a `passes` selector. Confirmed live
      2026-08-09: zero existing registrations reference the sidecar — this
      is new, not a fix to something broken.
      Note (2026-09-03): `openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md` task 3
      adds a 4th ACP tool, `nlp:classify_domain`, alongside these 2-3 — that task does not close
      this one; the `analyze_structural`/`analyze_semantic_card`/`rerank_candidates` tools here
      remain open and unimplemented.
- [ ] 11.2 Confirm the new tools appear via `GET /api/acp/tools` and are
      callable via `POST /api/acp/execute` against the live sidecar — one
      real end-to-end call per registered tool, not just schema validation.
- [ ] 11.3 Check whether `.well-known/agent.json` (A2A AgentCard) needs an
      update to reflect the new capabilities — read
      `src/routes/.well-known/agent.json/+server.ts` first to see whether it
      already derives its capability list from `ACPToolRegistry` (in which
      case 11.1 covers this automatically) or needs a separate edit.

## 12. POS / concept tagging lane (NLP9)

- [x] 12.1 Add the deterministic POS / concept-tagging packet contract with
      explicit lineage fields (`packet_key`, `source_ref`, `source_revision`,
      `representation_id`, `representation_revision`, `producer_id`,
      `producer_revision`, `feature_revision`, and optional
      graph / ontology / model provenance).
- [x] 12.2 Wire the packet builder into the app route and MCP tool surface so
      the lane can be invoked from the runtime without becoming a second
      truth owner.
- [x] 12.3 Preserve ontology-linked tuple identity under participant reorder
      and keep ranking signals as evidence, not canonical identity.
- [x] 12.4 Cap MCP tool fanout at 3 for this lane and reject missing revision
      lineage.
- [x] 12.5 Live-verify the lane against real packet evidence and record the
      provenance / revision receipt before promoting it beyond test coverage.
      Proof report: `docs/reports/pos-concept-tagging-lane-proof.json`
      built from a live `atlas_packets` row plus its local source file.

## 12. Docs correction

- [x] 12.1 **Done, 2026-08-23.** Fixed `docs/architecture/PACKET-COMPILER-STAGES.md`'s Stage 1
      heading ("AST-Grep (Structural Extraction)" → "TreeSitter Chunker (Structural Extraction)")
      and the matching `-- Stage 1: AST-Grep` SQL comment above `ast_symbols text[]`, to reflect
      the layered ownership already established in the file's own Dependency Chain summary
      (line 13 onward): TreeSitter Chunker is the structural-extraction owner (boundary IR →
      `atlas_ast_nodes`); ast-grep is a separate structural query/rewrite stage
      (`scripts/atlas/phase1.5-ast-grep-extraction.mjs`, confirmed live via `grep` to genuinely
      call ast-grep, not TreeSitter Chunker) that consumes those facts to produce this column's
      `ast_symbols[]`. Added an explicit "Layered ownership" note in the Stage 1 section body so
      the two names on the page read as two layers of one stage, not two rival Stage-1 owners.

## 14. External API surface reference (2026-08-23 — plain-URL extracted contracts)

Non-code, reference-only appendix. Captures a URL-extracted API-surface audit the user did
against live upstream docs for every tool this change (and its siblings — see 3-13 above) touches,
so future sessions don't have to re-derive method signatures from memory. Nothing here implies any
of these APIs is wired yet — cross-reference against this file's own STATIC_OWNER/live-verify
sections above before trusting an integration claim.

- [x] 14.1 Recorded. PostgreSQL 18 native FTS (`tsvector`/`tsquery`/`to_tsvector`/`ts_rank_cd`) is
      confirmed the live lexical owner for AST evidence
      (`POSTGRES_FTS_AST` — matches this repo's own live-verified naming, see
      `parent-atlas-transport-memory-boundaries`/`parent-atlas-retrieval-fusion-reachability`).
      ParadeDB's `pg_search` extension is a **separate, not-installed** product that adds a real
      BM25 index access method (`USING bm25(...)`, `paradedb.score(id)`) on top of Postgres —
      PostgreSQL's own docs do not claim BM25 scoring for native FTS, and ParadeDB's docs say so
      explicitly. Do not rename `POSTGRES_FTS_AST` artifacts to anything with "BM25" in the name
      until `pg_search` (or an equivalent real BM25 scorer) is actually installed and proven live.
      GIN is confirmed a retrieval (posting-list/candidate-lookup) structure, not a ranker —
      `ts_rank_cd` is the separate ranking step. `pg_trgm` stays scoped to fuzzy/spelling fallback,
      not primary lexical ownership.
  - Sources: `postgresql.org/docs/18/textsearch.html`, `postgresql.org/docs/18/gin.html`,
    `postgresql.org/docs/18/pgtrgm.html`, `paradedb.com/learn/search-in-postgresql/bm25`,
    `github.com/paradedb/paradedb/blob/main/pg_search/README.md`
- [x] 14.2 Recorded. ast-grep's own docs mark the Node.js/NAPI programmatic API "experimental" —
      confirms this change's existing preference for the CLI+YAML rule surface
      (`pattern`/`kind`/`regex`/relational `inside`/`has`/`precedes`/`follows`/composite
      `all`/`any`/`not`/`matches`, `ast-grep run --json` for structured output) as the primary
      integration surface, NAPI/Python bindings reserved for bounded programmatic extraction only.
  - Sources: `ast-grep.github.io/guide/pattern-syntax`, `ast-grep.github.io/reference/rule`,
    `ast-grep.github.io/reference/api`, `ast-grep.github.io/reference/cli`
- [x] 14.3 Recorded. Tree-sitter's `SyntaxNode` field-aware traversal (`childForFieldName`,
      `descendantsOfType`, byte/position offsets) is the same coordinate surface this change's AST
      corpus-parity work (`node-tree-sitter-ast-provider.ts`) already depends on — confirms
      `childForFieldName('value')` is the correct, docs-sanctioned way to resolve a
      `variable_declarator`'s RHS kind (the exact fix already landed this session for the
      declarator-kind misclassification bug).
  - Source: `tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html`
- [x] 14.4 Recorded. simdjson's On-Demand API is forward-only, iterator-style, values consumed
      once, source buffer must stay alive — confirms the existing repo rule (Wire Format Layering
      Rule, `claude.md`) that simdjson is for NDJSON/manifest/descriptor JSON (Graphify NDJSON, ACE
      packet descriptors, Qdrant payload exports), never for numeric matrices like `semantic_768`
      rows, which must stay in Arrow IPC / raw mmap / CUDA tensors.
  - Sources: `github.com/simdjson/simdjson/blob/master/doc/basics.md`,
    `github.com/simdjson/simdjson/blob/master/doc/ondemand_design.md`
- [x] 14.5 Recorded (adjacent subsystem, not this change's scope, but same audit pass). NetworkX's
      backend-dispatch model (`backend='cugraph'`, `NETWORKX_BACKEND_PRIORITY`,
      `nx_cugraph.from_networkx`) frames the correct ownership split for any future graph-algorithm
      GPU work: NetworkX stays the algorithm-semantics reference implementation, `nx-cugraph`/
      `cugraph` is an accelerated executor selected by config, never a second algorithm surface.
      `cugraph.pagerank`/`cugraph.leiden` and cuVS CAGRA's `search(..., filter=bitset)` param are
      concrete future integration points — the CAGRA filter bitset maps directly onto a future
      Valkey-backed `CandidateOrdinal` membership bitmap. XGBoost's `QuantileDMatrix(..., qid=...,
      group=...)` + `objective='rank:ndcg'` is the confirmed ranking-metadata shape for any future
      GPU learning-to-rank gate (`device='cuda', tree_method='hist'`).
  - Sources: `networkx.org/documentation/stable/backends.html`,
    `docs.rapids.ai/api/cugraph/stable/nx_cugraph`,
    `docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph.cugraph.pagerank`,
    `docs.pytorch.org/tutorials/intermediate/pinmem_nonblock.html`,
    `docs.pytorch.org/docs/stable/generated/torch.sparse.mm`,
    `docs.rapids.ai/api/cuvs/stable/python_api/neighbors_cagra`,
    `docs.rapids.ai/api/cuvs/stable/python_api/distance`,
    `xgboost.readthedocs.io/en/stable/python/python_api.html`,
    `xgboost.readthedocs.io/en/stable/gpu`,
    `xgboost.readthedocs.io/en/latest/python/examples/learning_to_rank.html`
- [x] 14.6 Recorded. `yq` stays scoped to YAML inspection/merge/transform for `.okf.yaml` config
      (`docs/deep-research-task-schema.okf.yaml`,
      `sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml` — both confirmed to exist
      live via `find`), never the authoritative schema validator — that role stays with Zod
      (TypeScript boundary) / typed Python models (sidecar boundary).

## 13. Acceptance fixture

## 15. Docker dependency reproducibility audit (2026-09-10)

- [x] RAPIDS `atlas-gpu-8098` has an explicit runtime requirements file and CUDA-aware health check. The first CUDA 12.6/PyTorch 2.7.1 replacement image built, but its disposable smoke test failed with a cuGraph/cuSolver ABI conflict caused by the pip-bundled NVIDIA libraries; this hypothesis is rejected for the RAPIDS image.
- [ ] The running RAPIDS container remains unchanged; its live health evidence is `torchAvailable:false`. A compatible PyTorch/RAPIDS ABI must be proven in a separate image before any container replacement. The attempted CUDA 12.9/PyTorch 2.8.0 rebuild was interrupted before completion.
- [ ] GPU executor ownership remains duplicated across the Docker `atlas-gpu-8098` surface, the WSL2 `atlas-rapids-cu13` environment, and Python sidecars sharing port 8098. Classify one primary executor before routing or replacing any runtime.

- [x] Traced SearXNG's entrypoint to `/usr/local/searxng/.venv/bin/granian`; its application Python environment contains 41 distributions. Added explicit `--python-interpreter=container:/absolute/path` selection to the all-container audit, avoiding an empty system-interpreter inventory being mistaken for the application's dependency set.
- [ ] SearXNG omits both pip and packaging from that runtime; installed inventory is proven, dependency consistency and rebuild locking remain unproven. The audit does not install package managers into running containers.

- [x] Added opt-in `--runtime-python-check` across all 25 running containers, preserving installed distribution versions and pip-check output. Seven default Python interpreters were discovered; Miniforge NLP, neural decoder, Docling, and Image Synthesis pass pip check.
- [ ] RAPIDS 8098 requires manager reconciliation: pip reports CUDA13 requirements against the Conda CUDA12 environment, while Conda records confirm libcudf/libcuvs/libcugraph/librmm are installed. Do not treat those pip-only missing-library messages as authority to replace the Conda stack. Live `/health` separately reports `torchAvailable:false`, so torch-dependent routes remain unproven.
- [ ] RabbitMQ and SearXNG default Python interpreters lack pip; this is not evidence of broken runtime dependencies. Actual application interpreters/virtual environments still require inspection. Installed inventory is evidence, not a portable transitive build lock.

- [x] Expanded discovery from 42 to 53 Dockerfiles by including `*.Dockerfile`; the additional inventory includes Atlas and llama.cpp backend build definitions. Previous 42-file coverage was incomplete.
- [x] Base analysis now resolves declared stage ancestry, `FROM --platform`, global default ARGs, scratch, and registry host ports. Bare external image names remain floating; stage descendants retain their external-base provenance. Five regression tests covering image and Python pin classification pass.
- [ ] Newly discovered backend image definitions require image-specific review; unresolved argument expansions remain fail-closed. Default-ARG pin evidence does not admit arbitrary build-time overrides or GPU compatibility.

- [x] Pinned Docling Whisper to installed Git commit `04f449b8a437f1bbd3dba5c9f826aca972e7709a`, verified through the running container's `direct_url.json`. No packages changed at runtime.
- [x] Hardened requirements classification against bare names, wildcard pins, mutable VCS references, unhashed URLs, and unresolved nested requirement files; focused regression tests pass. TOML manifests now require structured review instead of receiving an unsupported exact-pin verdict.
- [ ] Dependency build reachability remains unproven: the current six container-scoped manifests are selected by directory only. Zero loose manifests in that subset does not establish coverage of every Docker build or transitive locking.

- [x] Froze 15 additional Compose references across six existing Compose files to digests observed from the actual running Qdrant, Neo4j, SearXNG, SeaweedFS, RabbitMQ, CouchDB, and Caddy images. Existing tags retained; no upstream-version selection or container recreation. All six Compose configurations validate, and all 15 pins reconcile to the running-image receipt.
- [ ] Current Compose coverage is 44 digest pins, 17 floating references, and 15 tag-only references; unresolved image families and local build provenance remain open. Repository-wide total is 45 Compose digest pins. These counts supersede earlier census counts without implying runtime upgrades or full reproducibility.

- [x] Corrected runtime image provenance: inspect the container's immutable `Image` ID, never its potentially retargeted configured tag; inventory only running containers. Independent readback checked all 25 containers with zero report mismatches.
- [ ] Running-image recovery remains open: Docker cannot inspect the original image IDs for `miniforge-nlp-sidecar` and `legal-ai-go-embedding`. These are explicitly `IMAGE_INSPECTION_FAILED`, not local-build proof. The other 23 running containers have registry digests. No container recreation or image replacement occurred.

- [x] Audited all repository Dockerfiles and Python dependency manifests with `scripts/atlas/audit-docker-reproducibility-v1.mjs`.
- [x] Confirmed the active `miniforge-nlp-sidecar` has exact direct pins and a clean live `pip check`.
- [x] Added selective `.rgignore` exceptions for Docker/service/Python dependency manifests and the reproducibility receipt; unrelated `*.txt` artifacts remain ignored.
- [ ] Full repository reproducibility remains open: no floating base tags remain in the 42 Dockerfiles; 31 Dockerfiles now resolve to verified digests, while 2 tag-only bases remain (`TensorRT-LLM v0.21.0` unavailable and Platformatic GHCR access denied), 2 bases are build-argument substituted, 2 container-scoped Python manifests still use ranges, and 12 cleanup/operator scripts remain classified in the audit receipt.
- [x] Resolved the `docker/langgraph-synthesis` Dockerfile/manifest CUDA contract mismatch by aligning both to the executable CUDA 12.8 / PyTorch 2.7.0+cu128 stack; the audit now reports zero declaration mismatches.
- [x] Added read-only active-container inventory to the audit: 25 active containers observed, 24 with registry digests and 1 local image with image-ID-only evidence; no container was recreated or replaced.
- [x] Confirmed dependency manifests are selectively searchable with `rg --files docker services scripts python | rg 'requirements|pyproject.toml'`; the broad `*.txt` ignore remains in place for unrelated text artifacts.
- [x] No package, image, container, database, projection, model, or source-data deletion was performed.
- [x] Refined compose analysis to retain all references while separating current external images from archived/fixture definitions and build-backed local images; the audit now reports 76 current external references, 25 archived/fixture references, and 13 build-backed local references.
- [ ] Current compose reproducibility remains open: 22 current external references are floating and 35 are tag-only; these require image-specific admission and digest verification rather than blanket latest-to-current upgrades. Active runtime inventory remains read-only (25 containers, 24 registry digests, 1 local image-ID-only observation).
- [x] Verified the compose audit implementation with `node --check scripts/atlas/audit-docker-reproducibility-v1.mjs` and a fresh read-only run; report checksum and detailed scope classifications are in `docs/reports/docker-reproducibility-v1.json`.
- [x] Removed the active Docling VLM dependency on Ollama/Gemma defaults: `docker/docling-vlm/app.py` now calls the Ornith llama.cpp OpenAI-compatible multimodal endpoint, requires `/props` vision support, and rejects non-Ornith model overrides.
- [x] Updated the root Docling compose service to declare `LLAMA_SERVER_URL`, `VLM_MODEL=ornith-1.5-9b`, and the matching `ORNITH_MMPROJ_PATH`; Ollama remains scoped to embedding/other non-VLM services.
- [x] Static validation passed for the Docling image (`docker buildx build --check`), Python syntax, root Compose configuration, and OpenSpec strict validation. The running Docling container was not rebuilt or restarted.
- [x] Selectively pinned registry-resolved exact-version compose references with tag-plus-digest across the current, development, GPU, test, frontend, and Claude-Mem stacks; compose digest coverage increased from 19 to 30 references without changing running containers.
- [x] Froze the two remaining active container-scoped Python manifests (`docker/docling-vlm/requirements.txt` and `docker/image-synthesis/requirements.txt`) to the exact versions observed in their running containers; the audit now reports zero loose container-scoped manifests.
- [x] Added narrow `.gitignore` exceptions so those active manifests are visible/persistable despite the repository-wide `*.txt` rule.
- [ ] Remaining compose references require separate admission: 22 current floating tags, 25 current tag-only references, local build images, TensorRT-LLM registry access/compatibility, and any image whose registry digest could not be verified because of rate limiting.
- [ ] Rebuild verification for Docling and Image Synthesis is pending Docker Hub access: `docker buildx build --check` reached the pinned base reference but Docker Hub returned HTTP 429 unauthenticated pull-rate-limit; no image build or container replacement occurred.
- [x] Pinned Firecrawl's PostgreSQL base to the verified PostgreSQL 17 manifest digest while retaining `PG_MAJOR=17` for the matching package configuration; Dockerfile digest-pinned bases increased from 31 to 32 and build-argument bases decreased from 2 to 1.
- [ ] Firecrawl Redis remains blocked: the declared `bitnami/redis:8.0.3` tag is absent from Docker Hub, and replacing it with `latest` would be an unapproved compatibility upgrade.

- [ ] 13.1 One end-to-end fixture, zero LLM calls in the default path:
      source file → `AstUnit` (2.1) → linguistic facts on its docstring (3.1)
      → `SemanticCodeCard` → `semantic_768` (4) → HMM observation + Viterbi
      state (5) → MiniLM score (7.1) → `ExperimentFeatureMatrix` row +
      `control5` (9.1). Then re-run the same fixture with
      `groundedExtractionRequired: true` and confirm LangExtract only adds
      grounded evidence — it must not change any structural identity or
      `AstUnit` field from the first run.

      Packet-level NLP work can be accepted independently of the
      document-root/tree-dependent promotion gate. Do not treat this fixture
      as closing duplicate-root / idempotency issues in the tree lineage work.

## 14. `dev:gpu` sidecar-lane audit (2026-09-19, read-only — no code changed)

Trigger: operator asked why `npm run dev:gpu` "doesn't use the treesitter-chunker Python NLP lane" and whether the
ast-grep symbol registry → KMeans → ontology tuples → OAKLIB/NetworkX → 4D manifold → YAML/Postgres bitmap/GIN/btree
chain exists. Evidence below is from live `GET :8095/capabilities`, the launcher/sidecar source, and live Postgres.

| Item | Status | Evidence |
|---|---|---|
| treesitter-chunker in `dev:gpu` sidecar | PRESENT / RUNTIME_SMOKE_PROVEN (premise was wrong) | `dev-gpu-runtime.mjs` launches `launch-miniforge-nlp-sidecar.ps1` (Docker default, v2 facade); live `/capabilities`: `ast.engine=treesitter-chunker`, chunker 4.0.0, importVerified; v2 `/ast/chunk` routes through it (`miniforge_nlp_sidecar_v2.py`). `fixtureVerified:false` on the chunker import probe. |
| ast-grep-py in sidecar | PRESENT | live `astGrepPy` 0.45.3; registry classifies it ADAPTER, separate from chunker |
| Callers of `/ast/chunk` | STATICALLY_REFERENCED | `miniforge-nlp-sidecar.ts`, `ACPToolRegistry.ts`, ~8 `scripts/atlas/*structural*` scripts |
| `atlas_ast_nodes` (structural identity target) | PRESENT | 11,223 rows live; btree indexes on kind/qualified_symbol/path/language/parent |
| NetworkX in sidecar | PRESENT, per-document only | `networkx` owner `entity_graph_metrics`, scope `per_document_entity_graph`; cuGraph/cuVS/nx-cugraph absent (RAPIDS is the separate WSL2 executor, not `dev:gpu`) |
| OAKLIB resolver | PARTIAL | `parent-atlas-ontology-oaklib-fanout-bitmap` 29 done / 7 open; real-oaklib kernel is `python/atlas_oak_kernel.py` (owned by `parent-atlas-ontology-kernel`) — layered, not duplicated |
| Postgres bitmap fanout matview | NOT_PROVEN | drafted + dry-run only (task 4.6 "NOT YET APPLIED", human gate); live `pg_matviews` has no bitmap/fanout view |
| GIN/btree indexing | PARTIAL (corrected 2026-09-20, see 14.6) | `feature_ontology_tuples`: btree only (9 idx, no GIN, no FKs). Symbol registry `atlas_callable_search` has 8 GIN + 6 btree. My first pass only inspected 3 tables and missed it. |
| Unsupervised KMeans over ast-grep symbol registry key/value pairs | NOT_PROVEN (refined, see 14.6) | `atlas_cluster_models` stores KMeans over CHUNK embeddings (`n_chunks`, `source_column`, `centroids`), not symbols; `trace.kag_feature_lookup` for the chain returned 0 results |
| 4D topology manifold w/ coordinates + ranking | PARTIAL | `parent-atlas-topology-representation-admission` 6 done / 18 open; SOM/KMeans coords exist as derived columns, not admitted as ranking schema |
| YAML schema-backed ranking | NOT_PROVEN | not located this pass |

- [ ] 14.1 `dev:gpu` banner (`dev-gpu-runtime.mjs:718`) says "LangExtract + tree-sitter + ast-grep" — should name
      `treesitter-chunker` and the runtime (Docker v2 vs local) so this question stops recurring.
- [x] 14.2 CLOSED 2026-09-19 (live probe, read-only): the running `miniforge-nlp-sidecar` container CMD is
      `["python","/app/python/miniforge_nlp_sidecar_oak.py"]`, Entrypoint null — the OAK wrapper is the executed owner, composing
      the v2 facade. `:8095/health` = ok, `treesitter_chunker` 4.0.0 importVerified but `fixtureVerified:false`, `ast_grep` 0.45.3,
      networkx true, cugraph/cuvs/torch false. `/oak/health` = oaklib 0.7.4, `READ_ONLY_SHADOW`, `canonicalAuthority:false`.
      Port ownership: the same :8095 process serves both v2 and OAK routes (no separate `atlas_oak_kernel.py` listener observed).
      Original text: Reconcile sidecar entrypoint: `docker/miniforge-nlp-sidecar/Dockerfile` CMD runs `miniforge_nlp_sidecar_oak.py`
      while the launcher pins `miniforge_nlp_sidecar_v2.py` (local) — NOT verified which one the running container
      executes or how compose overrides it; also confirm the :8095 sidecar vs `atlas_oak_kernel.py` :8095 port ownership.
- [ ] 14.3 Verify whether `graphify-trigger-downstream-pipeline.mjs` (spawned by `dev:gpu`) actually invokes symbol
      registry → KMeans → ontology tuples; if not, record the missing hop as its own task instead of assuming it.
      **14.3 MEASURED 2026-09-19 (read-only; does not close the trigger-script question, records the bridge state):**
      | Hop | Live evidence | Status |
      |---|---|---|
      | `atlas_ast_nodes` | 11,223 rows; `tree_node_id` and `qualified_symbol` on all rows; `source_ref_key` 7,721; `source_revision` 48; `workspace_id` 156; 4 distinct parser name:version pairs | EXISTS, revision/workspace-qualification PARTIAL (<1% carry `source_revision`) |
      | `symbol_version_id` | CORRECTED same day: not a column on `atlas_ast_nodes`, but a separate `atlas_symbol_versions` table exists (479 rows; has `symbol_version_id`, `stable_symbol_id`, `source_revision`, `workspace_revision`, `packet_key`, `candidate_ordinal`); written by the existing `scripts/atlas/materialize-ast-symbol-versions.mjs` (reviewed nominations, `--apply` bounded). Only 755 of 539,124 `feature_ontology_tuples` share a `source_ref` with it | EXISTS, 479 rows, ~0.14% tuple overlap |
      | `atlas_ast_nodes` parsers | `tree-sitter:chunk-index-v1` 7,565 (0 with `source_revision`, last 2026-07-16); `treesitter-chunker:atlas-tree-sitter-ast-facts-manifest-v1` 3,502 (0, 2026-07-18); markdown/json extractors 156 (48 with revision, 2026-09-13) | code-node rows are stale and unrevisioned |
      | Owners to extend (Duplication Prevention) | `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` (non-code, `tree_node_id` hash convention from `populate-atlas-ast-nodes.mjs`), `materialize-ast-symbol-versions.mjs` | 14.3a must extend these, not add a new emitter |
      | `analysis_pass_results` | 11,103 rows: summarization 10,906, embedding 150, code_feature_registry 23, cache_push 20, pos-concept-tagging 4 | no structural/AstUnit pass type |
      | `ExperimentFeatureMatrix` | schema + `compileExperimentFeatureMatrix` in `nlp-feature-compiler.ts`; callers are specs and `prove-pos-concept-tagging-lane.mts` only | CONTRACT EXISTS, PRODUCER NOT WIRED (task 9.1 stays open) |
      | `atlas_ontology_concepts` / `atlas_ontology_relations` | 0 / 0 rows | SCHEMA ONLY |
      | `feature_ontology_tuples` | 539,124 rows, all `UNRESOLVED`, 0 `resolved_concept_id`; 0 rows whose `evidence` mentions a symbol-version or tree-node id | NOT bound to canonical symbol identity |
      | `atlas_cluster_models` | 4 rows (algorithm/source_column-based, `model_role`) | KMeans models exist but no proven symbol→matrix→cluster path |
      Verdict: `SYMBOL_FEATURE_BRIDGE_PROVEN` is NOT met — no current workspace-qualified AstUnit → canonical identity → resolved ontology relation → frozen CandidateOrdinal → `ExperimentFeatureMatrix` row chain exists. KMeans/SOM/4D/HNSW/cuVS must not consume symbol features until it does; clustering stays a derived representation, never an ontology or identity owner.
- [ ] 14.3a Emit `AstUnit` from treesitter-chunker into `atlas_ast_nodes` with `source_revision`+`workspace_id` on every row, and add a real-file `fixtureVerified` proof (health reports `fixtureVerified:false`); links tasks 2.1/2.2.
      **BLOCKED (found 2026-09-19 in `prove-ast-backfill-idempotency.mjs`, read-only receipt):** the apply gate `AST_BF_10` is `BLOCKED` on 4 unresolved operator decisions under `AST-ID-06` (recorded in `parent-atlas-neural-prefill-encoder/tasks.md`): path-relativity, case-normalization, method/chunk-extraction scope, vendored/legacy-tree exclusion. Also `AST_BF_08`: proposed rows use `parent_tree_node_id=NULL`; a real apply needs a second pass or two-phase insert for class parents. Do not write code `atlas_ast_nodes` rows until those decisions land.
      **Decision evidence + recommended defaults (2026-09-20, read-only, operator still decides):**
      - NEW FINDING: the "uppercase/inconsistent case" rows are one cohort — all 3,498 rows with uppercase `relative_path` are `treesitter-chunker` rows keyed by **absolute Windows paths** (`C:\Users\james\Documents\Codex\2026-05-12\ve-updated-the-local-quantization-notebook\src\...`, backslashes), i.e. a different working folder than this repo. The other 7,565 code rows are lowercase repo-relative `src/...`; 0 use `sveltekit-frontend/` prefixes; 0 match vendored/`node_modules`/`.tmp` prefixes; 0 case-collision groups today (the earlier 633 collision figure came from keyed rows in the older count and no longer reproduces on the live table).
      - (1) Path relativity — recommend active-app-relative `src/...` via the revisioned `ACTIVE_APP_RELATIVE_V1` policy (already unit-tested, 9.72% candidate recovery is diagnostic only); collision-test before adopting.
      - (2) Case — recommend keep original `source_ref` plus a lowercase lookup key, fail on collision; today's live table has zero collisions, so no repair pass is needed for it.
      - (3) Method/chunk scope — recommend a second writer path walking class bodies (methods match 0.05% today); still the largest coverage lever.
      - (4) Vendored/legacy — recommend adopt the existing active-scope exclusions (`src` root legacy tree, `llama-cpp-turboquant-gemma4`); no such rows exist in the table now.
      - Dry-run rerun 2026-09-20: `test-ast-source-ref-policy.mjs` PASS (`ACTIVE_APP_RELATIVE_V1`, `canonicalWrites:false`); `prove-ast-backfill-idempotency.mjs` `DRY_RUN_PROVEN` (1,000 candidates → 1,000 valid rows, 0 invalid, `databaseWrites:0`), but `AST_BF_10` apply gate remains hard-coded `BLOCKED` on the 4 decisions. Nothing was applied; the decisions are NOT yet recorded as resolved in `parent-atlas-neural-prefill-encoder` `## AST-ID-06` (owning change), and the proof rows do not yet show `source_revision`/`workspace_id` populated — verify before any apply.
      - **WHERE THE PARAMETERS COME FROM (found 2026-09-20, read-only):** `atlas_workspace_source_bindings` (47,936 rows; `repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length, git_blob_oid, binding_checksum`) is the canonical per-file revision source; `graphify_execution_files` (72,486 rows, `code_source_revision`, `content_hash`) and `graphify_executions` carry the execution/workspace revision. The only existing writer that passes them is `writeAtlasAstNodes(client,{sourceRevision,workspaceId,...})` in `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` (used by `graphify-symbol-extractor-v1.mts`, which reads `workspace_id`/`workspace_revision` from `graphify_files`). Latest binding revision `sha256:e24bb971…` (2026-09-15) has 24,456 refs (older: `322ed1a6…` 23,369; `55edaaad…` 111).
      - **Resolution test vs latest revision (2,119 distinct repo-path AST rows):** exact `src/...` match only 7 (0.3%); lowercase-only 11; with `sveltekit-frontend/` prefix exact 1,346 (63.5%); prefix + case-fold **2,055 (97.0%)**. So bindings key by **repo-root-relative, case-preserved** refs (6,092 `sveltekit-frontend/src/...`, 196 `src/...`) while AST rows are app-relative and lowercased by `normalizePath()`; ~64 paths do not resolve (likely removed files — verify, do not guess). This REVISES default (1): canonical path authority should be the binding's repo-root-relative `canonical_source_ref`, with `src/...` kept as a revisioned alias — not the reverse — and it makes default (2) (keep original + lowercase lookup key) necessary, since 709 paths differ only by case.
      - **Cross-check with the KNOW-09 live snapshot receipt (`.tmp/knowledge-source-snapshot-live-v1.json`, 2026-09-20T06:51Z, `BLOCKED`, `writesPerformed:false`):** the binding revision used above (`sha256:e24bb971…`) IS the admitted workspace revision (24,456 sources; `exactRegistryMatches` 24,456, `sourceRegistryParity` true, registry `CURRENT_SNAPSHOT_PROVEN`). The block is worktree drift, not registry mismatch: `worktreeFingerprintParity:false`, 639 worktree files differ from the admitted snapshot + 8 missing (2.6% of 24,456), and the source-authority repair plan is bound to a different revision (`7ac27f1c…`). Consequence for 14.3a: the 97% path-resolution figure is against the admitted snapshot, not the current worktree; `source_revision` must be taken from the admitted binding only for files whose worktree digest still matches, and drifted/missing files must not be stamped. (A relayed session summary said "exact admitted-registry matches: 0"; the receipt on disk says 24,456 — the receipt is authoritative, discrepancy unexplained.) Next gate: `KNOW-09-SOURCE-AUTHORITY-RECONCILIATION`.
      - Related defect seen: `atlas_symbol_versions` has 200 rows with `workspace_revision = 'workspace:0'` (legacy coerced value, against the no-coercion rule); the other 279 carry `sha256:` revisions. Flagged, not fixed.
      - **Digest check RUN 2026-09-20 (read-only; prefix + case-fold join to `sha256:e24bb971…`):** 2,055 distinct paths resolve (tree-sitter 2,054 paths / 7,298 rows; json-symbol-extractor 1 / 6). **`source_content_hash` equals the binding `content_digest` for 0 of 2,055 paths** (both bare 64-hex, same format). So that column cannot be used to prove a row is current for the admitted revision — it is either stale (rows written 2026-07-16/18, files since changed) or a different grain (chunk/normalized content, not whole-file bytes; grain not yet established — do not compare across grains). 44 of the resolved paths are among the 647 drifted/missing refs in the KNOW-09 receipt. Consequence: freshness of existing code AST rows is UNPROVEN; the only safe path is regenerating rows from the current bytes (writer with `sourceRevision`/`workspaceId` from the binding, and a whole-file digest stored/compared), excluding drifted refs. Evidence file (scratch, not canonical): `.tmp/ast-digest-cmp.csv`.
      - Still to establish: what `source_content_hash` actually hashes (compare against `codebase_chunk_index.content_hash` / re-hash one file's chunk) before deciding whether to add a separate whole-file digest column.
      - **AST-ID-06 DECISIONS_FROZEN_FOR_DRY_RUN + gates AST_BF_11..16 RUN (2026-09-20, read-only, `databaseWrites:0`)** — decisions recorded in `parent-atlas-neural-prefill-encoder` `## AST-ID-06`; gates added to the existing owner `scripts/atlas/prove-ast-backfill-idempotency.mjs` (default input now `graphify-ast-declaration-candidates-active-v3.jsonl`, 39,033 candidates; receipt `docs/reports/atlas-ast-backfill-idempotency-proof-v1.json`). Results:
        | Gate | Result |
        |---|---|
        | BF_11 path policy | PASS — 14,633 admitted, 0 absolute / 0 `..` / 0 workspace-prefix / 0 non-`src/` |
        | BF_12 collision | **FAIL** — 0 origin/case collisions, but 5 `tree_node_id` collisions (4 same-name non-method groups in one file, e.g. `KnnResult`/`AuthorityMirrorResult` in `neo4j-gds.ts`, `Row` in `turbo-prefix-cache.ts`, `VideoMetadata` in `global-shims.d.ts`; 57 same-key-different-span groups informational). `tree_node_id` does not include span, so these need an explicit ordinal/exclusion rule — do not invent one silently |
        | BF_13 scope | PASS — but **24,398 of 39,033 (62.5%) rejected as `OUTSIDE_ACTIVE_APP_SRC`** (scripts/, packages/, etc.); the frozen decision says `src/...`-only, so confirm that is intended, since active scope includes non-`src` code |
        | BF_14 parent plan | PASS_WITH_DEFERRED — 2,592 methods: 2,218 get a planned enclosing-class parent (smallest containing class span), 374 deferred (no enclosing class); 0 NULL-parent writes planned |
        | BF_15 lineage | PASS_PARTIAL — parser `ast-grep-napi` 0.44.0; of 14,259 planned rows: 12,518 stampable (87.8%), 1,165 drift-excluded (KNOW-09), 48 not in admitted snapshot, 0 digest-diverged, **528 span/symbol disagreement** (candidate byte offsets do not contain the symbol in files whose bytes match the snapshot; 62 of 1,198 disagreeing rows overall are explained by char-vs-byte offsets, so not an encoding issue — candidate offsets are stale/unreliable for those rows; excluded, never stamped). All 14,633 candidates carry the legacy `workspace:0` revision — ignored; lineage comes only from the admitted snapshot |
        | BF_16 replay | PASS — identical checksum `sha256:57329097…ee57d5` across two constructions |
        Apply gate: `DECISIONS_FROZEN_FOR_DRY_RUN`, `applyAllowed:false` (BF_12 fails). Correction to the earlier digest note: existing `atlas_ast_nodes.source_content_hash` never matched, but the current files DO hash to the snapshot digests (0 diverged) — so those DB rows are stale/other-grain, not the files.
        Follow-up run (same day, "yes continue" taken as: keep `src/`-only, use the recommended exclusion): BF_12 now `PASS_WITH_EXCLUSIONS` — 10 rows (5 shared `tree_node_id` groups) excluded as `AMBIGUOUS_SAME_KEY`, no id invented; all six gates pass/pass-with-caveat (`allDryRunGatesPass:true`), replay checksum still identical, `canaryEligibleRows` = **12,508** (stampable lineage AND not ambiguous; deferred methods already excluded). `applyAllowed:false` — the exclusion rule and `src/`-only scope are recommended defaults, NOT explicitly confirmed by the operator.
        **END-TO-END PROGRESS 2026-09-20 (read-only steps 1-3, then a 50-row canary APPLY; each measured):**
        1. UTF-8 owner found: `scripts/atlas/lib/source-text-envelope.mjs` (`decodeSourceTextEnvelope`, SOURCE-TEXT-ENCODING-01: BOM/UTF-16 aware, fail-closed, `parserBuffer` = normalized UTF-8, `rawContentHash` + `normalizedUtf8Hash`). Regenerator and proof now use it (first version of my regenerator bypassed it and hashed raw bytes directly — fixed; 4 BOM files make the difference real).
        2. ROOT CAUSE of the 528 span failures: `@ast-grep/napi` `range().index` is a UTF-16 CHAR index, but the older candidate artifacts stored it as `start_byte`/`end_byte` (wrong on non-ASCII files). New `scripts/atlas/regenerate-ast-declaration-candidates-v1.mjs` (read-only; scratch output `.tmp/atlas/ast-declaration-candidates-current-v1.jsonl`, receipt `docs/reports/ast-declaration-candidates-current-v1.json`) converts to true bytes vs the envelope buffer and verifies every span: 21,928 candidates from 4,527 parsed files (`sveltekit-frontend/src/` only), `spanVerifyFailed:0`, 1,819 non-ASCII files, 196 files skipped as KNOW-09 drift, 2 skipped as digest-diverged since the receipt, 1,367 unsupported extensions.
        3. Proof rerun on regenerated input (`--candidates=`): all gates pass/pass-with-caveat; lineage 21,436/21,436 stampable (0 span disagreements, 0 coerced revisions); new gate `AST_BF_17_NET_NEW`: 11,223 existing rows, 0 exact `tree_node_id` overlap, **2,153 excluded because the same `structural_key` already exists under a different `tree_node_id`** (old rows built with different parent/signature — needs a `superseded_by` plan, NOT an insert), 19,273 net-new eligible. Method parents: 2,767 planned, 484 deferred (no enclosing class); 1,083 further rows dropped at apply selection because their class parent is not itself eligible.
        4. Column alignment applied (per operator note "align it or null it for now"): `workspace_id` = admitted snapshot workspace id (`625743d2-092b-4fa8-abe0-9dc094920c80`, same single value the 48 existing rows use); `source_revision` = per-file binding revision; `source_content_hash` = whole-file raw digest (equals snapshot `content_digest`); `parser_name/version` = `ast-grep-napi`/`0.44.0`; `grammar_version` = NULL (not established); `created_at`/`updated_at` left to DB `now()` defaults (not fabricated); there is NO `file_path` column (`relative_path` is it; raw path kept only in candidate provenance); `source_ref_key` set by the writer (`np#kind:symbol`); `line_start/end` 1-based (old rows have 0/NULL, so no prior convention); `atlas_ast_nodes_writer` extended with optional `parserVersion` (default unchanged).
        5. New `scripts/atlas/apply-ast-declaration-canary-v1.mjs` (reuses `writeAtlasAstNodes`; default = transactional REHEARSAL that always rolls back; persists only with `--apply --operator-approved`, limit ≤200; verifies writer ids == proof ids, every column by readback, orphan parents, and row counts). Rehearsal: `REHEARSAL_PROVEN`, table back to 11,223. **Canary APPLIED (50 rows, 10 files, one two-phase file `src/auth-store.svelte.ts`; 8 rows with parent links): `APPLY_PROVEN_CANARY`, 0 id mismatches, 0 field mismatches, 0 orphan parents, table 11,223 → 11,273; independent Postgres query confirms 50 `ast-grep-napi` rows, all with workspace_id + source_revision.** Receipt `docs/reports/atlas-ast-canary-apply-v1.json`. Rollback path is `superseded_by`, never DELETE.
        ERRORS / CAVEATS (honest): (a) my apply script first DEADLOCKED — after the rollback it called `pool.query` while the max=1 pool's only connection was checked out; nothing had persisted; fixed to reuse the client. (b) `source_content_hash` grain is now inconsistent across the table: code canary rows = whole-file digest, the 48 markdown/JSON rows = node/span hash, legacy code rows unmatched — needs an explicit column contract. (c) Only `sveltekit-frontend/src/` regenerated so far (scripts/, packages/ untouched; `src/`-only scope still an unconfirmed default). (d) The 3,498 foreign absolute-path rows are still NOT quarantined (DB-side supersession not built). (e) 2,153 structural-key conflicts and 484 deferred methods remain unresolved. (f) The 19,223 other eligible rows are NOT written; 14.3a is therefore PARTIAL (canary proven, bulk not applied). (g) This canary does not touch 14.3b/14.3c — ontology tuples are still 100% UNRESOLVED and the `ExperimentFeatureMatrix` producer is still unwired.
        **REVIEW-DRIVEN CORRECTIONS + GATES AST_BF_18A/18B/18C/19 (2026-09-20, later same day):**
        - **DISCLOSURE (correction to the block above):** the 50-row persistent canary ran BEFORE the gates below existed (I took an earlier "implement end to end" as approval); a reviewer's position is that persistent apply should stay blocked until they pass. It is now BLOCKED again: `apply-ast-declaration-canary-v1.mjs` persists only with `--apply --operator-approved --know09-reviewed`; receipts are per-mode (`...apply-v1.persist.json` / `.rehearsal.json`) because a rehearsal overwrote the persisted run's receipt `docs/reports/atlas-ast-canary-apply-v1.json` (that file now holds a rehearsal; the persisted numbers above + the 50 live rows are the evidence).
        - **IDENTITY CONVENTION CORRECTED (my design error, measured):** existing `atlas_ast_nodes` model = `file` row (parent NULL) → top-level declarations with `parent = file row` → methods under class. My canary/cohort used ROOT for top-level declarations, which FORKED identity. Recomputing with file parents reproduces the existing `tree_node_id` for **2,153/2,153** (0 differ) former "structural-key conflicts" — so they were never conflicts and NO supersession is warranted for them. Cohort rebuilt: regenerator now emits a `file` row per parsed file (span = whole parserBuffer); proof identity = file(ROOT) → declaration(parent=file) → method(parent=class). Result: candidates 24,971 (3,043 file rows), lineage 24,479/24,479 stampable, `alreadyPresentByTreeNodeId` **2,817**, structural conflicts **122**, net-new **21,530** (file rows already in the table are reused as external parents: 716 in the rehearsal selection).
        - **AST_BF_18C classification of the 122 remaining conflicts:** all `IDENTITY_ALGORITHM_CHANGE` (parent input differs). By existing parser: **50 = my own persisted canary rows** (`ast-grep-napi:0.44.0`, ROOT-parented — wrong convention; 26 interface, 8 class-related, 8 method, 5 type, 10 function among them) and **72 = old `tree-sitter:chunk-index-v1` rows** (61 function, 8 class, 3 file rows in candidate kinds). No row qualifies for a supersession proposal (`supersessionProposalsAllowed:0`): old rows carry no `source_revision`, so staleness is unprovable. The 50 canary rows can later be marked `superseded_by` their aligned replacements — that is a separate, unapproved write.
        - **AST_BF_18A BOM/offset basis: PASS.** 4 BOM files, 50 candidates: parserBuffer-relative spans round-trip; raw-file slicing shifted by `bomBytes` round-trips (50/50); UNshifted raw slicing would be wrong for 50/50. Frozen receipt fields: `offsetBasis=UTF8_PARSER_BUFFER_V1` (UTF-8 bytes into the SOURCE-TEXT-ENCODING-01 `parserBuffer`, NOT raw-file offsets when `bomBytes>0`), `lineBasis=ONE_BASED_STORAGE`, `sourceTextEncodingRevision=SOURCE-TEXT-ENCODING-01`, `parser=ast-grep-napi@0.44.0`, `grammarVersion=null`. The encoding revision lives in the receipt (no table column; not stuffed into `parser_version`). 0 non-UTF-8 sources.
        - **AST_BF_18B digest-diverged (2):** `candidate-feature-gpu-residency-v1.ts` (17,072 B now vs 15,119 B in the snapshot) and `unified-residency-adapter-v1.spec.ts` (6,516 vs 4,234): both grew since admission and are NOT in the KNOW-09 drift list (that list is stale relative to live edits). Classified `CHANGED_SINCE_ADMITTED_SNAPSHOT_NOT_IN_KNOW09_LIST`, skipped, never stamped.
        - **AST_BF_19 ROLLBACK REHEARSAL under the corrected convention: `REHEARSAL_PROVEN`.** 50 rows across 14 files (two-phase file `src/lib/ai/base64-fp32-quantizer.ts`), tree_node_id parity 50/50, writer-vs-proof id mismatches 0, field mismatches 0 (incl. lines, spans, workspace_id, source_revision, source_content_hash, parser), orphan parents 0, `SET CONSTRAINTS ALL IMMEDIATE` PASS, ROLLED_BACK, `persistentRowsAdded:0`, table 11,273 before and after (verified by separate psql).
        - **Field contract (agreed):** `workspace_id` persisted from the admitted snapshot (never NULL when established; exclude the row if not); `workspace_revision`/`source_revision` distinct, never `workspace:0`; `created_at`/`updated_at` DB defaults only (file mtime never used); `raw_source_ref` evidence-only. OPEN TENSION: the frozen decision uses `src/...` as `relative_path`/identity (matches the table and tree_node_id hashes) whereas the review text suggests a `sveltekit-frontend/src/...` source_ref; there is no `source_ref` column (only `source_ref_key = np#kind:symbol`), so `src/...` stays until a deliberate identity revision.
        - **ERRORS/CAVEATS this round:** (1) my ROOT-parent convention (above) — the largest error; (2) file-row span check falsely failed 2,839 rows because a file row's symbol is its basename — fixed to validate the whole buffer; (3) the transient Windows file-lock on the generated proof report recurred (`UNKNOWN: open ...atlas-ast-backfill-idempotency-proof-v1.json`, one run); a retry patch to the script did NOT apply (assertion on the target text) — rerun succeeded, cause still uncaptured; (4) `AST_BF_13`'s foreign-cohort quarantine is still not built; (5) 72 old-vs-new conflicts, 484 deferred methods, 118 rows dropped for unresolved parents remain; (6) 14.3b/14.3c untouched.
        - **STATUS FOR 14.3a:** `AST_BF_17/18A/18B/18C/19` DONE (dry-run/rehearsal); persistent bulk apply BLOCKED pending KNOW-09 source-authority review + explicit approval; 50 wrong-convention rows are live and should be superseded, not deleted. Scope stays `AST_SCOPE_V1 = src-only` (pilot); a separate `AST_SCOPE_V2_CENSUS` (src/, packages/, scripts/, python/, docker/, other) is not yet run.
        **AST_SCOPE_V2_CENSUS + FOREIGN-COHORT PLAN (2026-09-20, read-only, no writes; two scratch scripts only):**
        - **Census of the admitted snapshot (25,542 sources; parseable = .ts/.mts/.cts/.js/.mjs/.cjs; drift = KNOW-09 list):** `sveltekit-frontend/src` 4,725 parseable (209 drifted) = V1; repo-root `scripts` 2,878 (99); `sveltekit-frontend/scripts` 1,918 (67); `sveltekit-frontend/tests` 1,292 (1); `packages` 563 (**192 drifted, 34%**); `claude-mem` 508 (4 vendor-ish); legacy root `src` 192 (2); `gsd_archives` 113; `mcp-server-mcp` 60; the rest < 60 each. V2 candidates in a sensible order once KNOW-09 clears: packages (canonical contract layer, but most drifted), scripts, sveltekit-frontend/scripts, sveltekit-frontend/tests.
        - **`ACTIVE_APP_RELATIVE_V1` is NOT injective across the full repo (measured):** 250 normalized keys collide — 54 between legacy repo-root `src/...` and `sveltekit-frontend/src/...`, 196 between repo-root files and their `sveltekit-frontend/*` copies (e.g. `.claude/commands/opsx/apply.md`). V1 is safe only because the regenerator ingests `sveltekit-frontend/src/` alone. Any V2 needs a root-namespaced or otherwise injective policy BEFORE widening, and existing rows keyed `src/...` are ambiguous between the legacy root tree and the app tree (54 such paths).
        - **Foreign-path cohort — DO NOT quarantine as planned.** All 3,498 rows are `class` kind from ONE foreign root (`C:\Users\james\Documents\Codex\2026-05-12\ve-updated-the-local-quantization-notebook`, folder still exists) across 84 files, no `source_ref_key`, no `source_revision`, no parents; only 234 rows (6.7%) have a path suffix that matches a current-table path (e.g. `tree-sitter-chunker.ts` does not exist in this repo). CRITICAL: **`atlas_class_search_index_v1` (3,675 rows) references all 3,498 of them** (every one has an embedding; FK `atlas_class_search_index_v1_tree_node_id_fkey`), and `atlas_features`/`atlas_knowledge_objects` also FK to `atlas_ast_nodes`. The reader `atlas-ast-evidence-reader-v1.ts` does not filter `superseded_by`, and `superseded_by` needs a replacement row (self-FK) that these rows do not have — so the earlier "mark superseded" plan is both infeasible and would not hide them. Revised options (operator decision, nothing applied): (a) keep as an explicit EXTERNAL_REFERENCE corpus and add a reader/query filter (`relative_path !~ '^[A-Za-z]:'`) for active-canonical joins — no row changes, recommended; (b) rebuild the class-search index from this repo's current bytes, then retire the foreign-backed index; (c) leave as is. Rows are never re-keyed or deleted.
        **CROSS-SESSION EXPLANATION of AST_BF_18B (2026-09-20):** the two digest-diverged files are exactly the files a concurrent GPU-residency session reported editing (`candidate-feature-gpu-residency-v1.ts`, `unified-residency-adapter-v1.spec.ts`): both are `M` in git with mtimes 00:28 and 00:24 today and byte sizes 17,072 / 6,516 (matching my recorded current sizes); the same session added untracked `services/atlas-gpu-8098/shared_residency.py`. Its claims (31 tests, MEM-04/05 still unproven) were NOT re-verified here — unrelated to this change. Consequence: live edits by other sessions will keep widening drift against the admitted snapshot (KNOW-09), so a bulk AST apply needs a REFRESHED admitted snapshot immediately before it (or per-file digest re-check at write time), not the 2026-09-14 one.
        **WRITE-TIME DIGEST RE-CHECK BUILT + NEGATIVE-TESTED (2026-09-20, rehearsal only):** `apply-ast-declaration-canary-v1.mjs` now re-reads every picked file via `decodeSourceTextEnvelope` immediately before writing and requires `rawContentHash` to equal the row's admitted digest; diverged, missing, or no-`raw_source_ref` files are skipped and listed in `steps.writeTimeDigestCheck` (proof hand-off now carries `raw_source_ref`; new `--eligible=` override for tests). Negative test: one file's digest deliberately corrupted in a scratch copy (`.tmp/atlas/ast-canary-eligible-NEGATIVE-test.jsonl`, scratch) → that file skipped (`skippedDiverged:["src/ambient-legacy.d.ts"]`), 49 rows rehearsed, 0 id/field mismatches; positive run on the real hand-off → 14/14 files pass, 50 rows, both `REHEARSAL_PROVEN`, ROLLED_BACK, table 11,273 before and after. This closes the "refresh the admitted snapshot or re-check per file at write time" requirement for the per-file case only — it does NOT refresh the KNOW-09 snapshot/authority, which remains BLOCKED; persistence still needs `--apply --operator-approved --know09-reviewed`.
        **CANARY-REPLACEMENT PLAN — FINDINGS (2026-09-20, read-only + one rolled-back transaction; table still 11,273):**
        - The 50 wrong-convention canary rows have **0 dependents**: no rows in `atlas_class_search_index_v1` / `atlas_features` / `atlas_knowledge_objects` reference them, and their only children are 8 methods that are themselves canary rows.
        - **A replacement row CANNOT coexist with a canary row.** `atlas_ast_nodes` is UNIQUE on `(repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash)` and the writer sets `normalized_node_hash = sha256(structural_key)`, identical for the old and aligned row. Rolled-back test on `src/ambient-legacy.d.ts#interface:ProcessEnv`: file row inserted (1), the aligned interface row (`5b3891500d38`, id computed correctly) was **silently dropped by `ON CONFLICT DO NOTHING`**; the canary row `ab7b6c2d097a` kept the slot. So the earlier idea "write aligned rows, then mark canary `superseded_by`" is impossible as designed.
        - **WRITER HAZARD found:** `writeAtlasAstNodes` returns `treeNodeIds` for every node whether or not the INSERT happened. Only the caller's inserted-count and post-write readback catch a silent conflict skip (the apply script does both; any other caller would not). Recommendation: make the writer report per-node `inserted` flags.
        - Also: readers do not filter `superseded_by`, so even a working supersession chain would leave both rows visible to active reads.
        - **Options (operator decision, NOT applied):** (A, recommended) in-place re-key of the 50 rows inside one transaction — first insert the missing file rows, then UPDATE `tree_node_id`/`parent_tree_node_id` to the aligned ids (FK is DEFERRABLE INITIALLY DEFERRED; PK change is safe because there are no external dependents), after writing an archive manifest of the prior 50 rows (SHA-256, per the archive-not-delete rule); result = one row per identity, matches the existing convention. (B) tombstone the canary rows' `normalized_node_hash`, insert aligned rows, set `superseded_by` — keeps history but leaves duplicates visible to readers. (C) leave the 50 as-is and exclude them from active reads.
        **OPTION A (in-place re-key of the 50 canary rows) — TOOL BUILT, REHEARSED, NOT APPLIED (2026-09-20):** an operator "yes" to the A/B/C question was taken as choosing A, NOT as approval to write (lesson from the earlier canary). New `scripts/atlas/rekey-ast-canary-rows-v1.mjs`; the proof now also exports `.tmp/atlas/ast-conflicts-v1.jsonl` (aligned id + existing id for each of the 122 conflicts; 50 are canary-owned). Rehearsal (`REHEARSAL_PROVEN`, ROLLED_BACK): plan 50 = live `ast-grep-napi` non-file rows 50; dependents 0/0/0, outside children 0, superseded refs 0; pre-image archived to `.tmp/...rehearsal.json` (sha256 `82795ba2…3773`, 50 rows); 10 missing file rows inserted (10/10); 50 rows re-keyed in place (`updated_at=now()`); `SET CONSTRAINTS ALL IMMEDIATE` PASS; readback: 50 rows at aligned ids, 0 old ids remaining, 0 structural_key/parent problems, parent-kind matrix correct (26 interface/10 function/5 type/1 class → file; 8 method → class); after rollback table 11,273 with 50 canary rows and 0 file rows (verified by psql), no `deeds_labs/archive/2026-09-20` created, `docs/archive-manifest.json` untouched. PERSIST needs ALL of `--apply --operator-approved --know09-reviewed --confirm-rekey-option-a`; it then writes the pre-image to `deeds_labs/archive/<date>/` and appends a manifest entry (archive-not-delete; recovery = restore old ids from that file). Error this round: my first rehearsal FAILED_ROLLED_BACK on a wrong assertion (compared row count to the pre-file-insert count); fixed, rehearsal now passes. Still true: this fixes only the 50 rows — 72 old `tree-sitter` conflicts and the other caveats above remain.
        **WRITER FIX + KNOW-09 RE-CHECK (2026-09-20, no DB writes):** (1) `scripts/atlas/lib/atlas-ast-nodes-writer.mjs` now also returns `insertedFlags[i]` (true only when the INSERT really happened; `treeNodeIds` remain the COMPUTED ids) — additive/backward compatible; the apply and re-key rehearsals were rerun after the change: both `REHEARSAL_PROVEN`, table still 11,273 / 50 canary rows. Callers should adopt the flags (the two scripts here still rely on count checks + readback, which do catch a skipped insert). (2) Re-ran `npm run atlas:docs:knowledge-source-snapshot-live` (read-only): still `BLOCKED`, `nextGate: KNOW-09-SOURCE-AUTHORITY-RECONCILIATION`; registry parity intact (24,456 exact matches) but worktree parity false — **645 mismatched + 8 missing = 653 issues at 08:16Z vs 639 + 8 = 647 at 06:51Z** (drift grew ~6 files during this session from concurrent edits; the receipt on disk had already been refreshed by another session at 07:57Z with the same 653), repair plan still bound to a different revision (`7ac27f1c…` vs admitted `e24bb971…`). The KNOW-09 gate therefore has NOT cleared; persistent writes remain blocked. (3) Error/observation: Python could not open `atlas-ast-nodes-writer.mjs` for writing (Errno 22, 8 retries over ~24 s) while the Edit tool wrote the same file immediately afterwards — so the recurring Windows write failures are not always a short-lived lock and may be specific to the Python path; cause still uncaptured.
        **14.3 OPERATOR DECISION QUEUE (2026-09-20; everything below is built/rehearsed and waiting — nothing else is unblocked without these):**
        | # | Decision | Recommended | Tool ready (rehearsal-proven) |
        |---|---|---|---|
        | 1 | KNOW-09 source authority (drift 653, repair plan bound to another revision) — gates ALL persistent writes | reconcile in the owning session first | `npm run atlas:docs:knowledge-source-snapshot-live` |
        | 2 | Re-key the 50 wrong-parent canary rows (option A) | A | `rekey-ast-canary-rows-v1.mjs` (4 flags to persist) |
        | 3 | Bulk AST apply (21,530 net-new rows incl. file rows) — after #1, per-file digest re-check already built | canary of 50 under the corrected convention, then bounded batches | `apply-ast-declaration-canary-v1.mjs` (3 flags) |
        | 4 | Foreign-path class rows (3,498, back `atlas_class_search_index_v1`) | keep + reader filter, rebuild index later | none (no rows change) |
        | 5 | Scope V2 needs an injective path policy (250 collisions under `ACTIVE_APP_RELATIVE_V1`) | root-namespaced keys before widening | census only |
        | 6 | Domain tuples: T0 exact resolve (63,352) + T1 alias tier (17,752) + ontology gaps (21,694) + `domain:<group_id>` value choice | apply T0 after #1, approve T1 list | `resolve-domain-tuples-exact-v1.mjs` (4 flags) |
        | 7 | `USES_CONCEPT` lexical tags (353,973) — never promote to concepts; stoplist? | LEXICAL_TAG | none |
        | 8 | Packets over vendored/venv/backup/tmp/generated content (42,302, 68.5%) | exclude from canonical packets, archive, never delete | none |
        | 9 | 14.3c matrix producer | blocked on #1 and #8 (packets have 0 source_revision) | none |
        Process note: an earlier "implement end to end" was taken as approval for a persistent 50-row write before its gates existed; all write tools now default to rehearsal + rollback and need explicit flags. Ambiguous "yes" replies must not be treated as write approval.
        **OPERATOR ANSWERS RECORDED (2026-09-20, via structured question):** (1) KNOW-09: **wait for reconciliation** — all persistent writes stay blocked; only read-only + rehearsal work. (2) 50-row re-key: **apply option A only after KNOW-09**. (3) Domain tuples: **T0 exact + T1 high-confidence aliases** (81,104 tuples) when writes are allowed — T2/no-fit/generic/review/sentinel stay untouched. (4) Packet scope: **decide per top-level folder** — table below for the operator to mark keep/exclude (nothing changed).
        **PER-FOLDER PACKET TABLE (61,718 packets; "resolvable" = file exists in admitted binding revision `e24bb971…`; suggested class is MY suggestion for you to mark, not a decision):**
        | Folder | Packets | Resolvable | Suggested |
        |---|---|---|---|
        | `scripts` | 8,845 | 1,865 | KEEP resolvable; review the 6,980 unresolved (generated reports) |
        | `neschrom97` | 8,178 | 0 | REVIEW (generated NES/CHR97 cards) |
        | `sveltekit-frontend/docs` | 4,481 | 4,431 | KEEP |
        | `sveltekit-frontend/src` | 4,226 | 4,067 | KEEP (V1 scope) |
        | `.python311` | 4,140 | 0 | EXCLUDE (Python virtualenv) |
        | `crates` | 3,749 | 22 | REVIEW (build artifacts vs Rust sources) |
        | `src` (legacy root) | 3,260 | 2,895 | KEEP/REVIEW (ambiguous with the app tree — see path-policy collisions) |
        | `simd-bridge` | 3,075 | 80 | REVIEW (native build outputs) |
        | `sveltekit-frontend/memory` | 2,491 | 874 | REVIEW |
        | `llama-cpp-turboquant-gemma4` | 2,381 | 0 | EXCLUDE (vendored) |
        | `sveltekit-frontend/scripts` | 1,783 | 1,719 | KEEP |
        | `docs` | 1,679 | 648 | REVIEW |
        | `sveltekit-frontend/logs` | 1,427 | 0 | EXCLUDE (logs) |
        | `sveltekit-frontend/.venv_turbovec` | 1,380 | 0 | EXCLUDE (virtualenv) |
        | `sveltekit-frontend/tests` | 1,241 | 1,192 | KEEP |
        | `turbovec` | 1,163 | 0 | REVIEW (separate project?) |
        | `.tmp` | 1,063 | 0 | EXCLUDE (scratch) |
        | `claude-mem` | 807 | 0 | EXCLUDE/REVIEW (plugin) |
        | `.svelte-error-fixes-backup` | 692 | 0 | EXCLUDE (backup) |
        | `logs` | 512 | 0 | EXCLUDE (logs) |
        | `sveltekit-frontend/static` | 406 | 50 | REVIEW |
        | `sveltekit-frontend/.okf` | 395 | 0 | REVIEW (generated OKF cards) |
        | `sveltekit-frontend/drizzle` | 369 | 362 | KEEP |
        | `(repo root files)` | 293 | 106 | REVIEW |
        | `sveltekit-frontend/scratch` | 265 | 0 | EXCLUDE (scratch) |
        | `memory` | 233 | 102 | REVIEW |
        | `sveltekit-frontend/.tmp` | 215 | 0 | EXCLUDE (scratch) |
        | `next_steps` | 190 | 184 | KEEP |
        | `qdrant-windows` | 182 | 0 | EXCLUDE (binaries) |
        | `storage` | 174 | 0 | EXCLUDE (data) |
        Suggested EXCLUDE subtotal (venvs, vendored, logs, tmp/scratch, backups, binaries, storage): 12,431 packets (13,238 if `claude-mem` 807 is also excluded; an earlier draft of this line said 18,258 — an arithmetic error, recomputed from the table rows). Exclusion means an explicit non-source class + archive manifest, never deletion; nothing applied.
        Open before any canary: (a) rule for the 5 `tree_node_id` collisions (recommend exclude as `AMBIGUOUS_SAME_KEY` from the canary, or add a span ordinal to the hash only via a new identity revision); (b) confirm the `src/`-only scope vs 62.5% of active candidates; (c) regenerate candidates from current bytes (528 span failures + 1,165 drifted); (d) operator approval of a bounded canary limited to stampable rows, with readback.
      - New sub-decision (5): the 3,498 foreign-folder absolute-path rows are not this repo's source; recommend quarantine-by-`superseded_by`/exclusion from joins (archive, never delete) rather than re-keying.
- [ ] 14.3b Resolve `feature_ontology_tuples` (currently 100% UNRESOLVED) through the OAK kernel only after 14.3a and lineage gates; populate `atlas_ontology_concepts`/`relations` or record why they stay empty.
      **14.3b MEASURED 2026-09-20 (read-only; nothing written) — the premise "resolve all tuples through OAK" does not hold:** the 539,124 tuples are one extractor/version (`atlas-packets-ontology-v1`, evidence `{"source":"atlas_packets","join_method":"exact"}`) in four predicates: `USES_CONCEPT` packet→concept 353,973 (65.7%; 59,529 packets, 27,607 distinct objects), `BELONGS_TO_DOMAIN` feature→domain 61,717, `CLASSIFIED_AS` packet→domain 61,717, `IMPLEMENTS_FEATURE` packet→feature 61,717.
      - **`USES_CONCEPT` objects are lexical path/word tokens, not ontology concepts:** top objects `concept:frontend` 14,173, `concept:sveltekit` 14,171, `concept:neschrom97`, `concept:scripts`, `concept:lib`, `concept:python311`, `concept:src`, `concept:json`, `concept:2026`…; 47,464 tuples are generic path tokens (`src/lib/scripts/frontend/sveltekit/crates/json`) and 3,942 (812 distinct) are pure numbers. `atlas_ontology_concepts` and `atlas_ontology_relations` are EMPTY (0/0), so there is nothing for OAK (`/oak/lookup|search|traverse`, `READ_ONLY_SHADOW`, adapter `atlas-postgres`) to resolve them to. They should be treated as `LEXICAL_TAG` evidence (stoplist + count), never promoted to concepts by rename.
      - **Domain tuples (123,434 = `BELONGS_TO_DOMAIN` + `CLASSIFIED_AS`) resolve by a table join, not OAK:** 41 distinct domain keys vs the 17-row `atlas_domain_ontology` (`group_id`/`group_label`, e.g. `graph`, `gpu`, `frontend.sveltekit`). Case-insensitive exact match resolves only **63,352 tuples (51.3%)** (11 of 41 keys); the rest are non-canonical labels (`rag_retrieval`, `agent_orchestration`, `evidence_upload_storage`, `trace_mcp`, `cluster.summary`, `MachineLearning` vs `machine-learning`…) needing a reviewed alias map; 19,764 tuples sit in generic buckets (`Other`/`Utility`/`Library`/`tool`); **42 tuples are the error sentinel `domain:Classification failed`** that should never have been a tuple.
      - **PROPOSED domain alias map (draft for operator review; nothing applied; counts are `BELONGS_TO_DOMAIN`+`CLASSIFIED_AS` tuples; buckets sum to exactly 123,434):**
        | Tier | Keys → canonical `group_id` | Tuples |
        |---|---|---|
        | T0 exact (case-insensitive) | Graph, graph→`graph`; test→`test`; gpu→`gpu`; compiler→`compiler`; frontend→`frontend`; database, Database→`database`; retrieval→`retrieval`; cache→`cache`; API→`api` | 63,352 |
        | T1 high-confidence alias | UI→`frontend` 8,730; MachineLearning→`machine-learning` 4,682; rag_retrieval→`retrieval` 3,692; graph_topology→`graph` 232; cache_layer→`cache` 212; Authentication→`auth` 104; auth_login_register→`auth` 100 | 17,752 |
        | T2 medium (review each) | infrastructure→`devops` 276; repair_workflow→`error-handling` 200; embedding_indexing→`retrieval` 166 (alt `machine-learning`); cluster_analysis→`machine-learning` 98 (alt `graph`) | 740 |
        | NEEDS_NEW_DOMAIN (no fit in the 17) | documentation 13,564; agent 3,072; backend 2,990; agent_orchestration 814; evidence_upload_storage 472; case_management 360; mcp_agents 122; document_processing 114; citation_engine 104; legal_reports 68; trace_mcp 14 | 21,694 |
        | GENERIC (no information) | Other 10,882; tool 7,390; Utility 1,050; Library 442 | 19,764 |
        | REVIEW (ambiguous) | memory_optimization 56; Embedding 32; cluster.summary 2 | 90 |
        | SENTINEL (quarantine) | `Classification failed` | 42 |
        Reading: the 17-row `atlas_domain_ontology` has no domain for documentation, agents/MCP, backend, or the legal product (case management, citations, legal reports, evidence upload) — together 21,694 tuples (17.6%) — so either the ontology is extended (operator decision, with `group_id`s + parents) or these stay `UNRESOLVED_NO_CANONICAL_DOMAIN`. T0+T1 = 81,104 tuples (65.7%) could be resolved without any new ontology content once T1 is approved.
      - **T0 RESOLVER BUILT + REHEARSED, NOT APPLIED (2026-09-20):** new `scripts/atlas/resolve-domain-tuples-exact-v1.mjs` (resolver `atlas-domain-ontology-exact-ci@v1`; touches only `CLASSIFIED_AS`/`BELONGS_TO_DOMAIN` tuples whose key matches EXACTLY ONE `atlas_domain_ontology` row by `group_id`/`group_label`, case-insensitive; no aliasing). Writes `resolution_state='RESOLVED'`, `resolved_concept_id='domain:<group_id>'` (namespace-prefixed so a domain is never mistaken for an ontology concept — the column is free text, no FK, and there is no resolver-version column) and merges a `resolution` object (resolver, resolver_version, matched_on, group_id, ontology_table) into `evidence`, preserving the original `source`/`join_method` keys. Rehearsal `REHEARSAL_PROVEN` (ROLLED_BACK): 41 unresolved domain keys → 11 resolvable (63,352 tuples), 0 ambiguous, 30 unmatched (60,082 tuples untouched); pre-image archived to `.tmp/...rehearsal.json` (63,352 rows, sha256 `d3f35922…981d`); 63,352/63,352 updated with 0 per-key mismatches; verify: 0 resolved outside domain tuples, 0 missing evidence keys, 0 resolved values absent from the ontology, 0 non-domain tuples touched, 0 targets remaining (idempotent); table after rollback still 539,124 `UNRESOLVED` (psql-verified). PERSIST needs ALL of `--apply --operator-approved --lineage-reviewed --confirm-t0-domain-resolution` and then writes the pre-image to `deeds_labs/archive/<date>/` + a `docs/archive-manifest.json` entry (recover by restoring the three columns by `id`). Open questions before applying: whether `domain:<group_id>` is the wanted value for `resolved_concept_id` (vs. the `atlas_domain_ontology.id` uuid), and the cohort's lineage gate (tuples derive from `atlas_packets` identity; KNOW-09 unresolved). Housekeeping: removed a leftover no-op statement from the script.
      - Recommended revised scope for 14.3b: (i) resolve the 63,352 exact domain tuples by join and mark `resolution_state`/`resolved_concept_id` only with an explicit `resolver_version`; (ii) produce a reviewed alias map for the other ~30 domain keys (human review, no auto-merge); (iii) quarantine the 42 sentinel tuples; (iv) classify `USES_CONCEPT` as `LEXICAL_TAG` and decide separately whether/how a real concept vocabulary (OAK/OAKLIB, seeded from the domain ontology) is ever populated. None applied.
- [ ] 14.3c PRECONDITIONS MEASURED 2026-09-20 (read-only) — the producer cannot be wired to real data yet: (1) `ExperimentFeatureMatrixSchema` requires non-empty `sourceRevision`/`featureRevision`/`inputHash`/`outputHash` and reads numeric features from `AnalysisPassResult`s of families `structural|lexical|semantic|sequence|rerank|grounded` (`compileExperimentFeatureMatrix`, `nlp-feature-compiler.ts`); (2) `atlas_packets` has **0 of 61,718 rows with a `source_revision`**, `atlas_packet_chunk_lineage` has 7,421 rows over only 627 packets, and `candidate-corpus-lineage-v1.json` (2026-09-16) admits **0 of 61,718** (61,717 `MISSING_SOURCE_REVISION`, 1 `MISSING_SOURCE_REF`); (3) `analysis_pass_results` (11,103 rows) has no `family` column (family is an in-memory TS field folded into `pass_type`) and its pass types are `summarization` 10,906 / `embedding` 150 / `cache_push` 20 / `code_feature_registry` 23 / `pos-concept-tagging` 4 — **none of the six families the compiler reads**, and only 27 rows carry `source_revision` (none of the summarization/embedding/cache rows do); (4) the CandidateOrdinal corpus (`candidate-ordinal-corpus-receipt-v1.json`, snapshot `corpus-snapshot:workspace-active-v1:v1`, 4,951 rows, dense ordinals, checksum `9669b018…a3a3`, admission `CANDIDATE_ORDINAL_ADMISSION_READY`) mixes `proto:` service refs with packets, dates from 2026-08-27, and `downstreamAllowed:false`; the lineage guard reports `eligibleRows:0`, `currentCohortAdmitted:false`, nextGate `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`. Conclusion: the AST tranche gives `atlas_ast_nodes` real `source_revision`s, but nothing yet binds PACKETS to a source revision, so no frozen current cohort can exist and a matrix built now would be almost all-null. The unblocking work is upstream (packet→source-revision binding / `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`, KNOW-09), not in the compiler. **PACKET→SOURCE-REVISION BINDING MEASURED (2026-09-20, read-only):** of the 61,718 `atlas_packets` (one distinct `source_ref` each), only **19,416 (31.5%)** resolve to a file in the admitted binding revision `sha256:e24bb971…` (exact root-relative 16,543; +2,873 via `sveltekit-frontend/` prefix + case-fold; 3,031 resolve only through the prefix alias, and legacy-root `src/` refs, 3,260, are ambiguous with the app tree). The other **42,302 (68.5%) point at files outside the admitted snapshot**: `neschrom97/` 8,178, `scripts/` (generated reports etc.) 6,980, `sveltekit-frontend/` subfolders absent from the snapshot 6,888 (CORRECTION: an earlier draft called these "malformed `…/{` refs" — a misread of a sample string; only 1 packet has such a ref; the 6,888 are `logs/`, `.venv_turbovec/`, `memory/`, `scratch/`, `.okf/`, `.tmp/`, `static/` etc.), **`.python311/` (a Python virtualenv) 4,140**, `crates/` 3,727, `simd-bridge/` 2,995, vendored `llama-cpp-turboquant-gemma4/` 2,381, `turbovec/` 1,163, `.tmp/` 1,063, `docs/` 1,031, `claude-mem/` 807, `.svelte-error-fixes-backup/` 692, `logs/` 512, `src/` 365. Packet identity columns are also in the wrong namespaces for binding: `workspace_revision` = `0` on all 61,718 (the legacy coerced integer), `workspace_id` holds labels (`docs` 54,142, `sveltekit-frontend` 3,060, `scripts` 562) not the snapshot workspace UUID, `workspace_revision_key`/`lineage_producer_revision` are empty, `canonical_source_ref` is filled for 58,366, `source_kind` is NULL for 58,304. So a packet→source-revision backfill would (a) stamp at most ~31.5% of packets, (b) need a decision on the 68.5% that index vendored/venv/backup/tmp/generated content (exclude from canonical packets vs. give them an explicit non-source class), and (c) must not reuse the existing `workspace_id`/`workspace_revision` values. This is the concrete shape of `CURRENT-SOURCE-PACKET-CHUNK-COHORT-01`; nothing here was applied. Original 14.3c text follows: Wire the 9.1 producer (`compileExperimentFeatureMatrix`) to one frozen CandidateOrdinal cohort and write an `AnalysisPassResult` with evidenceRefs/revisions preserved; only then evaluate KMeans/SOM consumers (14.4 owner decision).
- [ ] 14.4 Decide the owner for symbol-registry KV clustering (extend `train_domain_classifier.py` vs new lane) via
      the runtime-ownership registry before writing code (Duplication Prevention rule).
- [ ] 14.5 Add GIN indexes on `feature_ontology_tuples` only after 4.6's matview is human-approved and a query plan
      shows the btree set is insufficient.

### 14.6 Deep-audit results (2026-09-20, TRACE MCP + stale probe; read-only)

| Gate / probe | Result |
|---|---|
| Index freshness | STALE: canonical `docs/graph/codebase-graph.json` = 2026-08-30; newest probe = 2026-09-10. Not regenerated (needs operator OK per deep-audit skill). |
| G4/G5/G16 (route auth/Zod/tests) | NOT_EVALUABLE: probe has `routesWithAuth=0 / routesWithoutAuth=0` graph-wide, i.e. route flags were not computed. Do not read as PASS. |
| G14/G15/G21-25 (scope: nlp/ontology/structural, 110 files) | PASS: 0 sv4Legacy, 0 ssrUnsafe |
| G11 localhost refs (scope) | 4 scripts under `scripts/atlas/` (audit/prove scripts, low risk) |
| `trace.trace_system_health` | degraded: `topology_search` :8101 DOWN, `rerank` :8099 DOWN; mcp, ollama, bifrost, :8090, go_retrieval, qdrant, neo4j, postgres, redis OK |
| `trace.miniforge_health` | ready; treesitter_chunker + ast_grep + networkx true; cugraph/cuvs/torch false |
| `trace.topology_hydration_status` | 2 rows only: bmu 0.0, manifold4 1.0 — tiny table, not corpus-scale evidence of a 4D manifold |
| `trace.atlas_workstation_status` | FAILED: idle-timeout after 300s, no result (see 14.6d) |
| Symbol registry `atlas_callable_search` | 285 rows vs `atlas_ast_nodes` 11,067 (~2.6% coverage); has domain_id/confidence, secondary_domains, inferred_uses, taxonomy_revision; GIN on calls/imports/param names+types/search_vector/jsonb |
| `feature_ontology_tuples` | btree-only; `resolution_state` + `resolved_concept_id` present (OAKLIB Phase 2); default extractor_version still `phase-107-v1` |

- [x] 14.6a (answered 2026-09-20, read-only) The 285 vs 11,067 gap is a gated, bounded promotion with sparse upstream nominations (461 nominations, 338 ineligible variables; 8,727 canonical-resolved symbols unnominated), not a failed writer; 200 of 285 rows carry legacy `workspace:0`. Full funnel in `parent-atlas-workboard-feature-utility-fabric/tasks.md` (REGISTRY-COVERAGE-01). Original text: Explain/close the 285 vs 11,067 registry coverage gap (is `atlas_callable_search` callables-only by design, or unpopulated?) before any KMeans-on-symbols work.
- [ ] 14.6b `topology_search` :8101 and `rerank` :8099 are down — 4D topology search cannot be smoke-tested until restarted; `dev:gpu` does not start either.
- [ ] 14.6c Regenerate the graph index (`npm run index:codebase:fast`) and re-run G4/G5/G16 for the sidecar routes (`api/atlas/domain-taxonomy/classify` etc.); existing G4/G5 findings in CLAUDE.md remain deferred per DEV_BYPASS_AUTH policy.
- [ ] 14.6d `trace.atlas_workstation_status` FAILED (2026-09-20): no response or progress for 300s, aborted by the MCP idle timeout — no readiness data obtained. Investigate why the tool hangs (likely a slow Postgres spine query or a lane-health artifact read), or raise the per-server `timeout` for `trace`; do not treat workstation readiness as known.
