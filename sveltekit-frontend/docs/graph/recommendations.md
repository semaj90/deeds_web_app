# Codebase Recommendations
Generated: 2026-07-13T02:44:07.681Z
Graph source: `deep-import-graph.json`
next_steps/active/ files cross-referenced: 2026-05-03-auth-gaps.md, 2026-05-03-directory-consolidation.md, 2026-05-03-production-blockers.md, 2026-05-03-production-readiness-master.md, 2026-05-05_inverted-features-build-order.md, 2026-05-05_unwired-features-wiring-plan.md, 2026-05-07-dir-audit-lib-server.md, 2026-05-07_graph-glyph-ace-synthesis.md, 2026-05-08-production-core-routes-recommendation.md, 2026-05-08_23-30-42_topology-admin-thoughts.md, 2026-05-08_agentic-error-fixing-workflow.md, 2026-05-08_agentic-ingestion-program.md, 2026-05-08_agentic-retrieval-checklist.md, 2026-05-08_agentic-retrieval-ladder.md, 2026-05-08_atlas-signal-quality-todo.md, 2026-05-08_knowledge-graph-retrieval-feature-tracker.md, 2026-05-08_master-pipeline-todo.md, 2026-05-08_mcp-trace-hardening-session.md, 2026-05-08_path-mapping-retrieval-stack.md, 2026-05-08_pipeline-driven-next-actions.md, 2026-05-08_reconstruction-track-production-ready.md, 2026-05-08_schema-consolidation-production-ready.md, 2026-05-09-dir-audit-lib-server.md, 2026-05-09_agents-md-incremental-pipeline.md, 2026-05-09_karpathy-chr97-wiring.md, 2026-05-09_session-end-handoff.md, 2026-05-10_full-stack-claude-checklist.md, 2026-05-10_langgraph-background-research-worker.md, 2026-05-10_production-mental-model.md, 2026-05-10_rotorquant-bitnet-cache-hierarchy.md, 2026-05-10_service-worker-regex-tool-router.md, 2026-05-14_todo-pt2-workspace-startup-and-gpu-indexing.md, 2026-05-14_todo-pt3-ace-cache-indexing-postgres-qdrant.md, 2026-06-16-auth-gaps.md, 2026-06-16-directory-consolidation.md, 2026-06-16-production-blockers.md, 2026-06-16-production-readiness-master.md, 2026-07-01-dir-audit-lib-server.md, 2026-07-06-nes-chrom-okf-acp-integration.md, codebase-semantic-index-tasks.md, codebase-todo-recommendations.md, karpathy-gpu-recommendations.md

## Summary
| | Count |
|---|---|
| Total recommendations | 8 |
| Net-new (not in next_steps) | **0** |
| Already tracked | 8 |

---

## Net-New Recommendations

_All recommendations are already tracked in next_steps/active/_

---

## Already Tracked in next_steps/active/

- **R2-cycles-large**: 1 circular dependency chains of 3+ files _(high)_
- **R4-missing-auth**: 10 API route handlers lack auth guards _(high)_
- **R1-orphans**: 173 files have 0 importers and are not entrypoints _(medium)_
- **R3-hotspots**: 30 files each depended on by >50 files transitively _(medium)_
- **R5-missing-zod**: 34 API routes lack Zod input validation _(medium)_
- **R6-untested-cycles**: 7 files in circular dependency chains have no paired test _(medium)_
- **R7-unwired-impl**: 357 substantial files import libraries but have 0 consumers _(medium)_
- **R2-cycles-small**: 2 2-file circular dependency pairs _(low)_

---

## Recommendations → next_steps/ Action Plan






