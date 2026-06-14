# 📝 Parent Atlas PageIndex & Glyph Ingestion Plan (Phase D)

**Goal:** Implement and execute the ingestion contract for Tree Nodes, Glyphs, and updating the HyperRAG context with Phase D metadata to achieve a "Packet Identity OS" version of PageIndex + HyperRAG.

## Current Status
*   **Status**: 🚧 Planning / Blocked (Awaiting correct execution command)
*   **Last Action**: Attempted `npm run atlas:ingest:tree-nodes` which failed due to an undefined script.

## To Do Items
1.  **Implement Parent Atlas PageIndex + Glyph + HyperRAG ingestion contract:** This involves creating and populating new tables/scripts for tree nodes, glyph records, topology indexing, and summary layers. (Priority: High)
2.  **Execute the initial step: Tree node ingestion:** Run `npm run atlas:ingest:tree-nodes` (Requires correct command). (Priority: High)
3.  **Verify tree node ingestion success:** Run `npm run atlas:tree:audit` and confirm row count > 0. (Priority: Medium)
4.  **Enrich the canonical Qdrant cohort (Phase D):** Update source-of-truth points with `somCluster`, `glyphRecord`, `treeNodeKey`, etc., ensuring $\ge90\%$ coverage. (Priority: High)

## Key Technical Notes
*   **Data Focus**: Tree nodes, Glyphs, Topology Indexing, Summary Layers.
*   **Metadata Storage**: JSONB is the canonical source for searchable metadata.
*   **Execution Order**: 1. Tree node ingestion $\rightarrow$ 2. Canonical Qdrant cohort enrichment $\rightarrow$ 3. Feature card Phase D metadata $\rightarrow$ 4. Gate validation.

---
*Note: The next step requires defining or correcting the `npm run` command for tree node ingestion.*