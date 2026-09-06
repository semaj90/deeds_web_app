# Design: Retrieval staging-plane separation

Source: an external architecture review conducted 2026-09-06 via live web search against primary
sources (Google's EmbeddingGemma model card, Qwen's Qwen3-Reranker release, Mixedbread's
mxbai-rerank-base-v2 model card, the Ornith 1.5 config, LangExtract's docs, llama-server's
`cache_prompt`/`/v1/models` behavior, Apache Arrow's IPC/Flight/CUDA-buffer docs). Findings below
are attributed to that review; this document organizes them into an ordered, gated implementation
plan rather than a flat list.

## 1. Bi-encoder vs cross-encoder — the core distinction this repo doesn't yet encode

**EmbeddingGemma is a bi-encoder, not a cross-encoder**, regardless of its named prompt modes
("Reranking", "Classification", "Code Retrieval", etc.). A bi-encoder embeds query and document
independently (`embed(q) -> 768d`, `embed(d) -> 768d`, compare via cosine/dot) — this is exactly why
100K code embeddings can be precomputed once and searched cheaply via Qdrant/pgvector/cuVS/TurboVec.
EmbeddingGemma's prompt modes change how the embedding is *conditioned*, not the architecture: query
and document still never jointly attend to each other. Verified against Google's own EmbeddingGemma
documentation: 308M parameters, 768d output with 512/256/128 Matryoshka variants, 2K context,
positioned explicitly for retrieval/similarity/classification/clustering — never described as a
pairwise scorer.

A **cross-encoder** processes the pair jointly (`score(q, d) -> scalar`), modeling token-level
query-document interaction. More expensive per pair, but meaningfully better at reranking an already
small candidate set (dozens, not thousands).

**CORRECTION (2026-09-06, found while starting RERANK-SHADOW-01)**: this section originally claimed
"this repo currently has no cross-encoder reranker wired in at all." **That was wrong** — found via
`find . -iname "*rerank*"` (not searched before writing the original claim) that a genuine,
correctly-architected mxbai-rerank-base-v2 cross-encoder sidecar already exists:
`scripts/reranker-sidecar.py` (real `sentence_transformers.CrossEncoder` over
`mixedbread-ai/mxbai-rerank-base-v2`, a FastAPI `/rerank` endpoint, GPU/CPU device selection),
`src/lib/server/retrieval/triton-reranker.ts` (`scoreBatchCrossEncoder()` — sends genuine
`[query, doc]` pairs to either the sidecar's `/rerank` or a Triton `/v2/models/.../infer` endpoint,
architecturally correct joint-pair scoring, not text generation), and
`src/lib/server/retrieval/canonical-rerank-executor.ts` (wires it in with L0/L1 Redis caching and an
XGBoost/retrieval-order fallback chain), plus `scripts/launch-reranker.ps1` (a complete launcher with
CUDA/cuDNN DLL path setup) and `scripts/requirements-reranker.txt` (pinned deps: torch, transformers,
sentence-transformers, fastapi).

**However, live-checked 2026-09-06: it is not currently running.** `.env` has neither
`RERANKER_SIDECAR_URL` nor `TRITON_URL` set, and `curl http://127.0.0.1:8099/health` (the sidecar's
documented default port) returned unreachable. So `canonical-rerank-executor.ts`'s calls to it
currently fail over to a fallback path — separately, `src/lib/server/retrieval/cross-encoder-reranker.ts`
also confusingly reuses the name `rerankWithCrossEncoder` (aliased as `rerankWithGemma4`) for a
**different, LLM-pointwise-scoring fallback** that calls llama-server's `/v1/chat/completions` — a
real cross-encoder and an LLM-judge fallback share a misleadingly similar name in this codebase,
which is worth a separate small documentation/renaming fix outside this change's scope.

**Revised conclusion**: the capability gap this design originally worried about (DEPENDENCY-CAPABILITY-
GUARD-01, section 12 below) **does not exist** — no new model or dependency needs to be acquired.
The real remaining work is operational: start the existing sidecar, verify it actually loads and
scores correctly, and wire its URL into `.env` so `canonical-rerank-executor.ts` stops silently
falling back. This changes `RERANK-SHADOW-01` in tasks.md from an acquisition task into a
verification task — see that file for the corrected task.

**Candidate purpose-trained cross-encoders** (verified against their own model cards):
- **mxbai-rerank-base-v2** (Mixedbread) — Qwen2-based, ~0.5B params, exposed via SentenceTransformers'
  `CrossEncoder` interface. This is what the existing sidecar already targets — confirmed real, not
  aspirational, per the correction above.
- **Qwen3-Reranker-{0.6B,4B,8B}** (Qwen) — purpose-trained for reranking specifically (not repurposed
  from a generative model), the 0.6B variant supports 32K context and 100 languages, and Qwen's own
  reference implementation reads the final constrained yes/no token logits and normalizes them into
  a relevance score. Also SentenceTransformers `CrossEncoder`-compatible. Not currently wired in this
  repo — recorded as a possible future challenger to mxbai-rerank-base-v2, not a replacement need.

## 2. Ornith is not a reranker — it's a generative agentic model that *can* approximate one

Ornith 1.5 9B is confirmed **Qwen3.5-based** (`model_type: qwen3_5`, `Qwen3_5ForConditionalGeneration`
— not plain Qwen3), a 32-layer text stack alternating three linear-attention layers with one full
attention layer, 4096 hidden size, plus a 27-layer/1152-hidden/4096-output Qwen3.5 vision encoder.
It was optimized for agentic coding and general reasoning, not ranking. Its BF16 checkpoint is ~19GB
— orders of magnitude heavier per-candidate than EmbeddingGemma or a 0.6B dedicated reranker
(`O(N)` full 9B forward passes vs `O(1)` embedding + cheap similarity for EmbeddingGemma).

It CAN implement the same "constrained yes/no logit" scoring mechanism Qwen3-Reranker uses natively
(feed `Instruction: judge relevance. Query: ... Document: ...` and read yes/no logits) — but same
mechanism does not mean same quality, since it was never trained for this task. Where Ornith is
plausibly genuinely useful is **reasoning-based promotion on hard cases a pure similarity/lexical
signal can't resolve** — e.g. "candidate A mentions CAGRA 14 times; candidate B contains
`selectSemanticExecutor` and is the actual control-flow owner" is a judgment call a bi-encoder or
even a purpose-trained reranker may get wrong, but an LLM with code-reasoning capability might get
right. It should be evaluated as a **judge for hard cases only**, not as a wholesale reranker
replacement — see the `ORNITH-RERANK-SHADOW-01` proof gate in `specs/`.

Because Ornith is a VLM, it is also the only component in this stack that could eventually rank
non-text evidence (screenshots, architecture diagrams, UI evidence) against a multimodal query —
EmbeddingGemma is text-only. Not in scope for this change; recorded for later.

## 3. The revised pipeline (frozen stages, gated additions)

```
100K corpus (frozen)
  -> EmbeddingGemma semantic_768 [FROZEN — bi-encoder, first-stage retrieval]
  -> Top 50-100 via RRF (lexical + structural + dense) [EXISTING — combineRRFLanes]
  -> Top 20 via cross-encoder rerank [NEW PLANE — not yet built, gap #1 above]
  -> Top 8-12 via optional Ornith judge (hard cases only) [NEW, proof-gated — ORNITH-RERANK-SHADOW-01]
  -> batch LangExtract grounded evidence extraction [NEW PLANE — CandidateEvidenceCardV1]
  -> ACE ContextManifest assembly [EXISTING, extended with budget-optimization contract — deferred]
  -> Ornith synthesis (decode) [EXISTING, unchanged]
```

Two "frozen" markers matter: EmbeddingGemma's role never changes in this design (first-stage
retrieval, clustering, helper-routing, classification features — never pairwise scoring), and the
existing RRF fusion stage is untouched by this change (see `parent-atlas-retrieval-fusion-reachability`
for that work).

