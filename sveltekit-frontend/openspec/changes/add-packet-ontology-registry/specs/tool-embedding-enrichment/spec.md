## ADDED Requirements

### Requirement: Enriched tool embedding source
The system SHALL embed tool metadata using concatenated text: `${tool.name} ${tool.description} Input schema: ${JSON.stringify(tool.input_schema)} Output schema: ${JSON.stringify(tool.output_schema)} Examples: ${tool.examples.join('; ')} Domains: ${tool.domains.join(', ')} Limitations: ${tool.limitations || 'none'}` instead of summary-only embedding.

#### Scenario: Embedding context is rich
- **WHEN** a tool is embedded for indexing
- **THEN** the embedding text includes all fields: name, description, schemas, examples, domains, limitations (instead of just summary)

#### Scenario: Schema-aware queries work
- **WHEN** searching for "tools that take file paths as input"
- **THEN** the embedding of input_schema is strong enough that Qdrant returns tools with `input_schema.properties.filePath` or similar

#### Scenario: Output type matching works
- **WHEN** searching for "tools that return JSON"
- **THEN** the embedding of output_schema captures JSON structure and Qdrant finds tools with JSON output

### Requirement: Tool embedding dimension alignment
The system SHALL embed tools using the project canonical 384-dimensional embedding (via embeddinggemma:latest), consistent with codebase_chunk_index embeddings.

#### Scenario: Tool embeddings are 384-dim
- **WHEN** a tool is embedded and stored in Qdrant
- **THEN** the vector has exactly 384 dimensions (not 768, not 64)

#### Scenario: Tool embeddings and packet embeddings are compatible
- **WHEN** querying for similar packets and tools
- **THEN** both use 384-dim vectors and can be ranked together in RRF blend (same space)

### Requirement: Embedding regeneration script
The system SHALL provide a script (e.g., npm run atlas:phase10:tool-embeddings:regenerate) that regenerates embeddings for all tools in tool_registry using the enriched context.

#### Scenario: Regeneration runs to completion
- **WHEN** running the regeneration script
- **THEN** all 6 canonical tools (trace.kag_search, atlas.topology_expand, neo4j.dependency_closure, qdrant.dense_search, rg.lexical_search, gemma4.explain_code) are re-embedded and stored in Qdrant

#### Scenario: Regeneration is idempotent
- **WHEN** running the script twice
- **THEN** both runs produce the same Qdrant point IDs and embeddings (deterministic re-embedding)

#### Scenario: Script provides dry-run
- **WHEN** running with --dry-run flag
- **THEN** the script previews the new embeddings without modifying Qdrant

### Requirement: Qdrant index update
The system SHALL ensure Qdrant HNSW index is updated after tool embedding regeneration.

#### Scenario: HNSW index is recomputed
- **WHEN** tool embeddings are updated in Qdrant
- **THEN** the HNSW index (m=16, ef_construction=64) is automatically recomputed by Qdrant

#### Scenario: Index quality is maintained
- **WHEN** running a test query after regeneration
- **THEN** Qdrant returns tools in relevant order (better recall for "tools with file path input" after enriched embedding)

### Requirement: Backward compatibility for embedding
Existing code that queries Qdrant for tool candidates SHALL continue to work without modification after regeneration.

#### Scenario: Tool search queries are unchanged
- **WHEN** Phase 9 code runs `await qdrant.search({ vector: queryEmbedding, collection: 'tool_registry' })`
- **THEN** the query returns candidates in the same format; no schema changes

#### Scenario: Embedding quality improves incrementally
- **WHEN** regenerated embeddings have richer context
- **THEN** Qdrant recall improves (more relevant candidates returned) without API changes
