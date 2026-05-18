# Deeds Web App: Platform Architecture & State Engine
> **Subsystem Spec**: SvelteKit 2 + Svelte 5 (Runes) + Drizzle + Qdrant + Neo4j + Redis Bifrost.

## 1. Svelte 5 Reactivity (Runes Engine)
The frontend is standardized strictly on Svelte 5 runes, abandoning legacy syntax:
*   Use `$state()` for reactive variables instead of `let`.
*   Use `$derived()` for computed expressions instead of `$:`.
*   Use `$props()` to handle incoming parameters instead of `export let`.
*   Use `onclick` and custom event handlers as standard functions instead of `on:click`.
*   Component slot composition is implemented via standard snippet patterns.

## 2. Relational Schema & Vector Storage Policy
*   **Database Host**: PostgreSQL running on port `5434` in local WSL2 Docker mesh.
*   **Identities Standard**: All tables normalize on the serial integer `users.id` PK to prevent UUID mismatch overload.
*   **pgvector Extension**: Implements `0.8.1` support with custom HNSW cosine similarity indexes.
*   **Dense Vectors**: Standardized on Gemma3-client (768 dimensions) for canonical codebase indexing, and compact GPU-cache (384 dimensions) for local telemetry.

## 3. Redis Bifrost Memory caching
*   **Caching Strategy**: Holds dynamic JSON and string entries with structured TTL policies.
*   **Key Namespaces**:
    *   `ace:packet:{runId}`: Hot contextual packet cache (1 hour expiration).
    *   `ace:cluster:{clusterId}`: Somatic community partition context (24 hour expiration).
    *   `ace:routing:temperature`: Contrastive softmax temperature scaling factor (Value: `5.0`).

## 4. Multi-Lane Topological Search
Retrieval routes through four distinct signal classifiers (Semantic, Lexical, Graph, and Trust Pressure):
1.  **Semantic Lane**: Dense ANN lookup via Qdrant `/collections/codebase_chunks_768`.
2.  **Lexical Lane**: RegEx-based index match using deep `rg` search matrix queries.
3.  **Graph Lane**: Somatic cluster PageRank traversal in Neo4j on port `7687`.
4.  **Trust Lane**: Evaluates prior synthesis feedback loop histories to adapt thresholds dynamically.
