import {
  assertNoCommittedMcpWritesV1,
  extractMcpTextV1,
  parseMcpResponseV1,
  validateMiniforgeHealthV1,
} from './lib/agentic-validation-runtime-v1.mjs';

const traceBaseUrl = (process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788').replace(/\/+$/, '').replace(/\/mcp$/, '');

async function callMcpTool(name, args) {
  const response = await fetch(`${traceBaseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `agentic-validation:${name}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TRACE_MCP_HTTP_${response.status}`);
  const envelope = parseMcpResponseV1(await response.text());
  if (envelope.error) throw new Error(`TRACE_MCP_RPC_${envelope.error.code ?? 'ERROR'}`);
  return envelope.result;
}

try {
  const retrievalResult = await callMcpTool('atlas.query', {
    query: 'Parent Atlas source-byte reader and profile provenance owners',
    limit: 3,
    intent: ['api_surface', 'dependencies', 'retrieval_role'],
  });
  const retrievalText = extractMcpTextV1(retrievalResult);
  const retrievalHits = JSON.parse(retrievalText);
  const retrievalEffects = assertNoCommittedMcpWritesV1(retrievalResult);

  const healthResult = await callMcpTool('miniforge.health', {});
  const health = validateMiniforgeHealthV1(JSON.parse(extractMcpTextV1(healthResult)));

  process.stdout.write(`TRACE_MCP_TOOL_CALLS=PASS atlas.query,miniforge.health\n`);
  process.stdout.write(`TRACE_RETRIEVAL_HITS=${Array.isArray(retrievalHits) ? retrievalHits.length : 0}\n`);
  process.stdout.write(`TRACE_COMMITTED_WRITES=${retrievalEffects.committedWrites}\n`);
  process.stdout.write(`FASTAPI_NLP_SIDECAR=READY ${health.sidecarUrl}\n`);
  process.stdout.write(`NLP_CAPABILITIES=${health.capabilities ? JSON.stringify(health.capabilities) : 'UNAVAILABLE_FROM_HEALTH_TOOL'}\n`);
  process.stdout.write('AGENTIC_REVIEW=ADVISORY_ONLY; HUMAN_APPROVAL=NOT_GRANTED\n');
} catch (error) {
  process.stderr.write(`AGENTIC_VALIDATION_RUNTIME=FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
