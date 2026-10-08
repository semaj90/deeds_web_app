# HyperGraphRAG External-Document Fabric V1

Status: proposal/read-only integration design. This document does not authorize graph, cache, embedding, or database writes.

## Purpose

Align external-document ingestion, grounded n-ary facts, HyperGraphRAG-style expansion, graph algorithms, GPU executors, ACE context synthesis, and BitFrost residency without creating a second identity or graph authority.

The external HyperGraphRAG Neo4j implementation is treated only as a storage-adapter reference. Parent Atlas keeps its existing ownership boundaries.

## Canonical flow

```text
BeautifulSoup / Firecrawl
  -> normalized external document
  -> ExternalDoc ChunkRecord
  -> exact UTF-8 byte span
  -> Grounded NLP fact
  -> HypergraphFactProposalV1
  -> reviewed OntologyLinkedTupleV1
  -> admitted HyperedgeV1
  -> request-local incidence / graph projection
  -> NetworkX CPU oracle
  -> optional cuGraph/RAPIDS accelerator
  -> PageRank / CheiRank / Louvain / Leiden / k-core / betweenness
  -> CandidateFeatureMatrix / context ranking
  -> ACE packet/context projection
  -> BitFrost/Valkey residency/cache
  -> Parent Atlas query / MCP tool plan
```

## Authority boundaries

- BeautifulSoup / Firecrawl: acquisition only.
- Grounded NLP fact: source-backed observation only.
- OntologyLinkedTupleV1: reviewed ontology projection.
- HyperedgeV1: admitted n-ary graph fact; requires source/workspace/producer/graph revisions.
- Neo4j: graph mirror/projection, not identity authority.
- NetworkX: CPU graph-compute oracle.
- cuGraph/RAPIDS: accelerator only; must match a CPU oracle on the same immutable artifact.
- cuVS: dense/vector executor only; not a hypergraph fact owner.
- cuBLASLt / GEMM / cuTile: numeric execution kernels only.
- simdjson: JSON/JSONL metadata parser only.
- N-API: transport/binding layer only.
- ACE packets: bounded context/evidence projection.
- BitFrost/Valkey: cache/residency only.
- LSP/Tree-sitter/codebase-MCP: code-language evidence tools; language breadth does not grant canonical identity.
- OAK/OAKLIB: ontology lookup/resolution helper, not taxonomy truth.
- DeepSeek-style n-gram/Engram ideas: routing/memory challengers, not canonical evidence.

## Hypergraph proposal contract

`HypergraphFactProposalV1` is deliberately pre-admission:

- sourceRef
- sourceRevision
- workspaceRevision
- producerRevision
- exact UTF-8 evidence span
- evidence checksum
- predicate
- 2+ role-bearing participants
- ontology/concept candidates
- confidence
- graphRevision = null
- admissionState = PROPOSAL_ONLY
- canonicalAuthority = false
- writesPerformed = false

A proposal MUST NOT invent a graph revision. The existing graph owner supplies an admitted graph revision only after structural-edge/cohort gates pass.

## Compute plane

`HypergraphComputePlanV1` supports:

- NETWORKX_CPU
- CUGRAPH_RAPIDS
- CUVS_GPU
- CUBLASLT_GEMM
- CUTILE_CHALLENGER

Accelerator plans require immutable artifact references and a CPU oracle. The backend is an executor dimension, never a retrieval vote or identity dimension.

## Algorithm ownership

Reuse existing graph-analysis owners for:

- PageRank
- CheiRank
- Louvain
- Leiden
- k-core
- betweenness

Do not create HyperGraphRAG-local replacements for these algorithms. Request-local incidence may be materialized from admitted/proposal facts for evaluation, but persistent graph truth remains separately gated.

## Context / packet projection

Graph and hypergraph results may contribute derived features to ContextManifest/ACE:

- graph authority score
- reverse-flow/CheiRank score
- community membership
- n-ary evidence reachability
- bounded multi-hop path
- tool/capability relation
- citation/source relation

ACE and BitFrost may cache/select these derived projections, but neither can promote source facts or graph identity.

## Serialization and transport

Preferred division:

- JSON/JSONL metadata: standard JSON or proven simdjson fast path.
- compact control envelopes: JSON / MessagePack / protobuf as separately justified.
- large numeric matrices: Arrow IPC / mmap / pinned host memory / GPU-resident artifacts.
- TypeScript/Node control: N-API or gRPC/FastAPI commands.
- CUDA/cuGraph/cuVS/cuBLASLt/cuTile: downstream executors.

Never ship large feature matrices through JSON merely because the control plane is JSON-shaped.

## Taxonomy / glossary topics

The .okf master corpus should classify at least:

- hypergraph / n-ary fact
- ontology tuple
- incidence matrix
- PageRank / CheiRank
- Louvain / Leiden
- NetworkX / cuGraph
- cuVS / exact KNN / CAGRA
- CUDA / cuBLASLt / GEMM / cuTile
- simdjson / JSONL
- Arrow / mmap / MessagePack
- ACE / ContextManifest / BitFrost / Valkey
- MCP / tool registry / Viterbi
- LSP / Tree-sitter / code-language evidence
- OAK/OAKLIB / ontology
- n-gram / Engram / routing memory
- sourceRevision / workspaceRevision / representationRevision / producerRevision / graphRevision

## Promotion sequence

```text
OBSERVE
  -> exact source span
PROPOSE
  -> HypergraphFactProposalV1
VERIFY
  -> ontology/identity/revision/negative controls
ADMIT
  -> OntologyLinkedTupleV1 / HyperedgeV1
PROJECT
  -> NetworkX/cuGraph/cuVS/etc.
RANK
  -> graph/vector/features
SYNTHESIZE
  -> ACE ContextManifest
CACHE
  -> BitFrost/Valkey
EXECUTE
  -> bounded MCP/tool DAG
LEARN
  -> LearningOutcome / GEPA shadow
```

No accelerator, cache, projection, or prompt optimizer may skip the admission boundary.
