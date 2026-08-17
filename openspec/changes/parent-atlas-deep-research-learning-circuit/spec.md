# Parent Atlas Deep Research Learning Circuit

## Goal

Build a local-first, revision-qualified deep-research and learning circuit on top of the Parent Atlas candidate/evidence fabric. The system researches by composing immutable artifacts and typed tools, verifies intermediate claims constraint-by-constraint, avoids repeating already-computed or already-rejected work, and only introduces learned ranking/policy components after deterministic replay/evaluation gates exist.

This change depends on `parent-atlas-candidate-feature-execution-fabric` and does not replace its identity, revision, artifact, feature, exact-promotion, or receipt contracts.

## Core invariant

```text
MODEL / AGENT
chooses what to investigate
        │
        ▼
TYPED RESEARCH DAG
        │
        ▼
DETERMINISTIC ACQUISITION / NORMALIZATION / IDENTITY
        │
        ▼
REVISIONED EVIDENCE + FEATURES
        │
        ▼
CONSTRAINT VERIFICATION
        │
        ▼
IMPROVEMENT STATE
        │
        ├── ACCEPT
        ├── REFINE
        └── RESTART
```

No learned component may bypass canonical evidence promotion or validators.

## Existing runtime ownership to preserve

Parent Atlas already has explicit runtime-owner selectors. This OpenSpec MUST extend those owners rather than create peer model services.

### Synthesis capability

Logical capability:

```text
llm.synthesis
```

Current executors:

- `llama-server` / Ornith-compatible OpenAI surface, canonical workstation path.
- LiteRT-LM, opt-in challenger path.

Future challengers:

- TensorRT-LLM generation backend only after model compatibility and RTX 3060 Ti proof.
- Browser LiteRT-LM WebGPU only as optional client/offline synthesis; never canonical evidence or durable memory.

### Embedding capability

Logical capability:

```text
embedding.semantic_768
```

Canonical representation remains EmbeddingGemma `semantic_768`.

Existing executor families include:

- ONNX Runtime execution path;
- dedicated llama.cpp/GGUF embedding server path;
- Ollama compatibility/fallback path.

The architecture MUST converge toward one canonical embedding client/interface and one model revision. Executor changes MUST NOT create multiple semantic votes or silently change representation identity.

Ollama MUST NOT be required to pull or own a duplicate canonical model artifact merely to provide fallback. If retained, it is a compatibility executor behind the same logical capability and representation revision.

### Browser capability

Browser inference is OPTIONAL and never authoritative. SvelteKit remains the authority/API boundary; Drizzle/Postgres remains server-side canonical state.

Allowed browser roles:

- OKF/query classification;
- lightweight embeddings/projections only after parity proof;
- routing/topology visualization;
- local similarity/highlighting;
- offline/degraded read-only assistance;
- optional LiteRT-LM text synthesis in explicit client mode.

Browser inference MUST NOT own:

- canonical CandidateOrdinal mapping;
- Postgres/Drizzle writes;
- Qdrant truth;
- exact promotion;
- artifact identity/checksums;
- workflow receipts;
- production training labels.

## Backend hierarchy: model artifact != executor

Every model-backed capability SHALL identify:

```text
ModelCapabilityV1
capabilityId
modelArtifactId
modelRevision
tokenizerRevision
representationRevision?
executor
executorRevision
precision
backendConfigHash
```

The same logical model/capability may be executed through ONNX Runtime, llama.cpp, LiteRT-LM, TensorRT-LLM, or another proven backend without changing canonical identity unless the numerical/representation contract changes.

`EXECUTOR != LANE != MODEL IDENTITY`.

## Inference backend policy

### ONNX Runtime

ONNX Runtime is the reference deployment path for stateless encoder/classifier components that already have proven ONNX exports.

Use for:

- EmbeddingGemma reference/challenger execution when export parity is proven;
- OKF domain classifier;
- small reranking/classification models;
- server-side batch inference;
- optional browser inference through ONNX Runtime Web/WebGPU for lightweight models.

Server and browser outputs MUST be checked for numerical/rank parity before the browser path is promoted.

### TensorRT-LLM

TensorRT-LLM is a challenger, not an assumed universal replacement.

Its encoder-only `encode()`/embeddings path may be benchmarked for supported encoder/classifier/embedding models with native request coalescing. Parent Atlas MUST NOT assume EmbeddingGemma or its Matryoshka dimensions are supported until an explicit compatibility fixture passes.

Generation and embedding modes remain separate services/executors even if both use TensorRT-LLM.

### NVIDIA Triton Inference Server

Triton Inference Server is an OPTIONAL serving/scheduling layer, not Parent Atlas orchestration truth.

Use only when measured concurrency shows a benefit from:

- dynamic batching;
- model instance scheduling;
- ONNX Runtime/TensorRT backend serving;
- queue latency control;
- unified metrics.

Do not add Triton merely to wrap one local model with one request at a time. First implement/measure batching inside the existing embedding/reranker service.

### LiteRT / LiteRT-LM

