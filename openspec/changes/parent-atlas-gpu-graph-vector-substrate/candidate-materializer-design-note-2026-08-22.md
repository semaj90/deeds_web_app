# Candidate materializer / GPU working-set design note (2026-08-22)

Status: **RAW DESIGN NOTE — captured verbatim from a pasted message, not yet reviewed,
not yet decided, not yet implemented.** This file exists so the content isn't lost; it
is not a proposal this session evaluated or endorsed. A future session should read this
alongside the rest of this change's `design.md` / `proposal.md` before acting on it.

Original formatting (line breaks, punctuation) was not preserved in the source paste;
light paragraph breaks have been added below purely for readability. No wording was
changed or summarized.

---

The transfer unit is not the GPU embedding tensor itself. For Parent Atlas, transfer
revisioned descriptors: ordinals, compact control bits — and leave the large
representation resident in whichever executor owns it.

The architecture:

- **CANONICAL REPRESENTATION**: `SemanticSnapshotV1` — `semantic_768` FP32, ordinal map,
  revisions, checksum. Lives in Qdrant / TurboVec / DiskANN — HNSW, persistent,
  compressed, CPU/disk, HNSW CPU, ANN challenger — producing ordinals + scores.
- **GPU MATERIALIZER**: fetch-only, selected rows, `N×768`, RTX 3060 Ti resident tensor
  matrix. cuVS / CAGRA / cuBLASLt / cuGraph — neighborhood, dense heads, graph heads,
  `DecisionVectorV1` — agentic traversal.

That is the key change: ANN systems identify candidates; the materializer reconstructs
the bounded GPU working set. TurboVec, DiskANN, HNSW, and CAGRA should not all store
another canonical representation — they occupy different memory/performance points.

Microsoft's current DiskANN has become a composable vector index library with
interchangeable storage providers; the project explicitly supports memory-tier choices,
disk-backed indexes, quantization, and filtered queries. The original DiskANN idea was
specifically about keeping very large graph indexes on SSD rather than requiring the
entire structure in RAM. HNSW is the opposite tradeoff: high-recall graph search with a
much larger RAM footprint. Microsoft's current vector-search guidance characterizes
HNSW as the max-recall option and DiskANN as the lower-memory, disk-oriented production
option.

TurboVec gives another useful point: compressed CPU-side retrieval based on
TurboQuant's data-oblivious quantization rather than a trained PQ codebook. Recent
TurboVec work reports substantially reduced memory relative to uncompressed HNSW while
retaining better recall than an IVF-PQ comparison — though that study is still limited
enough that TurboVec should stay a challenger rather than be declared the new
production owner. CAGRA is explicitly a GPU graph ANN; cuVS can accept row-major
host/device matrices and return neighbor indices plus distances, and supports FP16 and
INT8 index inputs for supported metrics.

So the executor taxonomy for `semantic_768` (logical lane):

- Qdrant HNSW — persistent, current production
- cuVS brute-force — exact GPU oracle
- CAGRA — GPU ANN
- TurboVec — compressed CPU challenger
- DiskANN — SSD-scale challenger

Five implementations, one vote.

## What should physically move between them

Prefer this — `CandidateSetV1`: `{snapshotRevision, representationRevision, ordinal,
score, executor, rank}` — not this: `{candidate_1: float[768], candidate_2: float[768],
candidate_3: float[768]}`.

Then the materializer does: ordinal → semantic mmap gather → rows `N×768` → FP16/FP32 →
GPU. Example: Qdrant → `{83, 991, 4217, 55}`; TurboVec → `{991, 83, 302, 55}`; Neo4j →
`{83, 114, 4217}`. Canonical dedup produces `{83, 991, 4217, 55, 302, 114}`. Only then
load `6×768` onto the GPU. That is much better than passing six vector copies through
Qdrant → Python → gRPC → Node → CUDA.

## Materializer as a real owner

`CandidateMaterializerV1`