## 4. `HelperCardV1` — reusing EmbeddingGemma as a pre-LLM capability router

EmbeddingGemma was explicitly trained with separate prompts for code retrieval, classification,
clustering, and other tasks — this is a legitimate way to reuse the same model family for routing
without inventing a second embedding lane. The pattern: register each non-LLM "helper" capability
(ast-grep owner-finder, ts-morph symbol resolver, Postgres FTS search, Qdrant semantic search, graph
neighborhood expansion, web search, migration auditor, test finder, etc.) as a `HelperCardV1`, embed
each card's `capabilities`/`supportedTaskFamilies` text once via EmbeddingGemma's classification/code
retrieval prompt mode, and route an incoming query to the closest-matching helper cards by cosine
similarity — before any LLM call. This directly explains, incidentally, "why CAGRA isn't being
selected": if a query about CAGRA selection routes to a helper card with weak/no coverage of that
capability, no downstream retrieval stage will surface it regardless of ranking quality.

```typescript
interface HelperCardV1 {
  helperId: string;
  capabilities: string;
  supportedTaskFamilies: string[];
  invocationCostClass: 'CHEAP' | 'MEDIUM' | 'EXPENSIVE';
  evidenceRequirements: string[];
  semantic768Ref: string;   // pointer to the precomputed EmbeddingGemma vector for this card
  revision: string;
}
```