LiteRT-LM remains an opt-in synthesis challenger already represented by the dev runtime. LiteRT.js/LiteRT-LM JS is browser-only and MUST load an explicitly compatible web artifact.

Do not download a second browser LLM automatically. Browser LLM support is activated only when a compatible model artifact is already provisioned and the user explicitly selects client inference.

## Batch processing

Batching is a capability of an executor, not a new retrieval lane.

```text
EmbeddingBatchV1
requestId
modelCapabilityRevision
inputArtifactRefs[] | texts[]
inputCount
maxTokensPerItem
batchPolicyRevision
```

All batching policies MUST record:

```text
maxBatchSize
maxQueueDelayMs
maxQueueSize
sequenceLengthBuckets?
peakGpuBytes
latencyP50/P95
throughput
```

On the RTX 3060 Ti, ACE/GpuResidencyPlanV1 may lower batch size or defer the encoder/reranker when synthesis/KV residency would exceed the VRAM envelope.

## Local-first research topology

```text
USER QUERY
   │
   ▼
QueryIntentEnvelopeV1
   │
   ├── OKF domain posterior
   ├── entity/keyword extraction
   └── budget envelope
   │
   ▼
LOCAL ATLAS SEARCH
   │
   ├── B-tree identity / exact lookup
   ├── ripgrep exact lexical
   ├── Postgres GIN FTS baseline
   ├── pg_trgm GiST fuzzy
   ├── Qdrant semantic_768
   ├── cuVS exact / CAGRA executor parity
   ├── Tree-sitter / ast-grep
   └── graph / hypergraph expansion
   │
 enough evidence?
   │
   ├── yes → feature rank → exact promotion
   │
   └── no
        │
        ▼
ExternalResearchPlanV1
        │
        ├── SearXNG discovery
        ├── Firecrawl dynamic/crawl acquisition
        └── httpx + BeautifulSoup/lxml static fallback
        │
        ▼
RawExternalDocumentV1
        │
        ▼
NLP 8095 normalization / OKF classification
        │
        ▼
NormalizedExternalEvidenceV1
        │
        ├── Postgres FTS/metadata
        ├── Qdrant semantic_768 + BM25 challenger
        └── Arrow/mmap immutable body
        │
        ▼
ExternalEvidenceOrdinal[]
```

SearXNG answers `where might evidence exist?`.
Firecrawl/BeautifulSoup answer `what does the source contain?`.
NLP/OKF answers `what kind of evidence is it?`.
EmbeddingGemma/BM25 answer `which query is it relevant to?`.
Exact promotion answers `can Parent Atlas rely on this specific evidence revision?`.

## Ornith role

Ornith remains planner/synthesizer through typed tools. It MUST NOT directly own crawling, HTML parsing, vector indexes, or canonical evidence.

Typed tools include:

```text
search_local
search_web
fetch_url
crawl_site
read_artifact
find_in_artifact
search_code
expand_ast
expand_graph
promote_evidence
verify_claim
```

Tool outputs are artifact/receipt references, not uncontrolled raw state.

## Deep Agents integration boundary

Deep Agents is an OPTIONAL harness challenger for planning, filesystem-backed context management, subagent isolation, durable execution, and permissions.

Before integration:

1. inspect the selected Python environment;
2. record whether `deepagents` is installed;
3. if absent, create an install plan but do not mutate the canonical environment until dependency compatibility is checked;
4. pin the tested version in `DeepAgentsEnvironmentReceiptV1` only after a smoke test passes.

Deep Agents may consume Parent Atlas typed tools and artifact refs but MUST NOT own canonical identity, artifact hashes, exact promotion, validator outcomes, or BitFrost action identity.

## AREX-inspired two-loop controller

Parent Atlas adopts the architectural idea, not source code or model weights.

### Inner research loop

- search local evidence;
- search external providers when justified;
- fetch/crawl/read documents;
- normalize/classify/index evidence;
- retrieve/rerank candidates;
- construct provisional answer/action hypotheses.

### Outer verification loop

- enumerate claims/constraints;
- verify each against promoted evidence;
- preserve verified evidence;
- record rejected paths/reasons;
- identify unresolved constraints;
- decide `ACCEPT`, `REFINE`, or `RESTART`;
- emit the next bounded research objective.

## ResearchImprovementStateV1

```text
schema = atlas.research-improvement-state.v1
researchRunId
round
queryHash
revisionSetHash
verifiedClaims[]
unresolvedConstraints[]
rejectedPaths[]
currentCandidateArtifactRefs[]
nextActionHints[]
budgetRemaining
contextRevision
producerRevision
checksum
```

The state preserves provenance and never replaces exact evidence with unsupported natural-language summaries.

## Do-not-repeat-yourself control

Every action MUST have an ActionKey derived from:

```text
operation
normalized inputs
input artifact hashes
revision set
parameters hash
producer/tool revision
model revision when applicable
RNG seed when stochastic
```

Before execution:

