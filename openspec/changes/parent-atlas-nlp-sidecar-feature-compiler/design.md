## Context

`python/miniforge_nlp_sidecar.py` (FastAPI, port 8095, containerized in
`docker/miniforge-nlp-sidecar/`) already exists and already imports
`tree-sitter`, `tree-sitter-language-pack`, `ast-grep-py`, `spacy`,
`langextract`. Its Dockerfile lists `treesitter-chunker` as a pip dependency
and the Python source already has `TREESITTER_CHUNKER_AVAILABLE` detection
(checks `treesitter_chunker`/`tree_sitter_chunker`/`chunker`/
`treesitter-chunker` module names) surfaced in a `/health`-style response
alongside `spacy`/`langextract`/`tree_sitter`/`ast_grep` availability flags.
This is a real, running foundation — not a green-field build.

Separately, `atlas_ast_nodes` is a live Postgres table (verified via `\d`,
2026-08-09) with exactly the shape a "Boundary IR" contract implies:
`tree_node_id` (PK), `structural_key`, `node_kind`, `qualified_symbol`,
`start_byte`/`end_byte`, `line_start`/`line_end`, `normalized_node_hash`,
`parser_name`/`parser_version`/`parser_language`/`grammar_version`,
`parent_tree_node_id`, `source_ref_key`, `source_revision` — and critically,
**no `packet_key` column**. This confirms, independent of any external claim,
that this repo already treats AST facts as identity-agnostic: structural
extraction populates `atlas_ast_nodes` without ever claiming packet identity,
exactly the "NOT competing chunk owner" boundary this change's proposal
describes.

This session (same day) already proved the target pattern for a different
domain: `parent-atlas-graph-analysis-contract`'s Patch C/D/E built
`GraphAnalysisRunSchema`/`AnalysisRunEnvelopeSchema` — one shared lineage
envelope (`runId, algorithm, backendPreference/backendActual, gpuAccelerated,
inputHash, outputHash, status, parameters, metrics`) that PageRank, Louvain,
and Leiden all write through, instead of each analysis type inventing its own
persistence shape. `AnalysisPassResult` (this change) is the same idea
generalized to non-graph, non-Postgres-table passes (NLP/structural/sequence/
rerank results that may not need their own dedicated table, but still need a
consistent, typed response shape across every pass and backend).

## Goals / Non-Goals

**Goals:**
- Give `miniforge_nlp_sidecar.py` one shared result envelope
  (`AnalysisPassResult`) across every pass family, so callers (the TypeScript
  orchestration layer) don't need per-pass-type response handling.
- Turn the sidecar into a pass registry (`POST /analyze {passes: [...]}`)
  instead of a fixed pipeline — callers request only the passes they need.
- Keep AST structure (`AstUnit`/Boundary IR/`atlas_ast_nodes`) canonical and
  independently queryable — `semantic_768` is *conditioned* by AST structure
  through its input text, never replaces or hides it.
- Establish five evidence-signal families (lexical/semantic/structural/
  topological/execution) as the organizing taxonomy for
  `ExperimentFeatureMatrix` columns, with an optional derived `control5`
  summary vector for routing/ACE decisions — explicitly not five dimensions
  inside `semantic_768` itself.
- Keep the NLP/structural/sequence sidecar CPU-first; GPU-heavy batch work
  (embeddings, cross-encoder batches when large, graph traversal) stays in
  `atlas_rapids_sidecar.py` or the existing embedding service, not duplicated
  here.

**Non-Goals:**
- No merge of `miniforge_nlp_sidecar.py` and `atlas_rapids_sidecar.py` into
  one process — different CUDA/dependency sensitivity, different failure
  domains, matches the existing 3-layer split precedent from
  `parent-atlas-graph-runtime-enhancement`.
- No new embedding implementation. `semantic_768` generation stays owned by
  whatever service already owns it (see
  `parent-atlas-semantic-768-canonical-contract`) — this change only affects
  what text gets sent as embedding *input* (AST-conditioned semantic cards).
- No unconditional LangExtract calls. LangExtract is LLM-backed (confirmed:
  it supports local Ollama models, is fundamentally an LLM extraction
  library) — it runs only behind `groundedExtractionRequired: true` on a
  small, already-filtered candidate set (8-20 units), never as a routine pass
  over every `AstUnit`.
- No wiring of MiniLM/Mixedbread into `canonical-rerank-executor.ts` in this
  change — that's gated on the reranker-ownership audit (Decision D5) landing
  first.
