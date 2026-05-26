# Indexed vs Untracked Local Atlas Memory Cards

Generated: 2026-05-26T23:39:03.441Z

## Summary
- cards: 99
- embedded cards: 99
- qdrant preview rows: 99
- feature gap rows: 8
- workspace gap cards: 90
- tracked gaps: 39
- untracked gaps: 51
- production_ready: 8
- active: 66
- candidate_prune: 25
- archive_to_deeds_lab: 0

## Coverage
- atlas overlay present: true
- live atlas contract: true
- indexed tracked matches: 11
- indexed refs: 2339
- feature keys: 4217

## Top Cards
- [production_ready] feature-gap:ace.packet_flow :: ace.packet_flow
  - sourceRefs: src/lib/server/ace/context-assembler.ts, src/lib/server/ace/context-cache-registry.ts, src/lib/server/ace/llm-context-cache.ts, src/lib/server/atlas/master-feature-map.ts, src/lib/server/ace/context-packet-budgeter.ts, src/lib/server/cache/ace-context-pack-cache.ts, docs/architecture/opencode-claude-mem-bridge.md, docs/operations/stack-audit-playbook.md
  - searchHints: rg -n -uu "ace.packet_flow" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "ace.packet_flow" --json | evidence:npm run memory:claude-mem:smoke | evidence:npm run memory:agent-observation:smoke
- [production_ready] feature-gap:cluster.cards :: cluster.cards
  - sourceRefs: scripts/atlas/cache-hypergraph-cluster-cards.mjs, scripts/sync-cluster-summaries-to-qdrant.mjs, src/lib/server/ace/context-packet-budgeter.ts, src/lib/server/atlas/master-feature-map.ts, scripts/atlas/detect-manifold-drift.mjs, src/lib/server/cache/ace-context-pack-cache.ts, docs/reports/top-100-codebase-summary-cards.md
  - searchHints: rg -n -uu "cluster.cards" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "cluster.cards" --json | evidence:npm run smoke:cluster-cards | evidence:npm run cards:validate
- [production_ready] feature-gap:codebase.semantic_index :: codebase.semantic_index
  - sourceRefs: scripts/build-atlas-index.mjs, docs/atlas-index/codebase-atlas.min.json, memory/index/feature-map.jsonl, src/lib/server/atlas/master-feature-map.ts, docs/reports/codebase-semantic-index-latest.md
  - searchHints: rg -n -uu "codebase.semantic_index" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "codebase.semantic_index" --json | evidence:npm run codebase:semantic-index:smoke | evidence:npm run codebase:semantic-index:report
- [production_ready] feature-gap:feature.labeling :: feature.labeling
  - sourceRefs: src/lib/server/labels/feature-label-registry.ts, src/lib/server/labels/normalize-labels.ts, src/lib/server/atlas/master-feature-map.ts, memory/knowledge/document-knowledge-report.md
  - searchHints: rg -n -uu "feature.labeling" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "feature.labeling" --json | evidence:npm run knowledge:documents:smoke | evidence:npm run knowledge:documents:embed:smoke
- [production_ready] feature-gap:karpathy.hot_lane :: karpathy.hot_lane
  - sourceRefs: src/lib/server/ace/karpathy-qdrant-cluster-backfill.ts, scripts/karpathy-qdrant-cluster-backfill.ts, scripts/karpathy-gpu-enrich.mjs, src/lib/server/atlas/master-feature-map.ts, src/lib/server/ace/karpathy-blend-orchestrator.ts, memory/runs/2026-05-24T23-09-00/qdrant_cluster_tags.json
  - searchHints: rg -n -uu "karpathy.hot_lane" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "karpathy.hot_lane" --json | evidence:npm run mcp-health | evidence:npm run atlas:hyperrag:rerank
