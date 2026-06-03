# 🏗️ OpenCode Context Synthesis Loop Implementation Plan

This document outlines the multi-phase plan to transition the context handling from simple packet assembly to a full, self-optimizing, multi-layered retrieval loop. This process is designed to maximize context quality, reduce token wastage, and ensure the LLM receives the most relevant, pre-processed information.

**🚨 OPERATIONAL MODE: BUILD 🚨**
*   This plan assumes all preceding architectural decisions are approved.
*   All subsequent steps should be treated as high-priority development tasks.

---

## 🎯 Overarching Goal
Achieve a context pipeline that autonomously executes: **Retrieve $\rightarrow$ Synthesize $\rightarrow$ Summarize $\rightarrow$ Embed $\rightarrow$ Cache $\rightarrow$ Retrieve Better Next Time**.

## 🗺️ Phased Implementation Roadmap

### Phase 1: Foundational Layer Hardening (Caching & Search)
**Objective:** Establish robust, low-latency retrieval mechanisms (L1/L2 Cache and Hybrid Search).
**Tasks:**
1.  [ ] **Redis/Bifrost Cache Wrapper:** Define and implement a client wrapper (`RedisClient.ts`) to manage L1/L2 cache interactions for context state.
2.  [ ] **Qdrant Hybrid Search Integration:** Update the core search logic to query Qdrant using both dense (vector) and sparse (BM25) APIs.
3.  [ ] **Tooling Update:** Expose new/enhanced tools via `trace-mcp-tooling` to support `bifrost.checkHit` and `qdrant.hybridSearch`.
**Dependencies:** Schema definitions for cache objects.

### Phase 2: Semantic Enhancement & Grounding (Reranking & Extraction)
**Objective:** Improve chunk quality by reranking and structuring data before packet assembly.
**Tasks:**
1.  [ ] **BGE Reranker Integration:** Implement the FlagEmbedding/BGE logic to score chunks against the query and current context.
2.  [ ] **LangExtract Module:** Develop the entity extraction service to pull structured entities (e.g., legal IDs, roles) from raw text, ensuring source grounding.
3.  [ ] **Workflow:** Integrate the flow: `Query` $\rightarrow$ (Qdrant Search) $\rightarrow$ (BGE Rerank) $\rightarrow$ (LangExtract) $\rightarrow$ `AugmentedContext`.
**Dependencies:** Stable entity schema definitions.

### Phase 3: Context Assembly & State Preservation (The Packet)
**Objective:** Construct the final, maximally stable, and compact context packet for the LLM.
**Tasks:**
1.  [ ] **ACE Packet Refactor:** Update `context-assembler.ts` to consume the output of Phase 2.
2.  [ ] **Prefix Logic Enforcement:** Strictly enforce the stable prefix structure: `[STABLE SYSTEM PREFIX]`, `[STABLE REPO GUIDE]`, `[DYNAMIC ACE PACKET]`, `[USER QUERY]`.
3.  [ ] **State Injection:** Ensure `stablePrefixHash` and `kvPacketTaskId` are correctly derived and included in the final payload structure.
**Dependencies:** Success of Phase 1 & 2.

### Phase 4: Synthesis and Self-Correction (The Loop)
**Objective:** Orchestrate the entire process into a self-healing, closed loop.
**Tasks:**
1.  [ ] **Facade Update:** Update `openai-facade.ts` to manage the full flow:
    *   Call Phase 3 $\rightarrow$ Gemma4.
    *   Read Gemma4 output $\rightarrow$ Summarize $\rightarrow$ LangExtract validation.
2.  [ ] **Re-embedding & Caching:** Implement the final step: embed the summary/output, trigger re-ingestion into Qdrant, and cache the result in Redis.
**Dependencies:** Stable endpoints from all prior phases.

### Phase 5: Audit & Finalization
**Objective:** Verify the end-to-end pipeline resilience.
**Tasks:**
1.  [ ] **Comprehensive Audit:** Run a full audit across Drizzle, Qdrant, MCP, and Cache layers.
2.  [ ] **Integration Testing:** Develop specific integration tests to simulate and verify failure modes (e.g., Cache miss $\rightarrow$ Qdrant failure $\rightarrow$ Fallback).

---
**Next Action:** Please confirm the priority for the next development phase (Phase 1, 2, 3, or 4) to begin development.