- No implementation beyond verification/audit steps in this change itself —
  capture and design only, per this repo's gate-by-gate discipline.

## Decisions

### D1 — AnalysisPassResult: one envelope for every sidecar pass

Refined per the 2026-08-09 architecture correction to a precise TS shape —
`packetKey` is optional-undefined (`packetKey?: string`), not nullable, since
a pre-packetization structural pass simply omits the field rather than
asserting `null` as a positive claim about identity state; `structured`
(not `artifacts`) holds pass-specific structured output distinct from
`features` (a flat scoring/boolean record) and `evidence` (grounded spans);
`latencyMs` is required, not optional, since every pass boundary is a place
operators will want to profile:

```typescript
interface AnalysisPassResult {
  requestId: string;

  packetKey?: string;
  sourceRef: string;
  sourceRevision: string;

  family: 'structural' | 'lexical' | 'linguistic' | 'semantic' | 'sequence' | 'rerank' | 'grounded';
  passName: string;                // e.g. 'treesitter_chunk', 'spacy', 'viterbi', 'minilm'
  passRevision: string;

  backend: string;                 // e.g. 'treesitter-chunker', 'spacy', 'hmmlearn', 'sentence-transformers'
  backendVersion: string;
  device: 'cpu' | 'cuda' | 'external';

  inputHash: string;
  outputHash: string;

  latencyMs: number;
  status: 'succeeded' | 'skipped' | 'failed';

  features: Record<string, number | boolean>;
  structured: Record<string, unknown>;
  evidence: EvidenceSpan[];

  warnings: string[];
}
```

**Pass registry** — one endpoint, requested passes only, not one giant fixed
pipeline:

```
PASS_REGISTRY
├── structural.tree_sitter_chunk
├── structural.ast_grep
├── lexical.identifiers        (deterministic code-term splitting, no model)
├── lexical.rg_evidence        (see D7 — conditional on TS ownership audit)
├── linguistic.spacy           (natural-language text only, see D3)
├── semantic.semantic_card     (AST-conditioned card assembly, see D2/ast-conditioned-semantic-card spec)
├── sequence.hmm_observations
├── sequence.viterbi
├── rerank.minilm              (RERANK_FAST tier, see D5)
├── rerank.mixedbread          (RERANK_DEEP tier, disabled by default, see D5)
└── grounded.langextract       (opt-in only, see nlp-sidecar-pass-registry spec)
```

