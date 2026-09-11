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