See `specs/ace-helper-card-routing/spec.md` for the formal contract.

## 5. `StructuralFactV1` — Tree-sitter as an offline primitive, not a per-request cost

Tree-sitter is an incremental parser designed to update syntax trees efficiently as files change,
with queries constrainable to byte/row ranges — it is not designed to be re-invoked from scratch
against a whole repository per request. If an AST stage in this repo currently takes ~20 minutes,
that is a whole-repository materialization (Graphify) job being invoked where a bounded, incremental
query should run instead. Split explicitly:

- **Offline (incremental indexing)**: changed file -> Tree-sitter parse -> AST/CST/symbols/facts ->
  Postgres. This is where the existing 20-minute `ast-grep-symbol-extraction.mjs` sequential loop
  (already flagged in CLAUDE.md's "Key Lessons" as needing CPU-parallelism, not GPU) belongs.
- **Query-time (per-request)**: known file/symbol cohort -> ast-grep/Tree-sitter query, bounded
  subset, millisecond-ish latency. Never a full reparse.

Tree-sitter officially supports Python, Node, Go, and Rust bindings. The recommended split: Node/TS
for the live app query path (already the natural fit for this repo's stack), Python for batch
NLP/RAPIDS research jobs (already the existing miniforge-nlp-sidecar's lane), Rust reserved for a
future performance-sensitive structural helper if profiling ever justifies it — but **all
implementations emit one shared schema**, so a language binding is an `ADAPTER`
(per `runtime-ownership-registry.json`'s vocabulary) around the same structural-truth contract, never
a second owner:

```typescript
interface StructuralFactV1 {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  nodeType: string;
  startByte: number;
  endByte: number;
  astPath: string;
  symbolVersionId: string;
  fact: 'DECLARES' | 'CALLS' | 'IMPORTS' | 'EXPORTS' | 'IMPLEMENTS' | 'EXTENDS' | 'RETURNS' | 'PARAMETER_OF' | 'TYPE_OF';
  targetRef: string;
  parserRevision: string;
}
```

Also recorded: if this repo has a component still named a "tree-sitter chunker" that actually does
fixed-window text chunking without calling the real parser, it should be renamed (e.g. "text-window
chunker") to avoid it being mistaken for structural truth. **Not verified this session** which
specific file (if any) has this naming mismatch — flagged for a future audit, not chased here.

## 6. Lane ownership table (frozen)

| Lane | Main owner | Typical operation |
|---|---|---|
| Exact | `rg`, canonical metadata | symbol/path/literal match |
| Lexical | PostgreSQL FTS/trigram | keyword search |
| Structural | Tree-sitter/ast-grep | AST/CST pattern match |
| TS semantic | ts-morph | resolved type/symbol |
| Dense semantic | EmbeddingGemma 768d | conceptual similarity |
| Graph | NetworkX/cuGraph | relationship/multi-hop |
| Experience | ACE (`ActionGram`-style) | prior successful workflow recall |

`LangExtract` sits after source promotion, for grounded semantic extraction (section 8) — not a
retrieval lane itself.

## 7. Transport planes — recorded, not scheduled

gRPC / Arrow IPC / Arrow Flight / Arrow mmap / CUDA IPC / DLPack are each legitimate at a specific
boundary, but should not become four transports for every request:

- **Control plane (gRPC/protobuf, CPU)**: query filters, IDs, revisions, checksums, method
  selection, artifact handles, health/capabilities. Small structured messages only.
- **Data plane, cross-process (Apache Arrow IPC / Arrow Flight)**: moving large candidate
  vector/feature batches between processes. Arrow Flight is built on gRPC + Arrow IPC streams and
  avoids ordinary Protobuf copy overhead for this specific case — the fit for
  `SearchCandidates(request: protobuf control, response: Flight ticket -> Arrow RecordBatch stream)`
  with a schema like `{candidateOrdinal: uint32, packetKey: string, score: float32, semantic768:
  fixed_size_list<768>, pageRank: float32, featureMask: uint32}`, instead of a custom gRPC
  float-array protocol.
- **Cold/warm artifacts, same host (Arrow file IPC + mmap)**: Arrow's file IPC format supports
  random access and is well-suited to memory mapping — for frozen artifacts like
  `CandidateOrdinalMap`, `semantic_768` matrix snapshots, feature-tensor/PCA/SVD matrices, centroid
  membership, graph ordinals, evaluation cohorts. Multiple processes mmap the same file with zero
  JSON parsing of hundreds of MB. PyTorch's `torch.frombuffer` can construct a tensor directly over
  such a buffer without copying.
- **GPU data plane, same host (CUDA IPC / DLPack)**: same-machine GPU-to-GPU sharing between
  processes (e.g. a RAPIDS process handing a candidate matrix to a PyTorch process via a CUDA IPC
  handle, or Arrow's own CUDA-buffer + IPC-handle support). For in-process interop (PyTorch/cuDF in
  the same process), DLPack (`torch.from_dlpack`) is simpler than CUDA IPC.

**Recommended escalation order if this is ever built**: Arrow IPC (CPU) -> Arrow mmap -> pinned host
memory -> CUDA IPC, benchmarking each rather than assuming the "best" transport is the right first
implementation. **Not scheduled in this change** — no current bottleneck in this repo has been shown
to need any of these beyond what already exists (existing gRPC embedding/retrieval clients, existing
Qdrant/Postgres access patterns).

## 8. `CandidateEvidenceCardV1` + batch LangExtract — grounded structure, not another rerank

A cross-encoder reranker answers "how relevant is candidate X to query Q" (a scalar). LangExtract
answers "what does candidate X actually contain, grounded to source spans" — symbols, APIs, tests,
constraints, facts, each traceable back to a specific span rather than a free-form summary.
LangExtract's own design already supports chunk batching, parallel workers, multiple extraction
passes, and custom/OpenAI-compatible providers (so it can point at local llama-server/Ornith instead
of requiring Gemini or Ollama).

**Critical ordering constraint**: batch LangExtract runs on the top 20-30 post-RRF, post-rerank
candidates — never on the full 100K corpus. Recommended starting point: ~20 candidates, 4-8 parallel
extraction workers, bounded candidate-text budget — not 20 simultaneous generations saturating an
8GB GPU. This is about token economics, not GPU saturation.

```typescript
interface CandidateEvidenceCardV1 {
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  retrieval: { lexicalRank: number; structuralRank: number; semanticRank: number; graphRank: number; rrfScore: number; crossRankScore: number };
  extracted: { symbols: string[]; apis: string[]; tests: string[]; constraints: string[]; groundedFacts: GroundedFactV1[] };
  tokenCost: number;
  evidenceRefs: string[];
  extractionRevision: string;
  checksum: string;
}
```

Stage ownership becomes explicit: cross-encoder SCORES, LangExtract STRUCTURES/GROUNDS, Ornith
REASONS/SYNTHESIZES. See `specs/ace-candidate-evidence-card/spec.md`.

**Prompt-caching opportunity**: LangExtract requests for different candidates can share a near-
identical stable prefix (system instructions, schema, examples) with only the per-candidate suffix
varying. `llama-server`'s existing `cache_prompt`/`cache_reuse` behavior (already used in this repo
per the CANONICAL LLAMA-SERVER STARTUP CONTRACT) reuses the common evaluated prefix and only
evaluates the differing suffix — this is exactly where a stable-prefix-first extraction-batch design
pays off. Recorded as a follow-on optimization once `CandidateEvidenceCardV1` extraction is proven
useful; not gated in this change's proof requirement.

## 9. BitFrost vs KV cache vs token cache — three distinct caches, not one

Explicitly recorded to prevent future conflation (a documented risk in this repo — see CLAUDE.md's
"ACE ... GPU-MINI-FABRIC-01" and BitFrost sections, which already draw a similar boundary for
residency vs identity):

- **BitFrost**: hot evidence *object* cache (packet/candidate metadata), never KV tensors, hidden
  states, or DeltaNet recurrent state. A cache *descriptor* only —
  `{promptPlanChecksum, stablePrefixChecksum, tokenCount, modelRevision, promptTemplateRevision,
  cacheEligible}` — never the actual model cache itself.
- **llama-server's own KV/recurrent cache**: owns the actual evaluated-model-prefix state. BitFrost
  tells ACE "this prefix is hot"; llama-server is the only thing that actually holds the tensor
  state.
- **A new token cache** (recorded, not built in this change): for immutable packet source fragments,
  caching `{contentHash, tokenizerRevision, tokenIds, tokenCount}` so `ContextManifest` assembly can
  reason about actual token counts without repeatedly re-tokenizing every candidate on every request.

Resulting three-tier hierarchy: L0 packet metadata (BitFrost) -> L1 tokenized evidence (new token
cache) -> L2 evaluated prefix (llama-server KV/recurrent cache). Recorded as a target architecture;
no code changes to BitFrost or llama-server caching in this change.

## 10. `ContextSegmentV1` — context assembly as a bounded-optimization problem (deferred)

Recorded as a good next step but explicitly **deferred, not specced**, since it depends on evidence
from `CandidateEvidenceCardV1` and stable-prefix receipting landing first:

```typescript
interface ContextSegmentV1 {
  evidenceRef: string;
  role: 'STABLE' | 'SEMI_STABLE' | 'VOLATILE';
  importance: number;
  tokenCost: number;
  redundancyGroup: string;
  stablePrefixEligible: boolean;
}
```

The framing: `maximize(evidence utility) subject to (tokenCost <= promptBudget)`, rather than
blindly taking top-K. Not gated or scheduled here.

## 11. Tang-style low-rank helper recommendation, RandomForest/XGBoost classifier (deferred)

Recorded as a promising future direction, explicitly **not started**: a `FeatureTensor` (~24-48
values: presence-masked routing signals) feeding a Random Forest / XGBoost baseline (`should we run
AST? semantic? graph? web search? extraction? rerank?` — a capability mask) plus a Tang-inspired
low-rank task-helper utility matrix (learned from execution receipts: success, tests passed, tokens
saved, latency, repeated actions, rerank lift, Ornith context reduction) answering "which helper
specifically" (e.g. `ast-grep callsite search` vs `ts-morph symbol resolution`). The review is
explicit that this should not claim to implement Tang's actual low-rank-recommendation theorem
(which has specific ℓ2-sampling assumptions) — only the systems analogy (SVD-based helper ranking)
is being borrowed. **Not specced in this change** — this depends on having enough real execution
receipts to train against, which doesn't exist yet.

`HelperDagV1` (a deterministic rules/forest-based DAG compiler first; Ornith becomes a DAG
*challenger* only after the deterministic version has a baseline to beat) and `AgentWorkItemV1`
(projecting LangGraph checkpoint receipts into a Kanban-style view, explicitly NOT a second
persistence owner alongside LangGraph's own execution state machine) are recorded here for future
reference but are out of scope for this change entirely — no spec, no proof gate, no target files.
Revisit only after `ORNITH-RERANK-SHADOW-01` and `CandidateEvidenceCardV1` produce real usage data.

## 12. Capability-gap check (per `DEPENDENCY-CAPABILITY-GUARD-01`, root CLAUDE.md) — CORRECTED

**Original version of this section (below the correction) was written without first searching the
repo for existing reranker infrastructure — a direct violation of `DEPENDENCY-CAPABILITY-GUARD-01`'s
own first step ("Is capability already proven somewhere?"). Corrected 2026-09-06 after `find . -iname
"*rerank*"` surfaced ~50 existing reranker-related files.**

```
CAPABILITY: pairwise cross-encoder reranking (query, candidate) -> relevance scalar
CURRENT_OWNER: scripts/reranker-sidecar.py (real sentence_transformers.CrossEncoder over
               mixedbread-ai/mxbai-rerank-base-v2) + src/lib/server/retrieval/triton-reranker.ts
               (scoreBatchCrossEncoder, sends genuine [query,doc] pairs) +
               src/lib/server/retrieval/canonical-rerank-executor.ts (wiring + cache + fallback)
CURRENT_RUNTIME: NOT LIVE as of 2026-09-06 — live-checked via curl http://127.0.0.1:8099/health
                 (unreachable) and grep of .env (neither RERANKER_SIDECAR_URL nor TRITON_URL set)
AVAILABLE: YES — code, launcher (scripts/launch-reranker.ps1), and pinned deps
           (scripts/requirements-reranker.txt: torch, transformers, sentence-transformers, fastapi)
           all already exist in this repo. Not verified whether the Python environment the launcher
           expects currently has these packages actually installed (pip list not checked this
           session) — that is the one remaining unknown, not the code or the architecture.
REUSE_PATH_PROVEN: NOT YET — the code exists and is architecturally sound (real CrossEncoder API,
                   real pair-scoring protocol) but has not been run and observed actually loading
                   the model and returning real scores this session.
MINIMAL_NEW_DEPENDENCY: NONE. No new model, package, or owner needed.
NEW_OWNER_JUSTIFICATION: N/A — reuse, not a new owner.
```

**Conclusion: no dependency-acquisition decision is needed for RERANK-SHADOW-01.** The task is to
start the existing sidecar, confirm it actually loads and scores (a live proof, since "the code
looks right" is not the same as "it works" per this repo's own Agent Execution Integrity rules),
and wire the resulting URL into `.env`. See the corrected `RERANK-SHADOW-01` task in `tasks.md`.

<details>
<summary>Original (incorrect) version of this section, kept for the record per this repo's
"record findings even when wrong" discipline — do not use the numbers below</summary>

```
CAPABILITY: pairwise cross-encoder reranking (query, candidate) -> relevance scalar
CURRENT_OWNER: none — confirmed via the CLAUDE.md "13 unclassified reranker files" audit
               (2026-08-09) and this design doc's own section 1; all existing rerankers do
               lexical/AST/graph blend scoring, not joint pairwise cross-encoding
CURRENT_RUNTIME: none
AVAILABLE: not installed — neither sentence-transformers CrossEncoder, mxbai-rerank-base-v2, nor
           Qwen3-Reranker-0.6B weights are present in this repo as of 2026-09-06
REUSE_PATH_PROVEN: N/A — no existing owner to reuse
MINIMAL_NEW_DEPENDENCY: a single small (0.6B-class) purpose-trained reranker checkpoint, run via
                        existing llama-server/GGUF infrastructure if a GGUF conversion exists, or a
                        small dedicated Python sidecar (matching the existing miniforge-nlp-sidecar
                        pattern) otherwise
NEW_OWNER_JUSTIFICATION: this repo has zero cross-encoder rerankers today; adding exactly one is the
                         minimal fix for a real, previously-undocumented gap
```

This was wrong because the search step (`find . -iname "*rerank*"`, `grep -rl "CrossEncoder"`) that
would have surfaced the existing sidecar was never run before writing this section.
</details>

## 13. Three distinct relevance-score types (refines section 1, added 2026-09-06)

A follow-on review clarified exactly what mxbai-rerank-base-v2's "single relevance score" actually
is, and — more usefully for this repo — argued that it should be treated as one of three distinct
score types rather than the only source of pairwise relevance.

**What mxbai's scalar actually is**: a learned binary log-odds score. The model's chat template
presents `(query, document)` jointly and asks for a 0/1 relevance judgment; its SentenceTransformers
`LogitScore` config reads the final-position logits for token `"1"` (`z1`, relevant) and `"0"` (`z0`,
not relevant) and returns `score = z1 - z0` (equivalently `sigmoid(z1 - z0)` as a probability). It is
a single forward pass through the 24-layer Qwen2 backbone reading two logits — not a generated
explanation, and ranking by `z1-z0` is identical to ranking by its sigmoid, so raw calibration
doesn't matter for reranking, only relative ordering does.

**Three scores, not one, and they measure different things**:
- `SemanticSimilarityScoreV1` — `cosine(EmbeddingGemma(q), EmbeddingGemma(d))`. Cheapest (candidate
  vectors precomputed), but query and document tokens never directly attend to each other — a query
  token like "TurboVec" can't specifically attend to a document token like "combineRRFLanes" the way
  a jointly-processed pair can.
- `TextRelevanceScoreV1` — mxbai's `z1 - z0` (or an equivalent joint-pair scorer's output). Textual
  pairwise relevance, not engineering usefulness.
- `EngineeringUtilityScoreV1` — a Parent Atlas-specific learned score over a feature vector this
  repo already has evidence for and mxbai cannot see at all: EmbeddingGemma cosine, BM42/FTS scores,
  exact-symbol/ast-grep hits, call-edge distance, PageRank, community/domain fit, ActionGram-style
  prior workflow success, source-revision match, RRF score, etc. Starting model family: logistic
  regression -> Random Forest -> XGBoost/LambdaMART-style ranker -> small PyTorch MLP (matches this
  repo's own existing `RandomForest baseline, XGBoost challenger, PyTorch MLP challenger` guidance
  from the earlier architecture review, not a new preference). This score answers "is this
  engineeringly useful" (test coverage, validated reuse, graph distance), which a text-only
  cross-encoder structurally cannot measure.

These are not interchangeable — `TextRelevanceScoreV1` and `EngineeringUtilityScoreV1` can and will
disagree on some candidates (a syntactically similar-sounding candidate can score high on text
relevance while being architecturally wrong; a candidate with weak textual overlap can carry strong
engineering evidence like passing tests or PageRank authority). The right answer is not to average
them arbitrarily but to let a downstream ranking model or gate consume all three explicitly.

**A middle tier exists (late interaction / ColBERT-style)**, preserving per-token query/document
vectors and scoring `sum_i max_j (q_i . d_j)` instead of collapsing to one vector (bi-encoder) or
processing the whole pair jointly (cross-encoder). **Recorded but explicitly deferred** — not worth
adding before the mxbai shadow-comparison experiment (`ORNITH-RERANK-SHADOW-01`) closes.

**Cost-tiered admission — the ACE-aligned pattern**: don't cross-rank everything. Use the cheap
`SemanticSimilarityScoreV1`/`EngineeringUtilityScoreV1` signals first; only invoke the expensive
`TextRelevanceScoreV1` (mxbai) when the cheap scores leave an ambiguous margin among top candidates
(e.g. top-4 scores `.96/.91/.43/.31` -> accept without cross-ranking; `.72/.71/.70/.69` -> invoke
mxbai). This is the same "expensive computation admitted only when cheap evidence is insufficient"
principle already stated for `HelperCardV1` routing (section 4) and `CandidateEvidenceCardV1`
batching (section 8) — a third instance of the same repo-wide pattern, not a new one.

**Distillation is the most promising longer-term path, explicitly not started here**: run mxbai
offline as a teacher across many real Parent Atlas `(query, candidate)` pairs, then train a cheap
student (`ParentAtlasRankV1`, same RandomForest/XGBoost/MLP family as `EngineeringUtilityScoreV1`
above) to approximate mxbai's ordering from the existing feature fabric alone. Only genuinely
uncertain cases would then fall through to a live mxbai call. This is standard cross-encoder
knowledge distillation (SentenceTransformers documents training smaller models against teacher
logits) — recorded as a strong future direction, but it depends on `ORNITH-RERANK-SHADOW-01`
producing real labeled pairs first, so it cannot start before that gate closes.

**Not changing this change's scope**: `ORNITH-RERANK-SHADOW-01` (specs/ornith-rerank-shadow-proof)
already compares EmbeddingGemma-baseline vs. cross-encoder vs. Ornith-judge — this section refines
*what the cross-encoder score means* and adds `EngineeringUtilityScoreV1`/distillation as recorded
future directions, but does not add new gated tasks beyond `CONTRACT-05` below.

## 14. `AtlasGemmaRankV1` — a possible future mxbai challenger, NOT scheduled (recorded 2026-09-06)

A further review proposed transplanting Google's Gemma 4 E2B-IT **assistant** checkpoint (the small
draft/assistant model from a speculative-decoding pair, not a standalone LLM: 4 layers, 256 hidden,
4 attention heads/1 KV head, 3 sliding + 1 full attention layer, ~158MB BF16 — smaller in stored
weights than the Gemma3-270M class this repo elsewhere considers) as the seed for a custom, tiny,
Parent-Atlas-specific reranker. **This is real ML engineering — model surgery and distillation
training — not something to attempt in a documentation/contract pass.** Recorded here for a future
dedicated effort, explicitly not started, not scheduled, and not a task in this change's `tasks.md`.

**Why it isn't a drop-in replacement**: the released E2B assistant checkpoint's actual Transformers
implementation ignores raw `input_ids` — it requires `inputs_embeds` and shared KV state from a
*separate, full-size* Gemma target model (it's a speculative-decoding draft model, not a
freestanding one). Real "parameter stitching" surgery would be needed: copy token embeddings,
attention Q/O projections, RMSNorms, MLP gate/up/down, RoPE config, and the sliding/full attention
pattern; remove the target-embedding/target-KV dependency and MTP-drafting behavior; add the
model's own K/V projections, ordinary position handling, a KV cache, and a dedicated rank/span head.
One specific, easy-to-get-wrong step flagged by the review: the checkpoint has
`use_ordered_embeddings: true`, so the tokenizer-ID-to-embedding-row alignment must be explicitly
verified, not assumed preserved by a blind tensor copy.

**If ever pursued, the proposed shape avoids known anti-patterns already documented elsewhere in
this design doc**:
- **Explicit scalar rank head, not a generative yes/no head**: `RankHead: Linear(256, 1)` producing
  a `TextRelevanceScoreV1`-shaped scalar directly, avoiding vocabulary-logit computation on the hot
  reranking path. SentenceTransformers' `CrossEncoder` interface already supports both classifier-
  style and generative-LogitScore rankers, so this doesn't violate the reranker contract this
  design already commits to (section 1).
- **Reuses the existing feature fabric, doesn't compete with it**: feeds the model an
  `AtlasFeatureInputV1`-shaped view (`matrixSchema`, `matrixRevision`, `candidateOrdinal`, `values`,
  `presenceMask`, `evidenceRefs`) over this repo's *already-existing* candidate feature matrix
  (`RetrievalCandidateFeatureMatrixV1`/`CandidateFeatureMatrixV1`, per the retrieval-repair work) —
  explicitly NOT inventing a competing feature-matrix owner, matching this repo's own Duplication
  Prevention rule.
- **PCA/SVD scoped narrowly**: only for feature-activation compression / low-rank adapter
  initialization / redundant-channel discovery post-distillation — never for `semantic_768` itself,
  consistent with this repo's existing "SVD/Jacobian geometry stays diagnostic, never a canonical
  representation" position.
- **A typed routing head, not free-form DAG generation**: a `RouteHead` emitting one of a closed
  action set (`STOP | AST_EXPAND | CALL_GRAPH_EXPAND | ONTOLOGY_EXPAND | HYPEREDGE_EXPAND |
  SEMANTIC_EXPAND | LANGEXTRACT | MXBAI_ESCALATE | ORNITH_ESCALATE`) that deterministic code then
  executes — "tiny model emits a typed action, DAG builder validates and executes," not "tiny model
  emits arbitrary DAG JSON." This is the same admission-gate philosophy as section 13's cost-tiered
  escalation, generalized to a decision head instead of a numeric threshold.
- **JSON for control, Arrow/mmap/CUDA for bulk data** — the same control-plane/data-plane split
  already recorded in the parent `parent-atlas-retrieval-lineage-dag-convergence` change's own
  findings: `QueryPacketV1`/`CandidatePacketV1`/`RankObservationV1`/`EvidenceCardV1`/
  `DagDecisionV1`/`ExecutionReceiptV1` stay JSON/Zod-shaped control objects; `semantic_768`
  matrices, centroid matrices, and training batches never travel as JSON.

**If ever pursued, the promotion path mirrors `ORNITH-RERANK-SHADOW-01`'s own shadow-then-promote
discipline, not a direct swap**: Phase A — score-only shadow against mxbai (mxbai stays the
production owner; the challenger's scores are recorded, not served); Phase B — challenger primary
with mxbai as low-confidence fallback; Phase C — mxbai becomes the *escalation* oracle (called only
on disagreement/uncertainty), not a per-query cost. mxbai remains a legitimate long-term **teacher**
for a distilled student even independent of the Gemma-transplant idea specifically (this echoes
section 13's `EngineeringUtilityScoreV1` distillation discussion above — two different distillation
student proposals, same underlying pattern, not a duplicate idea).

**Not recorded as tasks**: `GEMMA4-RANK-STANDALONE-01` (the transplant surgery),
`GEMMA4-RANK-HEAD-01` (the rank head), `MXBAI-DISTILL-01` (distillation training),
`ATLAS-FEATURE-ADAPTER-01`, `LANGEXTRACT-SPAN-DISTILL-01`, `DAG-ROUTE-HEAD-01`, and
`ORT-TENSORRT-PARITY-01` were all named by the review as a proposed build sequence. None are added
to this change's `tasks.md` — each requires real training infrastructure, labeled data, and GPU time
this change's scope (contracts + a proof-gate harness) doesn't cover. Should this direction be
picked up later, it deserves its own OpenSpec change (e.g. `parent-atlas-gemma-micro-reranker`),
gated behind `ORNITH-RERANK-SHADOW-01` actually running first (there's no value in building a second
challenger before the first shadow comparison has real results to compare against).

**Existing GPU/training lane this must reuse, not duplicate**: this repo already has a dedicated
GPU proving-ground change, `parent-atlas-gpu-mini-fabric-01` (same `sveltekit-frontend/openspec/`
tree as this change), built specifically so no GPU phase — exact/approximate retrieval, graph
traversal, residency prediction, and eventually a cuTile challenger — runs without a CPU/vendor-exact
oracle next to it first. It already has a real, live, proven GPU/RAPIDS environment:
`/home/james/miniforge3/envs/atlas-rapids-cu13` on WSL2 (cuVS 26.06.00, cuGraph 26.06.00, cuDF
26.06.01, CuPy 14.1.1, PyTorch 2.13.0+cu130, RTX 3060 Ti, `CUDA available: True` — verified live, not
assumed, per that change's own design.md). That same design.md explicitly states: *"Do not install
or upgrade RAPIDS in this change — the existing `atlas-rapids-cu13` environment is [the one to use]."*
A future `parent-atlas-gemma-micro-reranker` change (or whatever training work is scoped later) MUST
target this same environment for any PyTorch-based training/distillation step, per
`DEPENDENCY-CAPABILITY-GUARD-01`'s reuse-before-new-owner rule — do not provision a second GPU/RAPIDS
environment, a second CUDA toolkit install, or a second Python ML environment for Gemma4 distillation
training. `parent-atlas-gpu-mini-fabric-01`'s own phase ladder (LEVEL 1 vendor primitives -> LEVEL 2
simple custom CUDA -> LEVEL 3 cuTile) and its "GPU accelerates tensor math, not everything" boundary
(root CLAUDE.md's GPU/CPU boundary section) both apply directly here: the actual small-model training
loop (PyTorch forward/backward on a 4-layer, 256-hidden model) is squarely GPU-appropriate tensor
work in that same environment; nothing about it needs a new infrastructure decision.