Mirrors `AnalysisRunEnvelopeSchema`'s shape closely enough to share design
vocabulary (`backend`/`device` here vs. `backendPreference`/`backendActual`/
`gpuAccelerated` there) without being byte-identical — this envelope covers
per-unit passes (one `AstUnit`, one query), not per-run analytics jobs
(one PageRank execution over the whole graph). Keeping them as two related
but distinct schemas, not one forced-generic union, matches this session's
own finding that over-generalizing a contract (`FeatureRowV1` staying "small
until ablation proves value") is a deliberate, repeated pattern in this repo.

**Alternatives considered**: one endpoint per pass type with ad hoc response
shapes (rejected — exactly what exists today, and the source of the
already-observed "every capability reinvents its own persistence/response
shape" problem). A single mega-schema shared between graph analysis and NLP
passes (rejected — graph runs are per-execution/per-algorithm; NLP passes are
per-unit/per-request; forcing one shape either bloats graph runs with unused
per-unit fields or bloats NLP passes with unused per-execution fields).

**Live constraint (not optional)**: `sveltekit-frontend/src/lib/server/nlp/
miniforge-nlp-sidecar.ts` already has a typed client calling `POST /analyze`
with 22 files across the TypeScript codebase depending on the existing
`NlpAnalyzeRequest`/`NlpAnalyzeResponse` (`extractionMode`-based) contract.
`AnalysisPassResult` must be introduced as an **additive** extension
(optional `passes`/`passResults` fields) of that existing endpoint, not a
breaking v2 replacement.

### D2 — Structural pass: treesitter-chunker as producer, AstUnit as contract

`treesitter-chunker` (already a Docker pip dependency, already
version-probed in `miniforge_nlp_sidecar.py`) is the current structural
extraction *application* — it packages grammar management, 36+ language
support, parallel repository-scale processing, and structured export that
would otherwise need to be rebuilt. `tree-sitter`/`tree-sitter-language-pack`
are the parser *engine* underneath it. `ast-grep-py` is a separate structural
*query/rewrite* tool, not a chunking application — it should not be named as
a joint "structural owner" alongside TreeSitter Chunker (this is the
correction needed in `docs/architecture/PACKET-COMPILER-STAGES.md`'s Stage 1
heading).

The **canonical contract** `treesitter-chunker` output must normalize into is
`AstUnit` (Boundary IR) — matching `atlas_ast_nodes`' live schema:
`source_ref, source_revision, tree_node_id, symbol_version_id, language,
node_kind, qualified_symbol, byte_start/end, line_start/end, parent_symbol,
imports, exports, calls, references, tests, parser_revision, grammar_revision,
content_hash`. **No `packet_key` at this stage** — confirmed as the existing,
correct behavior via `atlas_ast_nodes`' live schema (no such column). This
means a future faster parser (e.g. a Rust reimplementation) can be swapped in
without touching anything downstream, as long as it still emits `AstUnit`.

**Alternatives considered**: treat `treesitter-chunker` itself as the
canonical structural contract (rejected — ties the whole downstream pipeline
to one third-party package's API surface; the explicit point of separating
"contract" from "current producer" is to make that swap possible later).

### D3 — Linguistic pass (spaCy) scoped to natural language only

spaCy (POS tagging, lemmatization, dependency parsing, noun chunks, entities)
runs only over comments, docstrings, error messages, README/spec text, and
user query text — never over source identifiers/tokens. Tree-sitter already
knows `rerankCandidates` is a function identifier; running an English POS
tagger against it adds nothing and risks nonsense output (an English parser
has no model for camelCase code tokens).

**Alternatives considered**: run spaCy over all text uniformly including
identifiers (rejected — wastes a pass and produces meaningless "linguistic"
features on non-English tokens).

### D4 — HMM sequence pass operates on discrete observations, not embeddings

Route-state inference (`hmmlearn` `CategoricalHMM`, Baum-Welch for offline
training, Viterbi for online decoding) consumes a small discrete observation
vocabulary derived from other passes' outputs
(`EXACT_SYMBOL_FOUND, SEMANTIC_ONLY_MATCH, TEST_EDGE_FOUND,
DEPENDENCY_PATH_FOUND, COMPILE_FAILURE, RERANK_CONFIDENT, RERANK_AMBIGUOUS,
PATCH_SUCCEEDED, PATCH_FAILED`, etc.) — never raw 768-dim vectors. Kept
CPU-only: the state space is tiny relative to embedding/graph/rerank
workloads, and GPU residency for HMM inference would contend with those
larger jobs for no benefit.

**Alternatives considered**: feed continuous embeddings into a
Gaussian-emission HMM (rejected — loses interpretability of the route state,
and the discrete-observation approach is both cheaper and more directly
tied to concrete pipeline events an operator can reason about).

### D5 — Reranker ownership audit before adding MiniLM/Mixedbread tiers

**Found live, 2026-08-09**: 14 files under
`sveltekit-frontend/src/lib/server/retrieval/` match `*reranker*` or
`canonical-rerank-executor`: `attention-reranker.ts`, `boosted-reranker.ts`,
`canonical-rerank-executor.ts`, `cluster-aware-reranker.ts`,
`cross-encoder-reranker.ts`, `cuda-rnn-reranker.ts`, `gpu-reranker.ts`,
`langextract-reranker.ts`, `noun-reranker.ts`, `post-process-reranker.ts`,
`reranker-blend.ts`, `runtime-reranker.ts`, `semantic-vector-reranker.ts`,
`triton-reranker.ts`, `turbovec-rerank.ts`. `canonical-rerank-executor.ts` is
confirmed genuinely canonical by its own docstring ("Canonical Rerank
Executor — Dual-Identity Provenance + Segmented Caching") and by importing
`blendScores`/`RuntimeReranker` from `runtime-reranker.ts` (already
established elsewhere as the canonical Domain 5 fusion owner, per
`parent-atlas-retrieval-lod-algorithm-taxonomy`'s 2026-08-08 addendum). The
other 13 are unclassified — live, orphaned, or superseded is unknown without
an audit.

**Decision**: MiniLM (fast tier, ~30-50 candidates) and Mixedbread (deep
tier, ~8-20 candidates, `mxbai-rerank-base-v2`, disabled unless explicitly
requested) get wired in as new backends **behind
`canonical-rerank-executor.ts`**, not as new standalone files, once the
13-file audit confirms none of them already implement equivalent
functionality under a different name. This audit is a required task (see
tasks.md), not an assumption this design gets to skip.

**Alternatives considered**: add MiniLM/Mixedbread as new standalone reranker
files immediately (rejected — repeats the exact duplication pattern this
session already found and fixed twice; 15 reranker files is worse than 14).

### D6 — Five evidence families, not five embedding dimensions

`control5` = `{lexical_confidence, semantic_confidence, structural_confidence,
topological_confidence, execution_confidence}` — a small derived summary
vector for routing/ACE decisions, computed *from* the wider
`ExperimentFeatureMatrix` (candidate × ~20-40 real features spanning BM25,
`semantic_768` cosine, AST role/path/call-edge, PageRank/community/BFS-hops,
compile/test/repair history). `semantic_768` itself stays a single coherent
768-dim geometric embedding space — it is never split into five sub-regions
or dimensions representing the five families. This is a naming/modeling
clarification, not new infrastructure — `ExperimentFeatureMatrix` and the
5-domain taxonomy are owned by `parent-atlas-retrieval-lod-algorithm-taxonomy`;
this change's contribution is `control5` as one additional, optional derived
column for cheap routing decisions.

### D7 — rg/lexical-exact: reuse the existing TypeScript owner, don't add a second one

**Confirmed live, 2026-08-09**: `sveltekit-frontend/src/lib/server/retrieval/
router-matrix.ts` already declares `lexical_exact` as one of 8 `SignalType`
values in its 4x4 query router (`query-router-4x4.ts` also references it).
This is a real, already-designated TypeScript owner for exact lexical
matching — `ripgrep`/rg output is not currently unowned.

**Decision**: `lexical.rg_evidence` in the pass registry (D1) is **not** a
new retrieval lane. It exposes `POST /lexical/rg` as a bounded evidence
*provider* only (JSON output, `--line-number --column --glob`, hard result
limits) for passes running inside the Python sidecar that need raw grep
evidence as an input (e.g. cross-referencing an `AstUnit`'s call target
against literal text occurrences) — it does not feed a second RRF/fusion
vote alongside `lexical_exact`. Whether this endpoint is needed at all is a
task-level question (see tasks.md 0.2/10) — if nothing inside the sidecar
actually needs raw rg evidence as a pass input, don't build it speculatively.

**Alternatives considered**: give the sidecar its own independent rg-based
retrieval lane (rejected — exactly the "another library becomes another
search/ranking owner" anti-pattern this whole change exists to stop; would
create a second, uncoordinated `lexical_exact`-equivalent signal).

### D8 — ACP/A2A surface: register the pass registry, don't bypass it

This repo has a real Agent Control Plane (`GET /api/acp/tools`,
`POST /api/acp/execute`, `POST /api/acp/rpc`, backed by
`ACPToolRegistry.ts`) and a real A2A surface (`GET /.well-known/agent.json`).
**Confirmed live, 2026-08-09**: `ACPToolRegistry.ts` has zero references to
`miniforge`, `rg_search`, `ripgrep`, or any sidecar tool name — the NLP
sidecar's passes are not currently discoverable or callable through ACP at
all. Agents (Ornith or otherwise) that want structural/linguistic/rerank
evidence must know the sidecar's HTTP contract directly, bypassing the
tool-registry/agent-card discovery surface this repo already built for
exactly this purpose.

**Decision**: once the pass registry (D1) lands, register a small number of
coarse-grained ACP tools (not one tool per pass) — e.g. `analyze_structural`,
`analyze_semantic_card`, `rerank_candidates` — each wrapping one or more
sidecar passes behind the existing `ACPToolRegistry` contract
(`name, description, category, inputSchema, outputSchema, examples`,
`supportsDryRun`). This keeps Ornith's tool surface small and typed (per the
proposal's own "typed multi-hop expansion, not raw graph dumps" principle,
applied here to sidecar passes instead of graph traversal) while making the
sidecar's capabilities agent-discoverable instead of a side-channel HTTP
call known only to hand-written TypeScript client code.

**Scope boundary**: this decision is registration only — it does not change
`AnalysisPassResult`'s shape, and does not imply every pass gets its own ACP
tool (that would recreate the "14 reranker files" duplication shape one
layer up, as 11+ ACP tools instead of 11+ source files). Coarse-grained
wrapping is the point.

**Alternatives considered**: leave the sidecar ACP-invisible, reachable only
via the existing hand-written TypeScript client (rejected — matches current
state, but means every future agent capability needs its own hand-rolled
integration instead of reusing tool discovery already built for this
purpose). One ACP tool per pass (rejected — multiplies the tool surface
without a corresponding benefit; coarse wrapping loses no real
functionality since a caller needing fine-grained pass selection can still
pass `passes: [...]` through the wrapping tool's `inputSchema`).

## Risks / Trade-offs

- **[Risk]** `treesitter-chunker`'s pip dependency in the Dockerfile may not
  actually resolve/import successfully in a rebuilt container — it was found
  in source, not verified live in a running container this session.
  → **Mitigation**: first task in tasks.md is rebuilding the container and
  checking `/health`'s `treesitterChunker.available` field live, before any
  pass-registry work assumes it's usable.
- **[Risk]** **Confirmed live, 2026-08-09**: `docker/miniforge-nlp-sidecar/
  docker-compose.yml` has no bind mount at all — the container currently has
  no filesystem access to the repository it's meant to analyze. Any
  structural pass that needs to read source files (as opposed to receiving
  file contents inline in the request body) cannot work as currently
  deployed.
  → **Mitigation**: add a read-only bind mount (`../..:/workspace:ro`) before
  any pass that reads files from disk is exercised — required task, not
  optional (see tasks.md 0.5). Read-only is deliberate: this sidecar analyzes,
  it never writes back to the checkout.
- **[Risk]** Adding a pass registry increases the sidecar's surface area;
  a caller requesting an unsupported pass combination needs a clear failure
  mode, not a silent partial response.
  → **Mitigation**: `AnalysisPassResult.status: 'skipped'` with a `warnings`
  entry for any requested-but-unavailable pass, matching this repo's
  established "degraded response contract" convention (same top-level shape
  on success and degraded paths).
- **[Risk]** The 13-file reranker audit (D5) may reveal genuine redundancy
  that's expensive to resolve (archival decisions, call-site migrations).
  → **Mitigation**: audit is scoped to classification only in this change
  (live/orphaned/superseded), not remediation — remediation is a separate,
  later task once the audit's findings are known.
- **[Trade-off]** Keeping `miniforge_nlp_sidecar.py` and
  `atlas_rapids_sidecar.py` as two separate processes means an HTTP hop
  between NLP-derived observations and GPU-accelerated graph/vector work.
  Accepted deliberately — CUDA library isolation was already the explicit
  rationale for keeping RAPIDS separate from Neo4j (see
  `parent-atlas-graph-runtime-enhancement`), and the same isolation logic
  applies here.

## Migration Plan

Not applicable — this change adds new pass types and a registry endpoint to
an already-running sidecar; it does not remove or change any existing live
endpoint's behavior. Rollback is "stop requesting the new pass names."

## Open Questions

- Does the Docker container need a rebuild to pick up `treesitter-chunker`
  (Dockerfile already lists it, but the last-built image may predate that
  line)? Needs a live check, not an assumption either way.
- Should `AstUnit`'s `tree_node_id`/`atlas_ast_nodes` writes happen from
  inside `miniforge_nlp_sidecar.py` directly, or should the sidecar return
  `AstUnit` records to the TypeScript orchestration layer for it to persist
  (matching the existing "TypeScript merges/promotes, Python computes"
  split already used for RAPIDS)? Leaning toward the latter for consistency,
  but not decided here.
- ~~What's the actual current caller~~ **Answered, 2026-08-09**:
  `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts` is a real,
  typed TypeScript client (`createMiniforgeNlpSidecarClient`) already calling
  `POST {baseUrl}/analyze` with an `NlpAnalyzeRequest`/`NlpAnalyzeResponse`
  shape (`NlpEntity`, `NlpRelationship`, `NlpChunk`, `NlpFeature`,
  `NlpExtractionMode: 'entities' | 'relationships' | 'concepts' | 'full'`).
  22 files reference the sidecar port/name across langextract transport,
  MCP tool registries, query routing, and feature extraction — this is a
  live, multi-consumer surface. **Consequence**: the pass-registry design
  (D1) must be an additive extension of the existing `/analyze` contract
  (e.g. an optional `passes: PassName[]` field, with `NlpAnalyzeResponse`
  gaining an optional `passResults: AnalysisPassResult[]` field), not a
  breaking replacement — the existing `extractionMode`-based callers must
  keep working unchanged. This is now a required design constraint, not an
  open question.
