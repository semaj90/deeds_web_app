## Why

**See root `CLAUDE.md`'s "Duplication Prevention — Audit Before You Build"
section for the durable rule this change's findings (D5/D7/D8 in design.md)
fed into** — this session found the same "N competing/unregistered owners"
failure mode four separate times, and that section now records all four as
evidence plus the audit-first checklist to prevent a fifth.

`docker/miniforge-nlp-sidecar/` is a real, running Python sidecar
(`python/miniforge_nlp_sidecar.py`, FastAPI, port 8095) that already imports
`tree-sitter`, `tree-sitter-language-pack`, `ast-grep-py`, `spacy`, and
`langextract`, and already probes for `treesitter-chunker` availability
(`TREESITTER_CHUNKER_AVAILABLE`, checked in `/health`). But it currently
exposes a handful of ad hoc endpoints rather than a coherent multi-pass
architecture, and nothing yet ties its output into the
`AnalysisRunEnvelopeSchema`/`graph_analysis_runs` lineage contract this
session's `parent-atlas-graph-analysis-contract` Patch C/D/E already proved
live for graph analysis. The risk this change exists to head off — proven
twice already today (5 competing PageRank implementations; 4 non-existent
relationship types silently accepted in a projection config) — is adding
MiniLM/Mixedbread/HMM/CodeBERT passes as uncoordinated one-off endpoints
instead of a typed, envelope-based pass registry with one canonical contract
per concern.

