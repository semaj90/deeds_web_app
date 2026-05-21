# TRACE Full-Loop Smoke Report (2026-05-20)

## Run Context
- Command: npm run smoke:trace:full
- Startup precheck: npm run startup:health:json
- Startup result: PASS (ok=true)
- Smoke exit code: 0
- Smoke source log: sveltekit-frontend/logs/trace-full-loop/latest.json

## Overall Result
- Status: FAIL
- Prompt count: 5
- Pass: 0
- Warnings: 3
- Errors: 4
- Endpoint: http://localhost:5173/api/v1/chat/completions

## Failures
1. graph-analyze-retrieval
- Duration: 41465ms
- HTTP: 200
- Error: missing_choices_content

2. topology-near-ace
- Duration: 90022ms
- HTTP: null
- Error: fetch_error:The operation was aborted due to timeout

3. hmm-integration-history
- Duration: 90013ms
- HTTP: null
- Error: fetch_error:The operation was aborted due to timeout

4. code-intel-plan
- Duration: 51735ms
- HTTP: 200
- Error: missing_choices_content

## Warnings
1. routes-test-priority
- missing_memory_gain_score
- missing_memory_decision
- agents_md_miss_with_filepath

## Notes
- The pipeline command currently exits 0 even with warnings/errors.
- This can mask regressions in automated runs.

## Next Actions
1. Fix response-shape path that emits missing_choices_content in graph-analyze-retrieval and code-intel-plan.
2. Reduce latency or raise timeout budget for topology-near-ace and hmm-integration-history.
3. Update smoke-trace-full-loop.mjs to return non-zero exit code when error_count > 0.
4. Re-run smoke and compare with docs/reports/trace-full-loop-smoke-report-2026-05-20.json.