- Input: `{snapshotRevision, ordinal[], requiredHeads, precision, deviceBudget}`
- Output: `GpuCandidateBatchV1`

```
type GpuCandidateBatchV1 = {
  snapshotRevision: string
  batchRevision: string
  ordinals: Uint32Array
  rows: number
  semanticDims: 768
  semanticPrecision: 'fp16' | 'fp32'
  heads: { semantic: boolean; structural: boolean; graph: boolean; execution: boolean; domain: boolean; program: boolean }
  deviceAllocationId: string
}
```

It should own gather/pad/pack, H2D, precision conversion, mask generation — but not
ranking policy.

## Padding

Yes, but only at kernel boundaries. Don't pad the canonical snapshot. Keep `N` = real
number of candidates, and materialize `logicalRows = N`, `physicalRows =
roundUp(N, tile)`. Example: `N=773`, `tile=32` → `physicalRows=800`. Then `validMask[800]`
contains `1×773, 0×27`. That is much safer than inventing fake candidates. So `Padder`
can just be a capability inside `CandidateMaterializerV1`, not another service.

## Decision flags — compact control, not full reasoning

Don't encode the entire agent instruction in seven bits. But a compact decision-flag
byte is useful:

```
DecisionFlagsV1: uint8
  bit 0: CONTINUE
  bit 1: EXACT_PROMOTE
  bit 2: EXPAND_GRAPH
  bit 3: FETCH_SOURCE
  bit 4: RUN_TEST
  bit 5: RETRIEVE_MORE
  bit 6: DEFER
  bit 7: ERROR
```

`0b00000000` = STOP, `0b00000001` = CONTINUE, `0b00000111` = CONTINUE|EXACT_PROMOTE|EXPAND_GRAPH.
Considerably better than a bare continue/stop bit, because a worker needs to know *why*
it is continuing. Keep the actual numerical parameters next to it:

```
TraversalInstructionV1:
  flags: u8
  actionKind: u8
  candidateStart: u32
  candidateCount: u32
  graphDepth: u8
  topK: u16
  headMask: u16
  confidence: fp16
  utility: fp16
  risk: fp16
  payloadOffset: u64
```

This starts to resemble the compact machine-state / instruction-byte analogy without
throwing away debuggability.

## Transport

gRPC shouldn't transmit raw device pointers. If the GPU owner and consumer are in the
same process, pass an allocation handle internally. If they're separate Linux
processes, CUDA has interprocess memory handles (`cudaIpcMemHandle_t`), but that's an
advanced, tightly-coupled local IPC mechanism, not something to expose as a general
agent protocol — NVIDIA defines the IPC handle specifically for sharing a device
allocation across processes. For a Windows/WSL split, don't make CUDA IPC the baseline.

Prefer gRPC: `batchRevision`, `artifactRef`, `ordinals`, requested operation,
parameters. GPU sidecar resolves artifact, materializes GPU tensor, computes, returns
scores/ordinals.

```protobuf
message CandidateBatchRef {
  string snapshot_revision = 1;
  string artifact_id = 2;
  repeated uint32 ordinal = 3;
  uint32 top_k = 4;
  uint32 head_mask = 5;
}
```

That's the right scale for Protobuf/gRPC. gRPC's own guidance recommends channel reuse
and says streaming is most useful for truly long-lived logical flows; it also warns
that streaming introduces load-balancing and complexity tradeoffs, and in Python
specifically streaming can add threads and be slower than unary RPCs. So: unary gRPC
for individual bounded GPU actions, server-stream for progress receipts if actually
needed — NOT per-float streaming.

## Physics metrics → typed feature tensor

Rather than "GPU tensor of embeddings," make it "GPU tensor of candidate state":

