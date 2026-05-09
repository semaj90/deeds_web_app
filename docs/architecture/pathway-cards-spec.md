
# Pathway Cards: Architectural Specification

## Overview
Pathway Cards are first-class memory objects in the TRACE/Karpathy KAG architecture. They serve as a durable, semantically-addressable cache for the results of complex, multi-hop graph traversals and LLM-synthesized narratives.

Inspired by research into **GraphRAG**, **HippoRAG**, and **PathRAG**, Pathway Cards prevent the system from re-deriving expensive architectural or legal reasoning by "materializing" synthesized pathways into a long-term memory store.

## Data Structure
Pathway Cards are stored in the `graph_pathway_cards` table (PostgreSQL) and mirrored in Qdrant for semantic retrieval.

| Field | Description |
|-------|-------------|
| `path_key` | Unique hash identifying the query signature or relationship (e.g., `sha256(start:end:summary_head)`). |
| `summary` | The high-fidelity synthesized narrative (1-3 paragraphs) explaining the relationship. |
| `path_sequence` | Ordered list of stableKeys/node IDs comprising the structural path. |
| `citation_spans` | Provenance anchoring back to the original source evidence/code chunks. |
| `pagerank_score` | Authority score of the pathway based on its constituent nodes. |
| `embedding` | 768-dimensional vector for dense semantic retrieval. |
| `manifold4` | 4D SOM manifold coordinates for topological grounding. |

## Lifecycle
1. **Synthesis**: `graph.semantic_path_synthesis` performs a Neo4j traversal and hydrates nodes with Postgres summaries.
2. **Materialization**: `graph.materialize_pathway` encodes the synthesis into a Pathway Card and writes it to the database.
3. **Retrieval**: `kb.search_pathways` allows agents to retrieve pre-synthesized narratives directly before resorting to expensive multi-hop expansion.

## Integration in Staged Retrieval
Pathway Cards occupy the **Graph Expansion** stage of the retrieval pipeline:
1. Sparse Gate (Lexical)
2. Dense ANN (Candidate Generation)
3. Late Interaction (Reranking)
4. **Pathway Retrieval (Materialized Graph Memory)**
5. Structural Graph Expansion (Neo4j Fallback)
6. Agentic Synthesis (Gemma 4)

## Implementation Directives
- **Utility-First**: Pathway Cards should be optimized for downstream answer utility and citation faithfulness.
- **Topological Grounding**: Every card must be anchored to the 4D SOM manifold to ensure spatial consistency.
- **Durable Persistence**: Use PostgreSQL as the source of truth with JSONB for flexible payload metadata.
