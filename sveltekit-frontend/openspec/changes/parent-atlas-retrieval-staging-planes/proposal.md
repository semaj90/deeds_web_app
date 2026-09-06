## Why

An external architecture review (2026-09-06, conducted via web search against EmbeddingGemma,
Qwen3-Reranker, mxbai-rerank, Firecrawl/LangExtract, llama-server, and Arrow/gRPC/CUDA-IPC primary
sources) found that this repo's retrieval stack currently mixes several conceptually distinct
"planes" without an explicit boundary between them: dense retrieval representation (EmbeddingGemma),
pairwise reranking (a purpose-trained cross-encoder), LLM-judge reasoning (Ornith), structural fact
extraction (Tree-sitter/ast-grep), tabular routing/capability-selection (a classifier over
execution-feature tensors), and interprocess transport (gRPC/Arrow/mmap/CUDA-IPC). Absent an
explicit contract, work in any one of these areas risks either (a) becoming a second, uncoordinated
owner of a capability another plane already owns — the exact failure mode CLAUDE.md's "One
Canonical Runtime Owner Per Capability" rule and "Duplication Prevention" section already warn
about — or (b) conflating two genuinely different jobs into one path, e.g. treating Ornith (a
generative agentic model) as if it were a purpose-trained reranker, or treating EmbeddingGemma's
named prompt modes ("Reranking", "Classification") as evidence that it is a cross-encoder.

This proposal is a planning/contract-definition change only. It records the reviewed architecture,
defines the specific new contracts and proof gates needed before implementation starts, and orders
the work so the cheapest, most falsifiable experiment (a reranker shadow-comparison) runs before any
larger structural change (transport-plane separation, a new tabular classifier, a DAG-based helper
planner). No production code changes are included in this change.

## What Changes

- Formalize the **staging-plane boundary** already implicit in this repo's code but never written
  down as a single ordered pipeline: bi-encoder retrieval (frozen, EmbeddingGemma) → RRF fusion
  (existing, `combineRRFLanes`/`dense-lane-aliases.ts`) → cross-encoder rerank (**existing but not
  currently running** — corrected 2026-09-06: `scripts/reranker-sidecar.py` already implements a
  real mxbai-rerank-base-v2 cross-encoder via `sentence_transformers.CrossEncoder`, wired through
  `canonical-rerank-executor.ts`; it needs to be started and verified live, not built) → optional
  LLM-judge promotion (Ornith, gated to hard cases only, proof-gated before promotion) → structured
  evidence extraction (batch LangExtract, new plane) → context assembly (existing ACE, extended with
  an explicit token-budget optimization contract) → synthesis (existing Ornith decode path, unchanged).
- Define `HelperCardV1`: a registry contract for describing non-LLM "helper" capabilities
  (`ast-grep-owner-finder`, `ts-morph-symbol-resolver`, `postgres-fts-search`,
  `qdrant-semantic-search`, `graph-neighborhood`, `web-search`, `migration-auditor`, `test-finder`,
  etc.) so EmbeddingGemma's existing task-conditioned prompt modes can route queries to the cheapest
  adequate helper before any LLM call, rather than establishing a second embedding model.
- Define `StructuralFactV1`: one shared schema any Tree-sitter/ast-grep implementation (Node/TS live
  query path, Python batch/RAPIDS research path, a future Rust path) must emit, so multiple language
  bindings of the same underlying parser can coexist as **adapters**, not competing structural-truth
  owners — matching this repo's existing `ADAPTER` vs `CANONICAL_OWNER` vocabulary
  (`docs/architecture/runtime-ownership-registry.json`).
- Define `CandidateEvidenceCardV1`: the compact, grounded-extraction bridge between a reranked
  candidate set and ACE context admission (produced by batch LangExtract over the post-RRF,
  post-rerank top 20-30 candidates only — never the full corpus).
- Define `ModelResolutionV1`: an explicit three-layer model-identity record (`requestedModel`,
  `internalModel`, `runtimeModelId`/`runtimeModelPath`, `resolutionSource`) so tests and callers stop
  asserting against a specific physical GGUF filename, which breaks every time the loaded model
  changes (already a real, live problem — see the "Ollama Phase-Out" / model-switch history at the
  top of this repo's root CLAUDE.md).
- Define the `ORNITH-RERANK-SHADOW-01` proof gate: a frozen-candidate-set shadow comparison across
  EmbeddingGemma-similarity baseline, a purpose-trained cross-encoder (mxbai-rerank-base-v2 or
  Qwen3-Reranker-0.6B — both Qwen2/Qwen3-based, SentenceTransformers `CrossEncoder`-compatible), and
  Ornith-as-judge (constrained yes/no logit scoring), measuring Recall@K / MRR / NDCG@10 /
  top-1 agreement / rank displacement / latency / token cost / GPU peak bytes. Ornith is not promoted
  to a production reranking role until this gate shows it adds lift over the cheap dedicated
  reranker on hard cases specifically — not general-purpose reranking of the full candidate set.
- **Recorded but explicitly NOT specced or scheduled in this change** (design.md documents the
  reasoning for each, since they depend on outcomes from the above): transport-plane separation
  (gRPC control / Arrow Flight bulk data / Arrow mmap cold artifacts / CUDA-IPC same-host GPU
  sharing), `ContextSegmentV1` budget-constrained context optimization, the tabular
  RandomForest/XGBoost/PyTorch capability-selection classifier, `HelperDagV1` + a Tang-style
  low-rank task-helper recommender, and `AgentWorkItemV1` as a LangGraph-checkpoint projection for
  Kanban-style work tracking. These are real, well-reasoned ideas from the review but each has a
  larger blast radius and depends on evidence this change's proof gates haven't produced yet.

## Impact

- **Code**: none in this change. This is contracts-and-proof-gate scaffolding only, matching the
  precedent set by `parent-atlas-ace-radix-residency` (contracts + benchmark harness, explicitly no
  production wiring).
- **New files** (design.md gives exact proposed locations): `HelperCardV1`, `StructuralFactV1`,
  `CandidateEvidenceCardV1`, `ModelResolutionV1` contract modules; the `ORNITH-RERANK-SHADOW-01`
  fixture + comparison harness.
- **No changes** to the live retrieval pipeline (`combineRRFLanes`, `search-runtime.ts`,
  `rrf-fuse.ts`, `canonical-rerank-executor.ts`), to Ornith's synthesis/decode path, or to
  EmbeddingGemma's embedding lane. This change adds evaluation scaffolding and contract definitions
  alongside the existing pipeline, not a replacement.
- **Dependencies**: none new. Corrected 2026-09-06: the `ORNITH-RERANK-SHADOW-01` harness's
  purpose-trained reranker requirement is already satisfied by the existing (not-currently-running)
  `scripts/reranker-sidecar.py` mxbai-rerank-base-v2 sidecar — see design.md section 12's corrected
  capability-gap record. No model download needed; the remaining work is starting and live-verifying
  that existing sidecar.