```
CandidateStateMatrixV1  — rows = canonical candidate i, columns grouped into heads:

SEMANTIC_HEAD:    query cosine, reranker score, semantic density, semantic novelty
STRUCTURAL_HEAD:  AST affinity, same parent, same symbol family, dependency distance, reference count
GRAPH_HEAD:       PageRank, personalized PageRank, community affinity, community boundary, degree, betweenness, k-core
EXECUTION_HEAD:   test-failure proximity, stack-trace proximity, last-failure count, repair success rate
DOMAIN_HEAD:      domain probability, OKF taxonomy affinity, ontology predicate match
MEMORY_HEAD:      recency, frequency, breadth, residency cost
PROGRAM_HEAD:     tool success probability, patch utility, expected latency, risk
```

Now the GPU has something much closer to the "physics" analogy: `X[N,F]` where each row
is the state of a candidate in a feature field. Then `W_semantic`, `W_structural`,
`W_graph`, `W_execution` give different projections — that's where cuBLASLt is
appropriate.

## KNN reuse across frozen revisions

Don't recompute KNN if it's already revision-valid. If `semanticSnapshotRevision=S42`
and `KnnNeighborhoodV1{revision: S42, K: 64, metric: cosine}` already exists, don't ask
another agent to run KNN again. Store `KnnGraphV1{ordinal, neighborOrdinal[K],
distance[K]}`. Traversal becomes `ordinal 83 → neighbors {83, 991, 17, 55, 4217}`. Can
be mmap'd or GPU-resident. CAGRA itself illustrates the same principle — it builds an
initial kNN graph then prunes it into a traversal structure. So Parent Atlas should
distinguish KNN COMPUTATION from KNN GRAPH TRAVERSAL. Once computed for a frozen
revision, the latter should be cheap.

## Leiden/Louvain sit one layer above KNN

Not replacements for ANN — they answer "what community is this node in" rather than
"which vectors are nearest this query." cuGraph currently supports both Leiden and
Louvain, and `nx-cugraph` exposes both through the NetworkX-compatible API. KNN graph →
Leiden → `communityId`. Query-time routing can say `candidate ordinal 83, community 17
→ expand same community first, boundary communities second`. cuGraph's Leiden
implementation returns a vertex→partition assignment plus global modularity, and
accepts a resolution parameter controlling community granularity — giving useful
derived features: `sameCommunity: bool`, `communityId: u32`, `communityModularity:
fp32`, `communityQueryAffinity: fp32`. Do not make `communityId` canonical identity.

## A* / Manhattan — only when there's a real goal state

A* needs graph edge cost + heuristic + goal — useful when Parent Atlas knows an actual
goal node state (e.g. current failing function → calls → service → repository →
adapter → database writer). Use A* to find lowest-cost causal path to a known target.
Manhattan distance only makes sense if coordinates have an interpretation where
`|x1-x2| + |y1-y2|` is a legitimate lower bound heuristic — a learned 4D manifold does
not automatically satisfy that property. So: don't default to "4D topology → Manhattan
→ A*." Instead: dependency-graph A* with a proven-admissible, graph-domain heuristic,
or Dijkstra/BFS when there's no such heuristic.

## Sliding window — on evidence, not representations

Don't slide windows over the embedding tensor for agent reasoning. Slide over
`EvidenceWindowV1` — current symbol, parent symbol, top callers, top callees, nearest
semantic neighbors, same-Leiden-community, failure-stack evidence, test evidence. Then
`window 0 = exact evidence → agent decision (CONTINUE?) → window 1 = expanded evidence`.
This is where the compact control byte earns its keep:
`TraversalReceiptV1{flags: CONTINUE|EXPAND_GRAPH, nextWindow: 2, graphDepth: 1, topK:
16}`. The model isn't carrying the whole graph — it's steering a deterministic evidence
traversal.

## Await/parameter-insert as state, not a blocked worker

