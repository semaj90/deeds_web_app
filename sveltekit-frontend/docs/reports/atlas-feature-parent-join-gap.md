# Atlas Feature ↔ Parent Atlas Join Gap

Generated: 2026-06-12T02:08:45.753Z
Postgres reachable: yes

## Summary

- atlas_feature_map rows: 14487
- parent_atlas_documents rows: 5253
- joined rows: 10009
- gap rows: 4478
- join coverage: 69.09%

## Sample Gaps

- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/suggestions/health/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/suggestions/health/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/rerank/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/rerank/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/recommendations/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/recommendations/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/redis-optimized-analyze/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/redis-optimized-analyze/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/suggestions/rate/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/suggestions/rate/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/suggestions/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/suggestions/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/cases/[id]/laws/[statute_code]/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/cases/[id]/laws/[statute_code]/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/ai/suggestions/stream/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/ai/suggestions/stream/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/cache/redis/get-recent/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/cache/redis/get-recent/llms.md
- ../scripts/atlas/audit-feature-registry.mjs | n/a | norm=scripts/atlas/audit-feature-registry.mjs
- ../scripts/atlas/resolve-kanban-gaps.mjs | n/a | norm=scripts/atlas/resolve-kanban-gaps.mjs
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/enhanced-semantic/intelligent-todos/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/enhanced-semantic/intelligent-todos/llms.md
- .opencode/agents/hermes-ace.md | routes | norm=.opencode/agents/hermes-ace.md
- .opencode/commands/ace-fallback-ladder.md | routes | norm=.opencode/commands/ace-fallback-ladder.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/webgpu/embedding-benchmark/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/v1/webgpu/embedding-benchmark/llms.md
- .opencode/skills/ace-recovery/SKILL.md | routes | norm=.opencode/skills/ace-recovery/skill.md
- ../scripts/ace_batch_fix_set.py | n/a | norm=scripts/ace_batch_fix_set.py
- ../scripts/ace_batch_fix_set_v2.py | n/a | norm=scripts/ace_batch_fix_set_v2.py
- .scheck-latest.txt | utility | norm=.scheck-latest.txt
- ../scripts/atlas/create-qdrant-feature-maps.mjs | n/a | norm=scripts/atlas/create-qdrant-feature-maps.mjs
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/storage/audits/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/v1/storage/audits/llms.md
- ../scripts/analysis/check-dirs.mjs | n/a | norm=scripts/analysis/check-dirs.mjs
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/copilot/optimize/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/copilot/optimize/llms.md
- ../scripts/analysis/key-dirs.mjs | n/a | norm=scripts/analysis/key-dirs.mjs
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/embed/ingest/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/embed/ingest/llms.md
- ../scripts/analysis_reports/LLMS.md | n/a | norm=scripts/analysis_reports/llms.md
- ../scripts/analysis/top-others.mjs | n/a | norm=scripts/analysis/top-others.mjs
- ../scripts/analyze_legal_concepts.py | n/a | norm=scripts/analyze_legal_concepts.py
- ../scripts/api-cleanup/LLMS.md | n/a | norm=scripts/api-cleanup/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ace/llm-analyze/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ace/llm-analyze/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/services/[serviceId]/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/v1/services/[serviceid]/llms.md
- ../scripts/atlas/ingester/README.md | n/a | norm=scripts/atlas/ingester/readme.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ace/vlm-process/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ace/vlm-process/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/activities/[activityId]/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/activities/[activityid]/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/admin/cache-dashboard/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/admin/cache-dashboard/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/enhanced-grpo/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/enhanced-grpo/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/enhanced-legal-search/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/enhanced-legal-search/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/admin/cache/stats/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/admin/cache/stats/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/enhanced-microservice/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/enhanced-microservice/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/enhanced-rag-vlm/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/enhanced-rag-vlm/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/evidence-recommendations/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/evidence-recommendations/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/vector/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/v1/vector/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/generate-report/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/generate-report/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/explain-statute/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/explain-statute/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/generate/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/generate/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/extract-languages/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/extract-languages/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/health/cloud/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/health/cloud/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/gpu-pipeline/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/gpu-pipeline/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/phase82/status/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/phase82/status/llms.md
- ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/health-mock/LLMS.md | n/a | norm=scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/health-mock/llms.md
