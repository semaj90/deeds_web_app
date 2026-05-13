# Feature: Topological Sort Corpus
Status: implemented

## Implementation
- `src/lib/server/analysis/topological-sort.ts`
- `src/lib/server/analysis/corpus-optimizer.ts`

## Types
- `src/lib/server/features/feature-map.types.ts`

## Routes
- `src/routes/api/analysis/sort/+server.ts`

## Tests
- `tests/topological-sort.test.ts`

## Docs
- `docs/ace-kag-howto.md`

## Graph Triples
- ["feature:cs:topological-sort-corpus", "IMPLEMENTS", "algorithm:topological-sort"]
- ["feature:cs:topological-sort-corpus", "USES", "db:enhanced_graph_mappings"]