`ActionState`: `READY | RUNNING | WAITING_INPUT | WAITING_DEPENDENCY | EXACT_PROMOTION |
VERIFYING | COMPLETED | FAILED`. If an agent needs a missing parameter:
`flags: DEFER, state: WAITING_INPUT, requiredField: sourceRevision`. Don't hold a Python
GPU worker alive waiting for the LLM — release the worker and resume the DAG once the
required value exists.

## OKF controls feature eligibility, not GPU layout directly

```
okf schema:
  domain: retrieval
  vector_feature_heads: [semantic, graph, execution]
  required_evidence: [semantic_768, graph_authority, source_revision]
  allowed_actions: [exact_promote, graph_expand, rerank]
```

The materializer converts that declarative schema into a `headMask`:

```
SEMANTIC   0b000000001
STRUCTURAL 0b000000010
GRAPH      0b000000100
EXECUTION  0b000001000
LEXICAL    0b000010000
MEMORY     0b000100000
PROGRAM    0b001000000
DOMAIN     0b010000000
DAG        0b100000000
```

Clean owner split: the OKF schema determines which feature groups are applicable;
`FeatureMatrixV1` determines their actual numeric representation.

## QLoRA batches consume promoted feature evidence sets, not ANN indexes

```
FrozenTrainingBatchV1:
  exampleId, domainClass, inputEvidenceRefs, selectedOrdinal,
  featureSnapshotRevision, target, reward, outcome
```

ANN systems build/retrieve the evidence set. Don't train on HNSW internal node id,
CAGRA graph position, Qdrant point ID, or TurboVec code offset — those are executor
artifacts. Train on derived, revisioned metrics with semantic meaning outside a specific
ANN implementation: semantic rank, semantic score, graph authority, community affinity,
execution utility, domain class.

## Three materializers to build

1. `CandidateMaterializerV1` — ordinals → semantic/structural/graph features → GPU matrix
2. `EvidenceMaterializerV1` — ordinals → symbolVersionIds → exact AST/LSP source/test evidence → `ContextManifest`
3. `InstructionMaterializerV1` — scores + policy → compact traversal instruction, emitting:

```
InstructionPacketV1:
  actionOrdinal: u32
  flags: u8
  action: u8
  headMask: u16
  primaryOrdinal: u32
  candidateOffset: u32
  candidateCount: u16
  topK: u16
  graphDepth: u8
  communityDepth: u8
  confidence: fp16
  risk: fp16
  utility: fp16
  parameterOffset: u64
  evidenceOffset: u64
```

This gets close to the NES-cartridge / machine-state / instruction-bytes analogy
without throwing away debuggability.

## Resulting execution loop

```
QUERY/ERROR → QueryIntentEnvelope
  → OKF domain classification → headMask
  → VECTOR RETRIEVAL / GRAPH ROUTING (Qdrant, TurboVec, DiskANN, Neo4j, cuGraph, cuVS exact, CAGRA, Leiden, Louvain)
  → CandidateSetV1 (ordinals)
  → CandidateMaterializer (GPU) → Candidate Matrix X[N,F] (semantic/topology/execution) → projections → rank → topK
  → InstructionMaterializer → TraversalInstructionV1 (flags + params)
  → CONTINUE/STOP: exact source, graph, test, promotion, expand execution
  → new evidence → next iteration
```

## Sizing note (8GB workstation)

For an 8GB workstation this is preferable to adding DiskANN immediately. The current
corpus is small enough that Qdrant + cuVS-exact-bounded + CAGRA + TurboVec
experimentation already cover the retrieval design space. DiskANN becomes compelling if
the persistent vector index footprint grows enough that RAM becomes the limiting
resource — Microsoft's own DiskANN work is specifically about exploiting lower storage
tiers for much larger indexes.

## Bottom line

The next implementation isn't another ANN backend. It's `CandidateSetV1` +
`CandidateMaterializerV1` + `GpuCandidateMatrixV1` + `TraversalInstructionV1` — the
missing bridge between the KNN/community/domain metrics already computed and an agent
that can deterministically decide what evidence to fetch or action to execute next.