- [production_ready] feature-gap:memory.address.registry :: memory.address.registry
  - sourceRefs: src/lib/server/ace/feature-context-matrix.ts, src/lib/server/ace/feature-context-cache.ts, .cache/ace/context-packs/ace_context_smoke-context-pack_v1.json, src/lib/server/atlas/master-feature-map.ts, src/lib/server/cache/ace-context-pack-cache.ts, src/routes/api/memory/status/+server.ts
  - searchHints: rg -n -uu "memory.address.registry" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "memory.address.registry" --json | evidence:npm run memory:claude-mem:smoke
- [production_ready] feature-gap:retrieval.spine :: retrieval.spine
  - sourceRefs: src/lib/server/retrieval/hyperrag-fusion-service.ts, src/lib/server/retrieval/cluster-aware-reranker.ts, docs/architecture/hyperrag-feature-atlas-runtime.md, src/lib/server/atlas/master-feature-map.ts, docs/reports/pgvector-integrity-lane-2026-05-20.md
  - searchHints: rg -n -uu "retrieval.spine" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "retrieval.spine" --json | evidence:npm run smoke:mcp:core-gate | evidence:npm run graph:exports:smoke
- [production_ready] feature-gap:semantic.cache.policy :: semantic.cache.policy
  - sourceRefs: src/lib/server/ace/context-cache-registry.ts, src/lib/server/ace/llm-context-cache.ts, src/lib/server/ace/feature-context-cache.ts, .cache/ace/context-packs/ace_context_local-json-hit_v1.json, .cache/ace/context-packs/ace_context_smoke-context-pack_v1.json, src/lib/server/atlas/master-feature-map.ts, src/lib/server/ace/context-packet-budgeter.ts, src/lib/server/cache/ace-context-pack-cache.ts, memory/knowledge/document-knowledge-synthesis-manifest.json
  - searchHints: rg -n -uu "semantic.cache.policy" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs | node scripts/opencode/find-feature-files.mjs --feature "semantic.cache.policy" --json | evidence:npm run knowledge:documents:synthesize:smoke
- [active] index-gap:overview :: Indexed vs Untracked Local Atlas Coverage
  - sourceRefs: docs/atlas/feature-registry.json, docs/reports/feature-gap-registry-live-latest.json, memory/exports/feature-map-cards.jsonl
  - searchHints: rg --files -uu | rg "atlas|feature|memory|knowledge|engram|ace|qdrant|redis|mcp" | git status --porcelain --untracked-files=all | node scripts/opencode/find-feature-files.mjs --feature "feature registry atlas"
