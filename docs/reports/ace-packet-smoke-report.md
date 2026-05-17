# ACE Packet Integration Smoke Report

## Execution Summary
- **Run ID**: `ace-smoke-1778984886861`
- **Query**: *"drizzle schema user_id mismatch"*
- **Timestamp**: 2026-05-17T02:28:06.861Z
- **Status**: 🟢 PASS

## Multi-Lane Retrieval Health
* **Lexical Lane**: PASS (8 hits)
* **Cluster Pivot Lane**: PASS (10 hits)
* **Vector ANN Lane**: PASS (5 hits)

## Policy Verification Checkpoints
1. **sourceRefs Preservation**: ✅ PASS (Every contextual hit preserves lineage trace).
2. **Qdrant 768d Dominance**: ✅ PASS (Canonical high-dim semantic ANN dominates score rank).
3. **Cluster Pivot Score Capping**: ✅ PASS (Pivot lane scores are strictly bounded below `0.12` cap).
4. **Memory Hygiene Compliance**: ✅ PASS (Strict verification that no forbidden fields like `hiddenThoughts` or `kv_cache` exist).
5. **Token Aware Packaging Bounds**: ✅ PASS (Blended packet sits safely within workstation context limits).

## Blended Contextual Hits

### Hit #1: sveltekit-frontend/src/lib/types/evidence.ts
- **Retrieved via**: `vector`
- **Blended Score**: `0.8800`
- **Providence Annotation**: *"Qdrant 768d ANN semantic match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/lib/types/evidence.ts","confidence":0.95}]`


### Hit #2: src/lib/server/ai/contextual-tools.ts
- **Retrieved via**: `vector`
- **Blended Score**: `0.8300`
- **Providence Annotation**: *"Qdrant 768d ANN semantic match"*
- **Source Citation**: `[{"type":"local_code","path":"src/lib/server/ai/contextual-tools.ts","confidence":0.95}]`


### Hit #3: src/lib/components/citations/CitationSaveForm.svelte
- **Retrieved via**: `vector`
- **Blended Score**: `0.7800`
- **Providence Annotation**: *"Qdrant 768d ANN semantic match"*
- **Source Citation**: `[{"type":"local_code","path":"src/lib/components/citations/CitationSaveForm.svelte","confidence":0.95}]`


### Hit #4: C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/types/svelte5-api-types.d.ts
- **Retrieved via**: `vector`
- **Blended Score**: `0.7300`
- **Providence Annotation**: *"Qdrant 768d ANN semantic match"*
- **Source Citation**: `[{"type":"local_code","path":"C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/types/svelte5-api-types.d.ts","confidence":0.95}]`


### Hit #5: sveltekit-frontend/src/lib/components/cases/ContextualChatModal.svelte
- **Retrieved via**: `vector`
- **Blended Score**: `0.6800`
- **Providence Annotation**: *"Qdrant 768d ANN semantic match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/lib/components/cases/ContextualChatModal.svelte","confidence":0.95}]`


### Hit #6: sveltekit-frontend/src/LLMS.md
- **Retrieved via**: `lexical`
- **Blended Score**: `0.1500`
- **Providence Annotation**: *"Fast-AST lexical match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/LLMS.md","confidence":0.85}]`


### Hit #7: sveltekit-frontend/src/pgvector-search.ts
- **Retrieved via**: `lexical`
- **Blended Score**: `0.1500`
- **Providence Annotation**: *"Fast-AST lexical match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/pgvector-search.ts","confidence":0.85}]`


### Hit #8: sveltekit-frontend/src/workers\embedding-worker.ts
- **Retrieved via**: `lexical`
- **Blended Score**: `0.1500`
- **Providence Annotation**: *"Fast-AST lexical match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/workers\\embedding-worker.ts","confidence":0.85}]`


### Hit #9: sveltekit-frontend/src/mcp\trace-mcp-server.ts
- **Retrieved via**: `lexical`
- **Blended Score**: `0.1500`
- **Providence Annotation**: *"Fast-AST lexical match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/mcp\\trace-mcp-server.ts","confidence":0.85}]`


### Hit #10: sveltekit-frontend/src/types\pgvector-drizzle.d.ts
- **Retrieved via**: `lexical`
- **Blended Score**: `0.1500`
- **Providence Annotation**: *"Fast-AST lexical match"*
- **Source Citation**: `[{"type":"local_code","path":"sveltekit-frontend/src/types\\pgvector-drizzle.d.ts","confidence":0.85}]`


---
*Report generated automatically by the Antigravity developer agent.*
