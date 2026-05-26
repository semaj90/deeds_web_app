# Retrieval Truth Lock Audit Plan

Status: Active
Date: 2026-05-21
Scope: Validate that retrieval, HMM error labeling, DAG ordering, redis logger stubs, and async observability remain consistent and policy-safe from query ingress to final context packet.

## Goals

1. Prove retrieval path integrity across sparse, dense, and graph-backed ranking paths.
2. Prove HMM error loop wiring is live and tied to rerank penalties.
3. Prove redis logger stubs are present for HMM and error-brain transport.
4. Prove async inference logging remains non-blocking and runtime-reachable.
5. Produce auditable pass/fail outputs without mutating runtime data.

## Primary Runbook

All commands below run from sveltekit-frontend.

1. npm run audit:hmm-error-loop
2. npm run audit:inference-observability
3. npm run audit:hmm-error-loop:full
4. npm run audit:error-dag
5. npm run audit:contracts
6. npm run audit:forms
7. npm run test:network-contracts

## VS Code Task Path

1. Run Task -> HMM Loop: redis_logger_stubs -> Observability Audit
2. Optional follow-up: Run Task -> Observability: Async Inference Log + CouchDB/RabbitMQ Audit

## Required Pass Conditions

1. audit:hmm-error-loop returns ok=true and all summary booleans true:
   - hmmErrorLoopWired
   - redisLoggerStubsReady
   - dagBuilderReady
   - dagArtifactsPresent
   - runTaskReady
2. audit:inference-observability returns:
   - asyncInferenceDesignReady=true
   - couchdbInstalledAndWorking=true
   - rabbitmqInstalledAndWorking=true
3. Route wiring coverage in observability audit:
   - total=5
   - importCount=5
   - callCount=5
4. Runtime endpoints reachable:
   - CouchDB endpoint status 200
   - RabbitMQ management endpoint status 200
5. HMM DAG builder executes and updates reports without parser/runtime failure.

## Artifact Checks

1. docs/reports/error-fix-dag-report.json exists and contains dagNodes.
2. docs/graph/contract-error-map.json exists and contains nodes and edges.
3. scripts/atlas/build-error-fix-dag.mjs contains HMM_STATES and Redis KAG recall path.
4. scripts/tests/audit-hmm-error-workflow-loop.mjs exists and exits non-zero when critical checks fail.
5. scripts/tests/audit-inference-async-observability.mjs exists and checks both static and runtime conditions.

## Retrieval Truth Lock Assertions

1. HMM taxonomy is present in src/lib/server/ace/ace-payload-selector.ts and labels are convertible to a scalar risk.
2. Hmm risk feature is persisted in src/lib/server/retrieval/ranking-features.ts as hmm_error_risk.
3. Reranker applies a negative hmm_error_penalty in src/lib/server/retrieval/boosted-reranker.ts.
4. HMM note caching and scan path are present in src/lib/server/ace/hmm-wiki-logger.ts.
5. Error-brain Redis transport publish/subscribe path is present in src/lib/server/error-brain/transport/redis.ts.
6. JSONL training logger path exists in src/lib/server/training/query-logger.ts.

## Failure Handling

1. If audit:hmm-error-loop fails:
   - Fix missing file/wiring first.
   - Re-run audit:hmm-error-loop.
2. If audit:inference-observability fails:
   - Validate CouchDB and RabbitMQ endpoints.
   - Re-run audit:inference-observability.
3. If audit:error-dag fails with action-required:
   - Use report ordering in docs/reports/error-fix-dag-report.json.
   - Fix root-cause states first, then downstream states.

## Non-Goals

1. No automatic patch application from this plan.
2. No direct production mutation.
3. No hidden-thought or opaque metadata logging.

## Completion Checklist

- [x] HMM loop audit passes.
- [x] Observability audit passes.
- [x] Chained full audit passes.
- [x] DAG report regenerated and readable.
- [x] Contract/forms/network checks complete. (Playwright network contracts: 14 passed)
- [x] Results attached to handoff review.

## Additional Verification (2026-05-22)

1. tools:check:structural passed (sg, ast-grep, jq detected).
2. smoke:inference-log passed (inference logging exports + stats path healthy).
3. OpenCode MCP list shows trace and gemma4-offload connected; turbovec/langextract/engram sidecars unreachable.
4. DuckDB smoke validated local CLI and query path; export-read checks are pending until expected JSONL artifacts are generated.
