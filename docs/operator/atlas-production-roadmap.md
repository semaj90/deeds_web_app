# Atlas Production Roadmap: Parent & Programming Docs

This document serves as the durable operator guide for scaling, validating, and integrating the Legal-AI Atlas knowledge layers.

## Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)
- [ ] **Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance.
- [ ] **Summary Verification**: Inspect `docs/graph/repo-neo4j-graphrag-report.json` for synthesis drift.
- [ ] **Embedding Parity**: Ensure Qdrant `codebase_chunks_768` payloads contain accurate `sourceRefs`.

## Phase 4: Admin Copilot UI Integration
- [ ] **Provenance Display**: Show Qdrant `sourceRefs` and Neo4j graph paths in search results.
- [ ] **Cluster Visualization**: Integrate 4D manifold cluster aliases into the UI.
- [ ] **Direct Edit**: Enable operators to promote/demote synthesis trust tiers.

## Phase 5: Neo4j Enhanced Synthesis + Feature Command Atlas
- [ ] **Feature Registry**: Reconcile core architectural features with code-based evidence.
- [ ] **Command Mapping**: Bridge features to safe, allowlisted MCP commands.
- [ ] **Synthetic Evidence**: Generate concept cards for undocumented local patterns.
- [ ] **Feature Labeling**: Add app-file labels for `svelte-inspector` and `svelte-realtime` consolidation lanes and keep the feature registry aligned with file-family upgrades.
- [ ] **Dependency Chains**: Map shared static and dynamic import chains for app-file family upgrades before the later graph analysis pass.

## Phase 6: Programming Docs Atlas (External Lane)
### Governance & Guardrails
- **Official First**: Prioritize `*.llms.txt` from official domains.
- **Firecrawl Adapter**: Use structured scraping to prevent unbounded crawls.
- **Versioning**: All docs must be timestamped and versioned (e.g., SvelteKit 2.x).
- **Isolation**: Never mix external doc vectors into `codebase_chunks_768`.

### Execution (Stage 6A–H)
- [x] **6A: SvelteKit 2 Canary**: (COMPLETE) Normalization, manifest, and chunking verified.
- [ ] **6B: Tier 1 Expansion**: Drizzle, Svelte 5, TypeScript, Node.js, PostgreSQL.
- [ ] **6C: Tier 2 Systems**: CUDA, WebGPU, gRPC, QUIC.
- [ ] **6D: Qdrant Indexing**: Upsert chunks to `external_programming_docs_768`.
- [ ] **6E: Neo4j Projection**: Map `DocSource` -> `DocChunk` -> `API` concept graph.
- [ ] **6F: Gap Analysis**: Run `compare-external-docs-to-features.mjs`.
- [ ] **6G: MCP Integration**: Enable `trace.docs_search` and `trace.docs_compare_feature`.
- [ ] **6H: Web Fallback**: Implement `external_unverified` lane for search misses.

## Phase 7: Knowledge-Base Retrieval Flow
- [ ] **Multi-Lane Retrieval**: Combine Parent Atlas (Local) + Docs Atlas (External) + Web (Unverified).
- [ ] **Reranking**: Use PageRank and Feature Authority to boost canonical sources.
- [ ] **Synthesis**: Gemma4 generates answers only after `sourceRefs` are collected.

## Phase 8: Immediate Next Steps
1. **Validate Infrastructure**: `node scripts/atlas/validate-model-endpoints.mjs`.
2. **Neo4j Commit**: Run the write-enabled projection for SvelteKit canary data.
3. **Drizzle Crawl**: Start Tier 1 expansion with Drizzle ORM docs.
4. **Missing Links Audit**: Run `npm run audit:neo4j-missing-links` to surface orphaned graph nodes, unlabeled routes, and dynamic-import consolidation candidates.
5. **Label Upgrade**: Run the semantics report after the label registry refresh so `svelte-inspector` and `svelte-realtime` rows are visible in the atlas outputs.

## Phase 9: Codex Implementation Prompt
> "Implement the Programming Docs Atlas ingestion lane using Firecrawl-style scraping, llms.txt generation, Qdrant indexing, and Neo4j projection. Enforce trust tiers and sourceRefs requirements. Maintain strict isolation between codebase and external documentation vectors."
