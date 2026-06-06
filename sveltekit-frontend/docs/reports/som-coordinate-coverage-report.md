# SOM Coordinate Coverage Report

Generated: 2026-06-06T01:22:58.345Z
Limit: 5000

## Service Status

- Qdrant: READY (scanned 5000 points)
- Postgres: READY (matched 21552 rows)
- SOM topology file: READY (C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\.tmp\offline-analysis\cluster-topology.json)

## Summary

- Scanned points: 5000
- Missing somRow/somCol: 1833
- With direct coordinates: 3167
- Missing somRow: 1833
- Missing somCol: 1833
- sourceRef coverage among missing: 100.0%
- featureId coverage among missing: 100.0%
- somCluster anchors among missing: 100.0%
- centroidId anchors among missing: 53.1%

## Recoverability

- RECOVERABLE_FROM_SOM_CLUSTER: 1833

## Samples

| point_id | classification | source_ref | feature_id | som_cluster | centroid_id | derived_coords | note |
|---|---|---|---|---|---|---|---|
| `119404` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/f2py/tests/test_character.py | utility | 1 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `119984` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/_core/overrides.py | utility | 2 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `346920` | RECOVERABLE_FROM_SOM_CLUSTER | src/lib/server/features/codebase-intel/indexer/directory-summarizer.ts#chunk-8 | indexer | 10 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `435390` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/phase78/apply-patch/LLMS.md#chunk-2 | scripts | 12 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `583454` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/minio/upload/LLMS.md#chunk-2 | scripts | 15 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `584992` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/pip/_vendor/rich/color.py | utility | 16 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `614211` | RECOVERABLE_FROM_SOM_CLUSTER | src/routes/(app)/admin/atlas/+page.server.ts#chunk-1 | routes | 17 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `639944` | RECOVERABLE_FROM_SOM_CLUSTER | src/routes/admin/parents-atlas/+page.svelte#chunk-42 | routes | 18 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `733463` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/_core/tests/test_simd.py | utility | 21 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `852990` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/legal/detective/case/[caseId]/LLMS.md#chunk-1 | scripts | 24 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `914219` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/citations/collections/+server.ts#chunk-1 | utility | 26 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1008016` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/documents/process/+server.ts#chunk-5 | utility | 28 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1080785` | RECOVERABLE_FROM_SOM_CLUSTER | src/lib/components/admin/AdminMonitoringDashboard.svelte#chunk-22 | admin | 31 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1103029` | RECOVERABLE_FROM_SOM_CLUSTER | src/lib/components/graph/GraphifyViewer.svelte#chunk-64 | graph | 32 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1116474` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/pip/_internal/resolution/resolvelib/candidates.py | utility | 34 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1146202` | RECOVERABLE_FROM_SOM_CLUSTER | src/lib/server/admin/retrieval-analytics-service.ts#chunk-0 | utility | 36 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1211350` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/cache/redis/set/+server.ts#chunk-2 | utility | 37 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1243016` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/orchestrator/health/+server.ts#chunk-6 | utility | 38 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1253393` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ast/analyze/+server.ts#chunk-4 | utility | 40 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1344589` | RECOVERABLE_FROM_SOM_CLUSTER | scripts/analyze-current-errors.mjs#chunk-22 | scripts | 41 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1472131` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/lib/tests/test_format.py | utility | 45 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1589319` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/polynomial/hermite_e.py | utility | 47 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1604171` | RECOVERABLE_FROM_SOM_CLUSTER | src/lib/components/admin/ContextualAssistantModal.svelte#chunk-19 | admin | 48 | ae_0 | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1702529` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/pip/_internal/network/xmlrpc.py | utility | 52 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |
| `1780556` | RECOVERABLE_FROM_SOM_CLUSTER | .venv/Lib/python3.9/site-packages/numpy/ma/extras.py | utility | 55 | n/a | 0,0 | SOM cluster evidence resolves to known row/col coordinates. |

## Evidence

- cluster-topology entries: 100
- centroid map entries: 25
- pg evidence rows: 21552
- points with sourceRef/featureId but missing coords: 1833
- points with no topology anchors at all: 0
