# 📜 Phase 2 Context: System and Retrieval Stack Architecture (2026-07-30)

**Status**: ✅ Draft Specification | **Goal**: Define the canonical, auditable data flow and implement the governance layer.
**Prerequisite**: Successful completion and auto-fixing of the Phase 1 endpoint audit (`1-REVIEW.md`).

---

## TL;DR (Actionable Summary)
The core principle remains: **Postgres is the canonical source of truth**, and all other systems (Qdrant, Redis, Neo4j) are non-authoritative mirrors. The immediate focus for Phase 2 must be closing the **Governance Gap**: establishing the logical mapping in the Postgres registry tables (`atlas_representations`, `atlas_qdrant_collection_mappings`) to match the physical write path currently being used (`content` vector name). We must formalize the integration of **Mastra for workflow orchestration**, **tRPC/Zod for all API boundaries**, and **Qdrant's Query API** for all retrieval logic.

## 💡 Key Architectural Decisions & Findings (Phase 1 Audit)

### 1. Data Flow Governance (Source of Truth)
*   **Source of Truth**: `atlas_packets` table in Postgres.
*   **Data Flow**: Postgres $\to$ (Cache/Mirror) Redis $\to$ (Mirror) Qdrant $\to$ (Orchestrate) Mastra.
*   **New Gap Identified**: The physical write path to Qdrant is proceeding using the `content` vector name as a compatibility bridge. **CRITICAL BLOCKER**: The logical ownership layer (e.g., `atlas_representations` or `atlas_qdrant_collection_mappings`) has not been updated to reflect this, meaning the system is operating outside its defined canonical governance layers.

### 2. Core Components & Responsibilities
*   **OpenCode**: Remains the agent dispatch/tooling layer.
*   **Qdrant**: The canonical vector store for search/retrieval (must use named vectors and support RRF/multi-stage querying).
*   **Redis/Valkey**: Used *only* for transient state (caching query results, checkpoints, KAG neighbors, L1/L2 cache).
*   **Mastra/tRPC**: Mandatory for all service boundaries to enforce structured, validated state transitions (the workflow orchestrator).

### 3. Technical Implementation Focus (The "How")
*   **Vector Naming**: We must standardize on the `dense_768` logical contract, even if we temporarily write to `content`.
*   **Workflow Enforcement**: All retrieval calls must pass through a Mastra workflow layer that validates input/output schemas using Zod before calling the Qdrant client.
*   **Performance**: Use Qdrant's oversampling/rescoring mechanism only after a dedicated benchmark run against the initial 768-dim corpus to prove the performance/recall gain is worth the computational overhead.

## 🚀 Plan for Phase 2: Implementation and Verification
The primary goal is to close the **Governance Gap** and formalize the **Retrieval Pipeline**.

### Phase 2 Goals (To be added to ROADMAP.md):
1.  **Schema/Registry Update**: Implement and migrate the necessary tables (`atlas_representations`, etc.) to officially own the Qdrant data, moving from a temporary compatibility write to a canonical write.
2.  **Workflow Implementation**: Implement the first end-to-end flow through **Mastra**, which orchestrates:
    *   Zod-validated input $\to$ Qdrant API call (Prefetch + RRF) $\to$ Retrieval/Scoring $\to$ ACE Assembly $\to$ Cache Write.
3.  **Proof of Concept (POC)**: Run a limited, targeted backfill and validation using `scripts/atlas/` to prove the new schema/workflow integration.

### Next Steps (Actionable Items for the Team):
1.  **Review Schema Changes**: Focus on updating the Drizzle/Postgres migrations for the governance tables.
2.  **Implement Mastra Wrapper**: Build the primary `RetrievalService` layer using `tRPC` and `Zod` that wraps the `QdrantClient` calls.
3.  **Benchmark**: Run a controlled benchmark to compare the current raw data path against the proposed Mastra-guarded path.