- [active] workspace-gap:0b55972ba7b705a4 :: docs/atlas-index/codebase-atlas.json
  - sourceRefs: local:docs/atlas-index/codebase-atlas.json, docs/atlas-index/codebase-atlas.json
  - searchHints: git status --porcelain --untracked-files=all | Select-String "docs/atlas-index/codebase-atlas\.json" | rg --files -uu | rg "docs/atlas-index/codebase-atlas\.json" | rg -n -uu "codebase-atlas\.json" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:0f00e04ebec19075 :: memory/graphify/deep/unresolved-imports.json
  - sourceRefs: local:memory/graphify/deep/unresolved-imports.json, memory/graphify/deep/unresolved-imports.json
  - searchHints: git status --porcelain --untracked-files=all | Select-String "memory/graphify/deep/unresolved-imports\.json" | rg --files -uu | rg "memory/graphify/deep/unresolved-imports\.json" | rg -n -uu "unresolved-imports\.json" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:0f267847b7c9026a :: .github/workflows/production-deploy.yml
  - sourceRefs: local:.github/workflows/production-deploy.yml, .github/workflows/production-deploy.yml
  - searchHints: git status --porcelain --untracked-files=all | Select-String "\.github/workflows/production-deploy\.yml" | rg --files -uu | rg "\.github/workflows/production-deploy\.yml" | rg -n -uu "production-deploy\.yml" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:128a83ff0eda4103 :: scripts/knowledge/embed-and-upsert-cards.mjs
  - sourceRefs: local:scripts/knowledge/embed-and-upsert-cards.mjs, scripts/knowledge/embed-and-upsert-cards.mjs
  - searchHints: git status --porcelain --untracked-files=all | Select-String "scripts/knowledge/embed-and-upsert-cards\.mjs" | rg --files -uu | rg "scripts/knowledge/embed-and-upsert-cards\.mjs" | rg -n -uu "embed-and-upsert-cards\.mjs" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:20e9e6f83ab74f9f :: memory/docstore/manifest.json
  - sourceRefs: local:memory/docstore/manifest.json, memory/docstore/manifest.json
  - searchHints: git status --porcelain --untracked-files=all | Select-String "memory/docstore/manifest\.json" | rg --files -uu | rg "memory/docstore/manifest\.json" | rg -n -uu "manifest\.json" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:2e3ea741e23fd1ef :: .woodpecker/cheap-ci.yml
  - sourceRefs: local:.woodpecker/cheap-ci.yml, .woodpecker/cheap-ci.yml
  - searchHints: git status --porcelain --untracked-files=all | Select-String "\.woodpecker/cheap-ci\.yml" | rg --files -uu | rg "\.woodpecker/cheap-ci\.yml" | rg -n -uu "cheap-ci\.yml" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:39630eb9bb9ee6c4 :: memory/atlas/codebase-atlas.min.json
  - sourceRefs: local:memory/atlas/codebase-atlas.min.json, memory/atlas/codebase-atlas.min.json
  - searchHints: git status --porcelain --untracked-files=all | Select-String "memory/atlas/codebase-atlas\.min\.json" | rg --files -uu | rg "memory/atlas/codebase-atlas\.min\.json" | rg -n -uu "codebase-atlas\.min\.json" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:46e69d24155dc757 :: docs/graph/codebase-graph.md
  - sourceRefs: local:docs/graph/codebase-graph.md, docs/graph/codebase-graph.md
  - searchHints: git status --porcelain --untracked-files=all | Select-String "docs/graph/codebase-graph\.md" | rg --files -uu | rg "docs/graph/codebase-graph\.md" | rg -n -uu "codebase-graph\.md" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:4f4aab0a859fffec :: scripts/batch-merger-fixer-v2.mjs
  - sourceRefs: local:scripts/batch-merger-fixer-v2.mjs, scripts/batch-merger-fixer-v2.mjs
  - searchHints: git status --porcelain --untracked-files=all | Select-String "scripts/batch-merger-fixer-v2\.mjs" | rg --files -uu | rg "scripts/batch-merger-fixer-v2\.mjs" | rg -n -uu "batch-merger-fixer-v2\.mjs" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:50a9b3778f272ace :: next_steps/active/2026-05-03-production-readiness-master.md
  - sourceRefs: local:next_steps/active/2026-05-03-production-readiness-master.md, next_steps/active/2026-05-03-production-readiness-master.md
  - searchHints: git status --porcelain --untracked-files=all | Select-String "next_steps/active/2026-05-03-production-readiness-master\.md" | rg --files -uu | rg "next_steps/active/2026-05-03-production-readiness-master\.md" | rg -n -uu "2026-05-03-production-readiness-master\.md" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts
- [active] workspace-gap:63719c44a36836d1 :: memory/graphify/deep/route-dependency-map.json
  - sourceRefs: local:memory/graphify/deep/route-dependency-map.json, memory/graphify/deep/route-dependency-map.json
  - searchHints: git status --porcelain --untracked-files=all | Select-String "memory/graphify/deep/route-dependency-map\.json" | rg --files -uu | rg "memory/graphify/deep/route-dependency-map\.json" | rg -n -uu "route-dependency-map\.json" sveltekit-frontend/src sveltekit-frontend/scripts docs scripts

## Next Actions
- Keep indexed-vs-untracked cards downstream from the canonical Postgres/Qdrant/Redis/ACE lanes.
- Promote only sourceRef-backed workspace gap cards.
- Keep backup and generated artifacts out of active atlas coverage.
- Use the embed preview as the target for later MCP search routing.
