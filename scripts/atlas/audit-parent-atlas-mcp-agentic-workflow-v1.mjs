#!/usr/bin/env node
/** Static source audit; never connects to MCP, databases, caches, or services. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'docs/reports/parent-atlas-mcp-agentic-workflow-review-v1.json');
const sourcePaths = [
  'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
  'sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts',
  'sveltekit-frontend/src/lib/server/telemetry/gpu-telemetry.ts',
  'sveltekit-frontend/src/lib/server/telemetry/packet-centric-telemetry.ts',
  'sveltekit-frontend/src/lib/server/gpu/gpu-pipeline.ts',
  'sveltekit-frontend/src/mcp/native-acceleration-tools.ts',
  'sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs',
  'sveltekit-frontend/scripts/mcp/atlas-tools-mcp.vram-request-contract.test.mjs',
  'sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md',
  'sveltekit-frontend/src/mcp/kanban-dag-prefill-recommendation.ts',
  'docs/reports/mcp-tool-registry-index.json',
  'sveltekit-frontend/src/mcp/atlas-keyword-corpus-tools.ts',
  'sveltekit-frontend/src/mcp/operator-token-verifier.ts',
  'sveltekit-frontend/src/mcp/operator-token-gate.ts',
];
const files = new Map(sourcePaths.map((p) => {
  const text = readFileSync(resolve(ROOT, p), 'utf8');
  return [p, { text, lines: text.split(/\r?\n/), sha256: createHash('sha256').update(text).digest('hex') }];
}));
function evidence(source, needle) {
  const file = files.get(source);
  const line = file.lines.findIndex((value) => value.includes(needle));
  if (line < 0) throw new Error(`SOURCE_EVIDENCE_NOT_FOUND: ${source}: ${needle}`);
  return { source, line: line + 1, needle };
}
const tools = [
  { name: 'ops.search_tools', declared: 'READ', handler: 'Bounded registry search; TRACE invocation wrapper also records an Engram observation.', auth: 'No operator token required for discovery.', refs: [evidence(sourcePaths[0], "'ops.search_tools'")] },
  { name: 'ops.inspect_tool_contract', declared: 'READ', handler: 'Reads in-memory contract metadata; TRACE invocation wrapper records an Engram observation.', auth: 'No operator token required for discovery.', refs: [evidence(sourcePaths[0], "'ops.inspect_tool_contract'")] },
  { name: 'ops.validate_tool_call', declared: 'READ', handler: 'Preflight validation only; TRACE invocation wrapper records an Engram observation.', auth: 'No operator token required for preflight.', refs: [evidence(sourcePaths[0], "'ops.validate_tool_call'")] },
  { name: 'ops.propose_patch', declared: 'READ', handler: 'Reads source and returns a patch preview; does not apply it. TRACE invocation wrapper persists an observation.', auth: 'Operator token required by handler.', refs: [evidence(sourcePaths[0], "'ops.propose_patch'")] },
  { name: 'ops.record_fix_attempt', declared: 'WRITE', handler: 'Inserts fix-attempt data into PostgreSQL; TRACE invocation wrapper also persists an observation.', auth: 'Operator token required.', refs: [evidence(sourcePaths[0], "'ops.record_fix_attempt': {")] },
  { name: 'ops.run_targeted_test', declared: 'EXEC', handler: 'Spawns Vitest for supplied target; tests may have their own side effects. TRACE invocation wrapper persists an observation.', auth: 'Operator token required.', refs: [evidence(sourcePaths[0], "'ops.run_targeted_test': {")] },
  { name: 'ops.fixer_semantic_recall', declared: 'READ', handler: 'Queries fixer-memory projections; TRACE invocation wrapper persists an observation.', auth: 'No write authorization; inspect runtime token wrapper before calling.', refs: [evidence(sourcePaths[0], "'ops.fixer_semantic_recall'")] },
  { name: 'ops.fixer_pattern_store', declared: 'WRITE', handler: 'Writes PostgreSQL fixer_patterns and fixer_run_log; may update Redis and Qdrant. Formal TRACE contract and implementation both classify it as storage-mutating.', auth: 'Operator-token gate plus handler validation.', refs: [evidence(sourcePaths[0], "'ops.fixer_pattern_store': {"), evidence(sourcePaths[1], 'INSERT INTO fixer_patterns'), evidence(sourcePaths[10], '"permissions": "read_only"'), evidence(sourcePaths[13], 'verifyMcpOperatorToken(token, configuredSecret)')] },
  { name: 'graph.expand_neighborhood', declared: 'READ', handler: 'Bounded graph neighborhood traversal; TRACE invocation wrapper persists an Engram observation.', auth: 'Graph-read path; no task mutation authority.', refs: [evidence(sourcePaths[0], "'graph.expand_neighborhood'")] },
  { name: 'trace.kag_search', declared: 'READ', handler: 'Retrieval cascade; TRACE invocation wrapper persists an Engram observation and retrieval subcalls may emit resource telemetry.', auth: 'Read path; result must still pass ACE canonicalization before model context.', refs: [evidence(sourcePaths[0], "'trace.kag_search'")] },
  { name: 'atlas.keyword_corpus_search', declared: 'READ', handler: 'Searches schema-validated .okf keyword corpus; reference-only output, not canonical admission. TRACE invocation wrapper applies when registered through the wrapped server.', auth: 'Read-only corpus search.', refs: [evidence(sourcePaths[11], "'atlas.keyword_corpus_search'")] },
  { name: 'atlas.materialize_feature_evidence_tuples', declared: 'READ', handler: 'Bounded canonical-source read and proposal materialization; TRACE invocation wrapper additionally persists an Engram observation.', auth: 'Read-only query budget.', refs: [evidence(sourcePaths[0], "'atlas.materialize_feature_evidence_tuples'")] },
  { name: 'atlas.graph.pagerank', declared: 'READ', handler: 'Authorized graph-projection read; returned ranks do not establish canonical identity. TRACE invocation wrapper persists an observation.', auth: 'Scoped graph-read grant.', refs: [evidence(sourcePaths[0], "'atlas.graph.pagerank'")] },
  { name: 'atlas.backend_info / atlas.exact_topk_oracle / atlas.parity_report / atlas.simdjson_tensor_metrics', declared: 'READ', handler: 'Native acceleration fixtures and backend metadata; registered before TRACE global invocation instrumentation. Fixture parity is not production corpus or GPU proof.', auth: 'No mutation authority declared.', refs: [evidence(sourcePaths[0], 'registerNativeAccelerationTools(server, async () =>'), evidence(sourcePaths[5], 'atlas.exact_topk_oracle')] },
  { name: 'atlas.kanban_dag_prefill_recommendation', declared: 'READ', handler: 'Bounded snapshot and recommendation only; never claims, dispatches, or changes task state. TRACE invocation telemetry applies.', auth: 'Proposal-only.', refs: [evidence(sourcePaths[9], 'atlas.kanban_dag_prefill_recommendation')] },
  { name: 'recommend_kanban_dag_prefill_algorithm', declared: 'READ', handler: 'Separate atlas-tools MCP server; bounded snapshot proposal, no claim or status mutation.', auth: 'No durable claim authorization.', refs: [evidence(sourcePaths[6], "name: 'recommend_kanban_dag_prefill_algorithm'")] },
  { name: 'classify_intent / build_recommendation', declared: 'READ', handler: 'Intent classification plus bounded live retrieval to ground a recommendation; not an execution command. The latter performs source retrieval.', auth: 'No task-execution authority.', refs: [evidence(sourcePaths[6], "name: 'classify_intent'"), evidence(sourcePaths[6], 'export async function buildRecommendation(')] },
  { name: 'record_outcome', declared: 'WRITE', handler: 'Can persist outcome records to the explicitly guarded loopback PostgreSQL scratch target and other configured outcome projections; not a verified task completion owner unless claim/lease/verification fields are validated.', auth: 'Scratch URL and schema/runtime gates; write-capable.', refs: [evidence(sourcePaths[6], 'async function recordOutcome(args)')] },
  { name: 'gpu_vram_status', declared: 'READ', handler: 'Reads nvidia-smi and llama-server slots; does not stop services. Live runtime status is not queried by this audit.', auth: 'Status only.', refs: [evidence(sourcePaths[6], "name: 'gpu_vram_status'")] },
  { name: 'gpu_request_vram_release', declared: 'WRITE', handler: 'Writes an idempotent request record to a local file; does not stop a process. Production record omits testOnly.', auth: 'Unauthenticated request-only notice; human runs lifecycle task.', refs: [evidence(sourcePaths[6], 'gpuRequestVramRelease(args)'), evidence(sourcePaths[7], "Object.hasOwn(stored, 'testOnly')")] },
  { name: 'GPU compute tools (ops.gpu_topk / ops.gpu_pagerank / ops.gpu_attention)', declared: 'WRITE in registry', handler: 'Compute may use a native export or CPU reference; persisted resource telemetry is written through packet-centric PostgreSQL telemetry. Telemetry does not prove CUDA kernel execution.', auth: 'Operator-gated contract; no GPU tool invoked.', refs: [evidence(sourcePaths[0], "'ops.gpu_attention': {"), evidence(sourcePaths[2], 'recordPacketCentricTelemetry'), evidence(sourcePaths[3], 'insert into phase_2_telemetry')] },
  { name: 'trace.system_health', declared: 'READ', handler: 'Source marks rerank optional and topology_search required; deployed behavior still needs operator restart and live read.', auth: 'Status only.', refs: [evidence(sourcePaths[0], "new Set(['rerank'])")] },
];

const report = {
  schema: 'atlas.parent-atlas-mcp-agentic-workflow-review.v1',
  generatedAt: new Date().toISOString(),
  mode: 'STATIC_SOURCE_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  mcpToolsInvoked: false,
  databasesCachesGpuAndServicesAccessed: false,
  sources: Object.fromEntries([...files].map(([p, f]) => [p, { sha256: `sha256:${f.sha256}` }])),
  toolInventory: tools,
  findings: {
    fixerPatternStoreClassification: 'CONFIRMED_DISCREPANCY: generated docs/reports/mcp-tool-registry-index.json says permissions=read_only and writes_to=[], while TRACE formal registry says WRITE and the implementation mutates PostgreSQL, with optional Redis/Qdrant updates. Correct the generated index from the source owner before using it for routing or authorization.',
    traceInvocationPersistence: 'Tools registered after the registerTool monkey-patch record observations in Engram (PostgreSQL-backed path); handler-level READ does not mean the overall invocation has no persistence side effect. Native acceleration tools are registered before this wrapper.',
    operatorToken: { finding: 'The verifier rejects missing/short tokens and an unconfigured secret, then compares SHA-256 digests with timingSafeEqual. This is source inspection only; no secret was read and no live positive-token request was made.', refs: [evidence(sourcePaths[12], 'timingSafeEqual(supplied, configured)'), evidence(sourcePaths[13], 'verifyMcpOperatorToken(token, configuredSecret)')] },
    viterbi: 'No registered/callable Viterbi routing tool was established by this bounded source audit. Keep Viterbi as a challenger.',
    liveToolList: 'NOT_RUN; static registration does not prove deployed process availability or loaded-source revision.',
    workflow: 'Tool discovery and preflight exist. Evidence materialization, retrieval, recommendation, verification, and mutation are distinct. No complete execution proof is established without a revision-bound durable claim, authorized command, independent receipt, and Kanban readback.',
    dependencyReferences: { priorReportedWorkboardTasks: 4077, unique: 7, ambiguous: 2, unresolved: 9, status: 'REVIEW_REQUIRED; no edges inferred or promoted by this audit' },
  },
  openGates: [
    'TRACE token configured and positive/negative live comparison verified by operator without exposing the secret.',
    'TRACE operator restart and live system_health response for optional rerank behavior.',
    'Resolve any generated-registry discrepancy against the current tool owner and actual side effects.',
    'Provide task-bound criterion evidence, exact verification command/result receipts, and dependency mappings before computing a total per-task evidence score.',
    'Keep write-capable tools uncalled until a reviewed task, authorization, and execution receipt path are admitted.',
  ],
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: relative(ROOT, OUT).replaceAll('\\', '/'), tools: tools.length, sources: files.size, mcpToolsInvoked: false, writesPerformed: false }, null, 2));
