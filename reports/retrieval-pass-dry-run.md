# Retrieval Pass Dry Run

**Generated:** 2026-06-01T08:04:32.924Z
**Query:** ACE context assembly
**Collection:** codebase_chunks_768
**Top:** 15
**DurationMs:** 1074

## Gate Status

- Qdrant hits: 15
- Neo4j neighbors: 0
- Redis available: yes
- Langfuse ready: no
- External writes: disabled

## Top Candidates

| Rank | SourceRef | Feature | Score | Readiness |
|---:|---|---|---:|---:|
| 1 | `171739287` | unknown | 0.5216 | 0.4847 |
| 2 | `171901330` | unknown | 0.5151 | 0.4818 |
| 3 | `.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json` | utility | 0.5145 | 1.0000 |
| 4 | `224065494` | unknown | 0.5079 | 0.4785 |
| 5 | `src/lib/server/graph/community-graph.ts` | utility | 0.5068 | 1.0000 |
| 6 | `.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json` | utility | 0.5054 | 1.0000 |
| 7 | `.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json` | utility | 0.5009 | 1.0000 |
| 8 | `85850136` | unknown | 0.4898 | 0.4704 |
| 9 | `src/lib/server/features/ai/index.ts` | utility | 0.4848 | 1.0000 |
| 10 | `.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json` | utility | 0.4843 | 1.0000 |

## Notes

- Qdrant path is read-only in dry-run.
- Neo4j neighbor expansion is read-only in dry-run.
- Redis packet cache is not written in dry-run.
- Langfuse tracing is skipped in dry-run.