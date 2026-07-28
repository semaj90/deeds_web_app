# Canonical Tool Catalog (Draft v1.0.0)
**Date**: 2026-07-27
**Status**: 🛠️ In Progress (Chunk 1/N)

---

## Chunk 1: Core System & General Purpose Tools
These tools manage the core workflow, context building, and general system operations, acting as the primary entry points for complex tasks.

**Implementation note**: The live MCP server at `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs` exposes the plain tool names below. The `atlas-tools_*` names are the documented contract / catalog aliases used elsewhere in the repo.

### 🛠️ `classify_intent` (`atlas-tools_classify_intent`)
*   **Purpose**: Classifies a user query into an intent (`repair`, `research`, `planning`) and domain, guiding the appropriate next action.
*   **Use Case**: Initial triage of any user request to determine the nature of the required action.
*   **Output**: Structured classification data (intent, domain, sub-domain).

### 🛠️ `build_agentic_rag_context` (`atlas-tools_build_agentic_rag_context`)
*   **Purpose**: Creates a compact, source-referenced context packet (ACE) from the raw query and supporting evidence. This is the primary mechanism for context-aware querying.
*   **Inputs**: `query` (The user's core question) and optional `domainFilter`.
*   **Output**: A ready-to-use, compact context blob for the LLM.

### 🛠️ `build_recommendation` (`atlas-tools_build_recommendation`)
*   **Purpose**: Synthesizes a structured, actionable recommendation (including `likely_cause`, `evidence`, `patch_targets`, etc.) based on classified intent and retrieved context.
*   **Dependency**: Must be called after a successful `classify_intent` and `build_agentic_rag_context`.
*   **Core Value**: Provides the "why" and "how" for the proposed fix/research.

### 🛠️ `record_outcome` (`atlas-tools_record_outcome`)
*   **Purpose**: Logs the outcome of a task or fix attempt to the persistent memory/audit ledger, creating graph relationships.
*   **Usage**: Mandatory call after any successful agent execution to maintain a record of the interaction.

### 🛠️ `find_dependencies`
*   **Purpose**: Finds dependency edges for a target file in the Atlas graph.

### 🛠️ `trace_database`
*   **Purpose**: Finds code paths that use a database table or query pattern.

### 🛠️ `trace_tool_chain`
*   **Purpose**: Traces the tool call chain for a named MCP or Atlas tool.

### 🛠️ `find_source_refs`
*   **Purpose**: Resolves source reference nodes for a file path or name pattern.

### 🛠️ `find_feature`
*   **Purpose**: Resolves feature nodes for a feature name pattern.

### 🛠️ `find_route`
*   **Purpose**: Resolves route nodes for a route path pattern.

---

## Chunk 2: Data Persistence & Retrieval Tools
These tools manage the interaction with external data stores and the physical act of retrieving or modifying data.

### 🛠️ `engram-embed_engram_embed`
*   **Purpose**: Generates high-dimensional embeddings (768-dim) for text chunks using `embeddinggemma:latest`.
*   **Action**: The core process for transforming raw text into searchable vector representations used across Qdrant, Redis, and other vector stores.

### 🛠️ `engram-embed_engram_bifrost_ingest`
*   **Purpose**: Upserts the embedded chunk into the L2 cache (BitFrost) and the Qdrant index.
*   **Data Flow**: Writes the chunk to Redis and updates the Qdrant record, ensuring low-latency retrieval.

### 🛠️ `record_outcome` (`atlas-tools_record_outcome`)
*   **Purpose**: Logs the outcome of a task or fix attempt to the persistent memory/audit ledger, creating graph relationships.
*   **Usage**: Mandatory call after any successful agent execution to maintain a record of the interaction.

*(Note: This is a placeholder for the actual Chunk 2 content)*
