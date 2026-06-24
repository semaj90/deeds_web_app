
# Runtime Queue Layer — NATS / LangGraph Smoke Test Report

Generated: 2026-06-24T13:44:45.299Z
NATS URL: nats://127.0.0.1:4222
Consolidated Status: **PASS**

## Subject Mappings Verification

| Subject | Pattern | Status | Type | Duration | Details / Error |
|---|---|---|---|---|---|
| **agent.task.execute** | Agent execution queue | ✅ PASS | request-reply | 81.7ms | Worker acknowledged task execution |
| **retrieval.turbovec.rerank** | Rerank queue | ✅ PASS | request-reply | 277.5ms | Returned ok=true |
| **gpu.cuvs.search** | cuVS search queue | ✅ PASS | request-reply | 1.8ms | Returned ok=true |
| **gpu.cuda.rank** | CUDA rank queue | ✅ PASS | request-reply | 1.7ms | Returned ok=true |
| **engram.feedback.async** | Engram feedback queue | ✅ PASS | publish | 0.1ms | Published without error |

## OpenCode Skill Contract (Mandatory Addendum)
- **likely_cause**: Verification of NATS task queues and LangGraph worker message subjects.
- **evidence**: `scripts/verify/nats-langgraph-worker-smoke.mjs`, NATS server running at :4222
- **patch_targets**: [`scripts/verify/nats-langgraph-worker-smoke.mjs`]
- **safe_next_command**: "node scripts/verify/nats-langgraph-worker-smoke.mjs"
- **smoke_command**: "node scripts/verify/nats-langgraph-worker-smoke.mjs"
- **report_path**: "docs/reports/nats-langgraph-worker-smoke.json"
