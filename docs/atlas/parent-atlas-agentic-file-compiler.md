# Parent Atlas Agentic File Compiler

This tranche defines the contract boundary for turning a user file-edit request into a deterministic, revisioned workflow. It deliberately reuses the existing retrieval, context compiler, action/outbox persistence, hypergraph, and projection owners.

## Core invariants

1. Tree-sitter is structural truth; ast-grep is structural query/rewrite only.
2. `semantic_768` is canonical semantic representation.
3. Qdrant, cuVS exact, CAGRA, DiskANN/Vamana, and TurboVec are executors behind one semantic lane.
4. N-ary/hyperedge truth is distinct from bounded Neo4j/cuGraph projections.
5. Redis/BitFrost and model KV/prefix caches affect cost/latency, not relevance or canonical truth.
6. `AtlasWorkflowSpecV1` owns workflow meaning. Mastra JSON is a runtime dialect; Mastra snapshots are resumability state.
7. Postgres remains canonical identity/workflow/provenance/receipt authority.
8. The LLM may fill bounded synthesis slots; it does not own repository search, context admission, authorization, or direct filesystem writes.

## Resource tiers

- L0 GPU: active query vectors, hot CAGRA shard, candidate feature matrix, graph frontier, reranker tensors, active KV.
- L1 RAM/Redis: candidate ordinals, feature rows, context/prompt metadata, hot graph neighborhoods, BitFrost packets.
- L2 NVMe: DiskANN, Arrow/Parquet/mmap snapshots, cold semantic vectors, compiled prefill descriptors.
- L3 durable: Postgres, Qdrant, Neo4j projections, Git/source files, receipts.

## Mastra note

Current Mastra upstream exposes JSON-safe serialized step flow/graph structures and strict storable workflow serialization, while snapshots persist resumable execution state. Parent Atlas compiles to that runtime dialect but does not transfer canonical ownership to Mastra.
