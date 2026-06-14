# 📝 Parent Atlas PageIndex & Glyph Ingestion Plan (Phase D) - V2 Update

**Goal:** Implement and execute the ingestion contract for Tree Nodes, Glyphs, and updating the HyperRAG context with Phase D metadata to achieve a "Packet Identity OS" version of PageIndex + HyperRAG.

## Architectural Principles Confirmed
1.  **Canonical Spine Immutability**: `packet_key`, `source_ref`, `feature_id`, `feature_label`, and `metadata.identity.*` must remain the core, non-enrichable identity fields.
2.  **Separation of Concerns**: Enrichment data (`somCluster`, `karpathyBlend`, etc.) belongs in dedicated metadata namespaces (e.g., `metadata.topology.*`).
3.  **Retrieval Cascade**: The fixed L0 $\rightarrow$ L7 sequence is the operational truth: Redis $\rightarrow$ Qdrant $\rightarrow$ Postgres $\rightarrow$ TurboVec $\rightarrow$ Neo4j $\rightarrow$ Karpathy $\rightarrow$ XGBoost $\rightarrow$ Gemma4.

## To Do Items
1.  **Implement Parent Atlas PageIndex + Glyph + HyperRAG ingestion contract:** Creating and populating new tables/scripts for tree nodes, glyph records, topology indexing, and summary layers. (Priority: High)
2.  **Execute the initial step: Tree node ingestion:** Run `npm run atlas:ingest:tree-nodes` (Requires correct command). (Priority: High)
3.  **Verify tree node ingestion success:** Run `npm run atlas:tree:audit` and confirm row count > 0. (Priority: Medium)
4.  **Enrich the canonical Qdrant cohort (Phase D):** Update source-of-truth points with `somCluster`, `glyphRecord`, `treeNodeKey`, etc., ensuring $\ge90\%$ coverage. (Priority: High)

## Execution Blockers
*   The command `npm run atlas:ingest:tree-nodes` failed because the script is undefined in the current environment's `package.json`.

---
**Next Action Required**: Please provide the correct shell command or path to execute the tree node ingestion, and I will proceed with the execution step.