1. BitFrost lookup `ActionKey -> ComputationArtifactV1`;
2. inspect prior deterministic failure artifact;
3. inspect rejected paths from improvement state;
4. acquire single-flight lease/fencing token when missing;
5. execute once;
6. persist success/failure receipt;
7. update improvement state.

Repeated unchanged work is classified as `REUSE`, `BLOCK_REPEAT`, or `RETRY_TRANSIENT`; never silent recompute.

## KeyStepReceiptV1

Decision-critical labels for later learning:

```text
EVIDENCE_ACQUIRED
CONSTRAINT_RESOLVED
PATH_REJECTED
COURSE_CORRECTED
CONTEXT_UPDATED
ARTIFACT_REUSED
DUPLICATE_ACTION_BLOCKED
EXACT_PROMOTION_SUCCEEDED
VALIDATOR_FAILED
VALIDATOR_PASSED
```

## Learning hierarchy

```text
L0 deterministic
identity / retrieval / artifacts / validators / replay

L1 unsupervised routing
cuML KMeans centroids

L2 supervised feature ranking
XGBoost LambdaMART / XGBRanker

L3 neural retrieval/reranking
PyTorch CrossEncoder / EmbeddingGemma challenger

L4 program optimization
DSPy + GEPA

L5 policy learning
TorchRL / step-aware RL experiments

L6 model-weight adaptation
QLoRA/adapters only from verified corpus
```

Each level requires a promotion receipt before the next may influence production routing.

## KMeans role

cuML KMeans is coarse routing/cache locality/centroid feature only. Record:

```text
algorithmRevision
nClusters
init
nInit
maxIter
tolerance
randomState
trainingSnapshotRevision
centroidChecksum
assignmentChecksum
inertia
fitDurationMs
peakGpuBytes
```

Cluster membership is not semantic truth or canonical identity.

## XGBoost learning-to-rank role

`XGBRanker` is the preferred first learned `CandidateFeatureRowV1 -> utility score` challenger because it consumes the existing feature matrix without changing `semantic_768`.

Training groups are query/task groups (`qid`). Labels come from verified evidence/execution outcomes. Initial objective is `rank:ndcg` unless evaluation proves another objective superior.

Potential features:

```text
semantic_relevance
lexical_relevance
ast_affinity
graph_authority
ppr
community_affinity
manifold4_similarity
okf_domain_affinity
cross_encoder_score
execution_utility
memory_utility
freshness
source_authority
```

## HyperparameterRegistryV1

No parameter is accepted merely because an LLM proposed it.

```text
parameterId
component
value
valueType
sourceClass:
  OFFICIAL_DEFAULT
  HARDWARE_PROFILE
  LOCAL_BENCHMARK
  VERIFIED_RECEIPT
  EXPERIMENT_PROPOSAL
sourceRef
applicabilityPredicate
confidence
introducedRevision
supersedes?
validationStatus
```

Selection order:

1. safety/contract bounds;
2. hardware constraints;
3. proven local benchmark winner;
4. verified historical receipt;
5. official upstream default;
6. experimental proposal.

LLM recommendations may create `EXPERIMENT_PROPOSAL` entries only.

## Reinforcement-learning stage

TorchRL is the preferred PyTorch-native research framework for first policy-learning experiments, but RL is gated until:

- `AgentTaskEnvV1` deterministic reset/replay;
- typed action space;
- immutable observations;
- validator-derived rewards;
- trajectory/action receipts;
- duplicate-action detection;
- held-out task-family split;
- deterministic/heuristic baseline;
- resource/termination constraints.

Reward shaping may include bounded credit for verified evidence acquisition, resolving an unresolved constraint, correct course correction, context-state improvement, and artifact reuse; penalties include repeated identical actions, stale evidence, unsupported claims, unnecessary mutation/tool calls/expansion, budget overflow, and regressions.

Longer trajectories MUST NOT become intrinsically more profitable.

## Evaluation splits

Never random-split candidate rows alone. Split by repository/workspace, chronological revision window, task family, canonical symbol lineage, external source/domain, and research-question family.

## Promotion metrics

Research:

- constraint satisfaction;
- evidence/citation support;
- unresolved constraints;
- repeated-action rate;
- artifact reuse rate;
- rounds/tool calls;
- latency/token cost;
- provenance retention.

Retrieval/ranking:

- Recall@20/100;
- MRR;
- nDCG@k;
- top-K overlap;
- Spearman rank parity;
- wrong-symbol/tree-node/source-revision rates;
- exact-promotion coverage.

Execution:

- compile/test success;
- validated task success;
- regression rate;
- hallucinated symbol/tool rate;
- mutation minimality;
- duplicate-action rate;
- budget compliance.

Learning:

- held-out before/after delta;
- calibration where applicable;
- reward-hacking indicators;
- trajectory-length distribution;
- cache-reuse delta;
- failure-type distribution.

## Production rule

A learned component or executor may influence production only when its artifact and evaluation receipt are revision-complete and it matches/beats the reference path without degrading canonical promotion, validator success, or safety/resource gates.