A large external architecture correction (this session, verbatim from the
user) proposes: layered ownership (parser engine vs. chunking application vs.
structural query/rewrite vs. canonical data contract, not "Tree-sitter or
ast-grep" as competing owners); `AstUnit`/Boundary IR as the permanent
canonical structural contract with `treesitter-chunker` as its current
(swappable) producer; five evidence-signal *families* (lexical, semantic,
structural, topological, execution) that feed a wide `ExperimentFeatureMatrix`
— explicitly NOT five dimensions inside `semantic_768`; HMM route-state
inference over discrete observations, not raw embeddings, kept CPU-only;
MiniLM (fast/cheap) and Mixedbread (deep/expensive) as two reranker cost
tiers behind the existing canonical rerank contract; LangExtract gated behind
`groundedExtractionRequired: true`, never in the unconditional hot path. This
change captures that correction as a concrete implementation plan.

## What Changes

- Establish `AnalysisPassResult` as the one shared envelope every sidecar
  pass returns (`request_id, packet_key, source_revision, pass_family,
  pass_name, pass_revision, backend, backend_version, device, input_hash,
  output_hash, status, features, artifacts, evidence, warnings`) — the same
  discipline as `AnalysisRunEnvelopeSchema` (graph analysis), generalized to
  non-graph passes.
- Turn `miniforge_nlp_sidecar.py` into a **pass registry**
  (`POST /analyze {passes: [...]}`) instead of one fixed pipeline: structural
  (`treesitter_chunk`, `ast_grep`), linguistic (`spacy`, natural-language text
  only — comments/docstrings/errors/queries, never source identifiers),
  semantic-card (AST-conditioned card assembly, embedding call delegated to
  the existing `semantic_768` service — **not** re-implemented here), sequence
  (`hmm_observations`, `viterbi`, CPU-only), rerank (`minilm` fast tier,
  `mixedbread` deep tier, both behind the existing canonical rerank contract),
  grounded (`langextract`, gated, opt-in only).
- Keep `atlas_rapids_sidecar.py` (GPU/RAPIDS) and `miniforge_nlp_sidecar.py`
  (CPU-first NLP/structural/sequence) as two **separate** Python processes —
  not merged. RAPIDS's CUDA library sensitivity is reason enough on its own.
- **Audit first, wire second**: before adding MiniLM/Mixedbread as new
  reranker tiers, classify the 14 existing files in
  `sveltekit-frontend/src/lib/server/retrieval/*reranker*` /
  `canonical-rerank-executor.ts` — which are live, which are orphaned — using
  the same discipline that found 5 competing PageRank implementations this
  session. `canonical-rerank-executor.ts` is confirmed genuinely canonical
  (imports `blendScores`/`RuntimeReranker` from `runtime-reranker.ts`); the
  other 13 need classification before anything new is added alongside them.
- Correct `docs/architecture/PACKET-COMPILER-STAGES.md`'s Stage 1 heading
  ("AST-Grep (Structural Extraction)") — it conflates the chunking
  application (TreeSitter Chunker, mentioned separately one line above) with
  the structural query/rewrite tool (ast-grep) under one stage name. Split
  per the layered-ownership model.
- **Reuse, don't duplicate, the existing `lexical_exact` TypeScript owner**
  (`router-matrix.ts`/`query-router-4x4.ts`) — the sidecar's `rg_evidence`
  pass, if built at all, is a bounded evidence provider for passes that need
  it internally, never a second fusion/RRF lane.
- **Register sidecar capabilities through ACP** (`ACPToolRegistry.ts`,
  `/api/acp/tools`) as a small number of coarse-grained tools, so agents
  discover them the same way they discover every other tool, instead of
  needing hand-rolled HTTP client knowledge — currently zero sidecar
  references exist in `ACPToolRegistry.ts`.
- Add the missing read-only Docker bind mount
  (`docker/miniforge-nlp-sidecar/docker-compose.yml` currently has none) so
  the container can actually read the repository it analyzes.
- **Not this change**: no code implemented here beyond what's needed to
  verify current state (e.g., confirming the Docker sidecar's
  `treesitter-chunker` pip dependency actually resolves at runtime). Capture
  and design only, matching this repo's gate-by-gate discipline.

## Capabilities

### New Capabilities
- `nlp-sidecar-pass-registry`: the `AnalysisPassResult` envelope + pass
  registry architecture for `miniforge_nlp_sidecar.py`.
- `ast-conditioned-semantic-card`: the AstUnit → SemanticCodeCard →
  AST-conditioned `semantic_768` embedding pipeline, with structure staying
  independently queryable rather than hidden inside the embedding.
- `evidence-family-control-vector`: the `control5` (lexical/semantic/
  structural/topological/execution confidence) derived signal, distinct from
  and feeding into the wider `ExperimentFeatureMatrix`.
- `acp-sidecar-tool-registration`: coarse-grained ACP tool registration for
  the sidecar's pass registry, so agents discover its capabilities through
  `GET /api/acp/tools` instead of needing raw HTTP client knowledge.

### Modified Capabilities
(none — no existing `openspec/specs/*` capability has a requirements change)

## Impact

- **Extends** `python/miniforge_nlp_sidecar.py`,
  `docker/miniforge-nlp-sidecar/Dockerfile` (already has `treesitter-chunker`,
  `spacy`, `langextract`, `ast-grep-py` as pip dependencies — verify these
  resolve live in a rebuilt container before building passes on top of them).
- **Audits, does not yet modify**, the 14-file reranker surface in
  `sveltekit-frontend/src/lib/server/retrieval/`.
- **Extends** `docker/miniforge-nlp-sidecar/docker-compose.yml` with a
  read-only bind mount (currently has none — confirmed live 2026-08-09).
- **Extends** `src/lib/server/services/knowledge-search/ACPToolRegistry.ts`
  with new coarse-grained tool registrations (confirmed live 2026-08-09:
  zero existing references to `miniforge`/sidecar tool names).
- **Corrects** `docs/architecture/PACKET-COMPILER-STAGES.md` Stage 1 heading.
- **Cross-references, does not duplicate**: `parent-atlas-graph-analysis-contract`
  (the `AnalysisRunEnvelopeSchema` pattern this change generalizes),
  `parent-atlas-gpu-graph-vector-substrate` (the GPU/RAPIDS half of the same
  overall substrate — cuGraph BFS/SSSP feeds the topological family here),
  `parent-atlas-retrieval-lod-algorithm-taxonomy` (owns the 5-family/
  `ExperimentFeatureMatrix` classification this change's `control5` slots
  into), `parent-atlas-semantic-768-canonical-contract` (owns `semantic_768`
  itself — this change conditions its *input*, never re-implements or
  competes with it).
