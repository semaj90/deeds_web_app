## ADDED Requirements

### Requirement: Ornith is never promoted to a production reranking role without a passing shadow-comparison gate
The system SHALL NOT use Ornith (or any generative LLM) as the primary reranker for a general
candidate set unless the `ORNITH-RERANK-SHADOW-01` gate defined below has run and shown a measurable
quality lift over a purpose-trained cross-encoder reranker, specifically on the hard-case subset the
gate defines — not general-purpose reranking of the full candidate set.

#### Scenario: No production wiring precedes the gate
- **WHEN** this change is implemented
- **THEN** no production retrieval code path (e.g. `canonical-rerank-executor.ts` or any route calling it) is modified to call Ornith as a reranker

### Requirement: ORNITH-RERANK-SHADOW-01 fixture and comparison harness
The system SHALL define a frozen candidate-set fixture (fixed queries, fixed candidate pools, fixed
seed) and a comparison harness that scores each candidate under exactly these four methods without
mutating production data or indices:
1. EmbeddingGemma cosine-similarity baseline (bi-encoder, existing production embeddings)
2. A purpose-trained cross-encoder (e.g. mxbai-rerank-base-v2 or Qwen3-Reranker-0.6B)
3. Ornith as a constrained yes/no-logit judge
4. (optional, if resources allow) a second purpose-trained cross-encoder for cross-checking

#### Scenario: Fixture is frozen and reproducible
- **WHEN** the harness is run twice against the same fixture and same model versions
- **THEN** it produces identical rankings and identical metric values (deterministic scoring, fixed seed, no live-index drift)

#### Scenario: Harness touches no production data
- **WHEN** the harness runs
- **THEN** it reads from a frozen snapshot/fixture only and performs zero writes to Postgres, Qdrant, Redis, or Neo4j

### Requirement: Comparison reports the full required metric set
The harness SHALL report, per method, at minimum: Recall@K, MRR, NDCG@10, top-1 agreement with a
reference ranking, top-3 rank-set overlap, rank displacement, latency per candidate, token cost per
candidate (where applicable), and peak GPU memory bytes during scoring.

#### Scenario: Report includes all required metrics
- **WHEN** the harness completes a run
- **THEN** its output report includes a value for every metric listed above, for every method scored, or an explicit `NOT_APPLICABLE` marker with a stated reason (e.g. token cost is not applicable to a non-generative cosine-similarity baseline)

### Requirement: Promotion decision is evidence-scoped, not blanket
If the gate is passed, the system SHALL record the specific scope of the demonstrated lift (e.g.
"Ornith improves top-3 rank agreement by N% on the hard-case subset where the cross-encoder and
bi-encoder baselines disagree") rather than a blanket "Ornith is a better reranker" conclusion, per
this repo's Status Language rules (no claims beyond what the evidence shows).

#### Scenario: Passing result is scoped correctly
- **WHEN** the gate produces a result that justifies some production use of Ornith as a judge
- **THEN** the recorded conclusion names the specific candidate subset and metric(s) that improved, not a general claim that Ornith replaces the cross-encoder reranker
