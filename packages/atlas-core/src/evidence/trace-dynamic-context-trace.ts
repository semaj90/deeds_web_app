import type { TraceDynamicContextRequest, TraceDynamicContextResult } from './trace-dynamic-context.types.js';
import { inferTraceQuestionFamily } from './trace-dynamic-context-report.js';
import type { WorkflowTrace } from '../validation/workflow-trace-logger.js';

export function traceDynamicContextResultToWorkflowTrace(
  request: TraceDynamicContextRequest,
  result: TraceDynamicContextResult
): WorkflowTrace {
  const family = inferTraceQuestionFamily(request);
  const packetKeys = [
    result.packetKey,
    ...result.evidence
      .filter((item) => item.message?.startsWith('packet-'))
      .map((item) => item.message as string),
  ].filter((value): value is string => Boolean(value));

  const sourceRefs = [
    result.sourceId,
    ...result.evidence
      .filter((item) => item.path)
      .map((item) => item.path as string),
  ].filter((value): value is string => Boolean(value));

  const toolsUsed = Array.from(new Set([
    `trace_dynamic_context:${family}`,
    ...request.lanes.map((lane) => `lane:${lane}`),
    ...result.evidence.slice(0, 8).map((item) => `evidence:${item.kind}`),
  ]));

  const route = `trace_dynamic_context:${family}`;
  const synthesizedOutput = result.evidence
    .slice(0, 20)
    .map((item) => `${item.kind}:${item.status}:${item.source ?? 'unknown'}`)
    .join('\n');

  return {
    trace_id: result.traceId,
    timestamp: result.provenance.generatedAt,
    user_query: request.question,
    route,
    route_rationale: `trace_dynamic_context evidence bundle for ${family} questions`,
    tools_used: toolsUsed,
    tool_args: {
      workspaceId: request.workspaceId,
      workspaceRevision: request.workspaceRevision,
      sourceRevision: request.sourceRevision ?? null,
      target: request.target ?? null,
      limits: request.limits,
    },
    tool_latencies: {},
    packet_keys_used: packetKeys,
    source_refs_used: sourceRefs,
    feature_ids_used: [],
    summaries_used: result.evidence
      .map((item) => item.message)
      .filter((value): value is string => Boolean(value))
      .slice(0, 10),
    retrieval_latency_ms: 0,
    compaction_ratio: 1,
    tokens_sent_to_model: 0,
    model_name: 'trace-dynamic-context',
    model_version: 'workspace',
    llm_synthesis_input: request.question,
    llm_synthesis_output: synthesizedOutput,
    llm_synthesis_latency_ms: 0,
    validator_name: 'trace_dynamic_context_validation',
    validator_result: result.validation.status === 'CONTRADICTED' ? 'HARD_FAIL' : result.validation.status === 'PROVEN' ? 'PASS' : 'SOFT_WARNING',
    validator_errors: result.validation.failedGates,
    validator_warnings: result.validation.unresolvedClaims,
    writes_executed: [],
    total_duration_ms: 0,
    success: result.validation.status === 'PROVEN',
    schema_version: 'trace_dynamic_context.workflow_trace.v1',
    git_commit: result.provenance.toolVersions['atlas-core'] ?? 'workspace',
    workspace_path: request.workspaceId,
  };
}
