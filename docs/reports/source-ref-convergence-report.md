# Source-Ref Convergence Report

Generated: 2026-06-09T23:36:37.767Z
Sample: 200 files (top-200 Neo4j PageRank)

## System Coverage

| System | Hits | Misses | Hit Rate |
|--------|------|--------|----------|
| Neo4j (canonical assigned) | 200 | 0 | 100.0% |
| Qdrant (chunks by hash) | 194 | 6 | 97.0% |
| Karpathy (Redis blend score) | 89 | 111 | 44.5% |
| Atlas (task_semantic_packets) | 0 | 200 | task refs, not file refs |

## Convergence

| Metric | Count | % |
|--------|-------|---|
| Fully aligned (Neo4j + Qdrant + Karpathy) | 89 | 44.5% |
| In Karpathy, missing from Qdrant (needs re-index) | 0 | 0.0% |
| Missing from both Qdrant + Karpathy (never indexed) | 6 | 3.0% |

## Files Needing Re-index (top 0)


## Files Never Indexed (top 6)

- `src/lib/server/db/vector-schema.ts` (PR: 1.548)
- `src/lib/server/db/schema-actual.ts` (PR: 1.477)
- `src/lib/server/db/lucia-schema.ts` (PR: 1.426)
- `src/lib/server/db/additional-tables.ts` (PR: 1.376)
- `src/routes/(app)/cases/[id]/canvas/+page.server.ts` (PR: 1.367)
- `src/routes/(analysis)@/+layout.server.ts` (PR: 1.367)