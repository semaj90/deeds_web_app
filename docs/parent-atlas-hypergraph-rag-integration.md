# Parent Atlas hypergraph RAG integration

This note records a clean-room integration of public HyperGraphRAG ideas into Parent Atlas. It does not vendor or copy the upstream implementation. Parent Atlas keeps its own canonical identity, revision, HyperRelationV1/HyperedgeV1, retrieval, graph, cache, and promotion contracts.

## External source checked

- LHRLAB/HyperGraphRAG, NeurIPS 2025, MIT licensed.
- Paper: HyperGraphRAG: Retrieval-Augmented Generation via Hypergraph-Structured Knowledge Representation.

The useful architectural ideas adopted are:

1. represent n-ary facts as explicit hyperedges/relation nodes rather than unrelated binary facts;
2. retrieve both entity-like and hyperedge-like semantic objects;
3. expand from retrieved entities/hyperedges to a bounded structural context;
4. preserve source text/evidence for generation rather than answering from graph identifiers alone.

## Parent Atlas ownership translation

| HyperGraphRAG idea | Parent Atlas owner |
| --- | --- |
| entity | existing canonicalId / packet / symbol / concept identity |
| hyperedge | HyperRelationV1 / HyperedgeV1 |
| entity vector storage | semantic_768 lane: Qdrant, cuVS exact, CAGRA executor |
| hyperedge vector storage | separate semantic_768 hyperrelation projection, never canonical truth |
| graph storage | Postgres canonical n-ary facts; Neo4j/cuGraph/NetworkX disposable projections |
| local/global/hybrid retrieval | bounded entity / relation / hybrid seed modes |
| related source chunks | EvidenceLocator/sourceRef/evidenceRefs and exact promotion |
| generation | ContextManifest -> DSPy/model -> validators -> receipt |

## Non-adopted upstream assumptions

Parent Atlas does not use display names as canonical entity identity, does not make vector-store IDs canonical, does not let an LLM-created hyperedge bypass exact evidence/promotion, and does not make one storage backend own both semantic truth and graph execution.

## Retrieval contract

`retrieveHypergraphContextV1()` operates only on a revision-qualified set of canonical HyperRelationV1 objects. Query seeds may come from semantic_768, lexical, AST, graph, or human input. The structural expansion:

```text
seed entity
   -> incident HyperRelationV1
   -> all role-qualified participants
   -> incident HyperRelationV1
   -> ... bounded by maxHops / entities / relations / evidence
```

No pairwise fact is invented during expansion. A ternary fact remains one ternary relation in the result.

## Hyperedge semantic lane

Parent Atlas may create a semantic representation for a hyperrelation using deterministic text assembled from:

```text
relationType
participant role + canonical label/summary
relation evidence summary
```

That representation uses the same canonical semantic dimension (`semantic_768`) but is a distinct artifact kind. Entity and hyperedge searches can therefore be fused as two producers inside a single higher-level hypergraph retrieval strategy without changing canonical identity.

Recommended candidate sequence:

```text
query
  -> entity semantic candidates (Qdrant/cuVS/CAGRA)
  -> hyperrelation semantic candidates (Qdrant/cuVS/CAGRA)
  -> canonical identity hydration
  -> bounded incidence expansion
  -> graph/PageRank/PPR/community features
  -> CrossEncoder
  -> exact evidence promotion
  -> ContextManifest
```

Executor count does not create extra fusion votes. Qdrant, cuVS exact and CAGRA remain executors for the same semantic lane.

## Graph projection

For ordinary graph algorithms, project canonical n-ary facts to an incidence/bipartite graph:

```text
entity A ----\
entity B ----- relation R
entity C ----/
```

PageRank/PPR/BFS can operate on this projection. Louvain/Leiden must use an explicitly defined suitable projection and their own parity/promotion receipts. The incidence projection remains disposable and reconstructable from canonical HyperRelationV1 records.

## Executor policy

- relational/tabular: DuckDB / Polars CPU oracle; cuDF challenger when scale warrants it;
- graph topology: Neo4j promoted owner, NetworkX oracle, cuGraph GPU challenger/executor after parity;
- dense vectors: Qdrant semantic service, cuVS exact oracle, CAGRA ANN challenger/executor;
- tensor transforms: PyTorch CPU numerical oracle, PyTorch CUDA/native CUDA challengers;
- semantic synthesis: DSPy/model only after exact evidence assembly;
- canonical truth: Postgres + immutable revisioned artifacts.

Runtime capability is separate from logical policy; an executor remains unavailable/quarantined until its capability and parity receipts pass.
