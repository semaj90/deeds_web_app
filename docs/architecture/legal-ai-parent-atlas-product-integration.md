# Legal-AI Parent Atlas Product Integration

## Overview
The Parent Atlas provides the topological and graph-based foundation for retrieval-augmented generation (RAG) within the Deeds Web App. This document outlines how the infrastructure layers integrate into the user-facing product.

## Retrieval Provenance (Admin Copilot)
When a user performs a search in the Admin Copilot, the retrieval system surfaces "Provenance Metadata" to explain why a specific piece of evidence was selected.

### Surfaced Metadata:
1.  **Qdrant SourceRefs**: Direct links to the file chunks and line numbers where the evidence was found.
2.  **Neo4j Graph Paths**: Visual representation of how the evidence relates to the broader codebase or legal corpus (e.g., "File A imports File B which implements Feature C").
3.  **Cluster Aliases**: Human-readable names for codebase clusters (e.g., "Auth Layer", "Billing Service").
4.  **Engram Low-Hint Usage**: Indicates if the agent used a "low trust" pre-routing hint to narrow the search.
5.  **Trust Tier**:
    *   **T0**: Deterministic analysis (high trust).
    *   **T1**: Committed documentation (high trust).
    *   **T2**: LLM-enriched synthesis (medium trust).
    *   **T3**: Draft/Engram hints (low trust).
6.  **Lane Breakdown**: Which retrieval lane provided the result (e.g., `vector_lane`, `graph_lane`, `synthesis_lane`).

## CrimeAnalysisService: Plan-Only Mode
The CrimeAnalysisService uses the Atlas to perform deep investigative reasoning. In "Plan-Only Mode", it generates a structured investigative plan before committing to a full synthesis.

### Investigative Plan Structure:
-   **Facts**: Verified evidence found in the corpus.
-   **Allegations**: Claims made by parties in the case.
-   **Inferences**: Logical deductions made by the AI based on facts (marked as "AI Inference").
-   **Unknowns**: Gaps in the evidence that require further documentation.
-   **SourceRefs**: Every fact and allegation MUST be pinned to a source document.

## Implementation Status
- [x] Qdrant/Neo4j Sync
- [x] Parent Atlas Validation
- [ ] Admin Copilot UI Integration (Phase 4)
- [ ] Investigative Plan Visualization (Phase 4.2)
