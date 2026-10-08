/**
 * AtlasTaskKernel MCP facade.
 * OpenCode sees only task-facing capabilities; storage, graph, and cache
 * implementations remain internal to the legacy Atlas service.
 */
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const INTERNAL_SERVER = path.join(ROOT, 'sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs');
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'atlas-task-kernel', version: '1.0.0' };
// Stay inside OpenCode's configured 60s request deadline so callers receive a
// useful MCP error rather than the client silently timing out first.
const INTERNAL_CALL_TIMEOUT_MS = 55_000;

const TOOLS = [
  { name: 'atlas_context', description: 'Query-specific context from live search; candidates are unadmitted. If live retrieval is unavailable, returns no evidence and never substitutes a static packet.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxCards: { type: 'number', minimum: 1, maximum: 50 }, domainFilter: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'atlas_inspect', description: 'Resolve file paths (query or refs, max 10) to packet identity: packet key, feature, revision when known. Plain names search source-ref names. Identity only, not source content.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, refs: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 1024 } } }, additionalProperties: false } },
  { name: 'atlas_expand', description: 'Expand read-only structural dependencies for one target.', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false } },
  { name: 'atlas_verify', description: 'Classify a task and return a safe evidence-gathering direction without editing or executing work.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, context: { type: 'string' } }, required: ['prompt'], additionalProperties: false } },
  { name: 'atlas_validate_plan', description: 'Validate a proposed plan; it cannot authorize execution.', inputSchema: { type: 'object', properties: { intent: { type: 'string' }, domain: { type: 'string' }, errorSummary: { type: 'string' }, evidenceLines: { type: 'array', items: { type: 'string' } }, patchTargets: { type: 'array', items: { type: 'string' } }, proposedFix: { type: 'string' } }, required: ['intent', 'domain', 'errorSummary', 'evidenceLines', 'patchTargets'], additionalProperties: false } },
  { name: 'atlas_research', description: 'Run one round of atlas_context selection, read-only. maxRounds is not applied here; multi-round research is the separate ldr-research server.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxCards: { type: 'number', minimum: 1, maximum: 32 }, maxRounds: { type: 'number', minimum: 1, maximum: 3 } }, required: ['query'], additionalProperties: false } },
];

const IMPLEMENTATIONS = {
  atlas_context: ['build_agentic_rag_context', (a) => ({ query: a.query, maxCards: a.maxCards, domainFilter: a.domainFilter })],
  atlas_inspect: ['find_source_refs', (a) => ({ query: a.query, refs: a.refs })],
  atlas_expand: ['find_dependencies', (a) => ({ target: a.target })],
  atlas_verify: ['classify_intent', (a) => ({ prompt: a.prompt, context: a.context })],
  atlas_validate_plan: ['build_recommendation', (a) => a],
  atlas_research: ['build_agentic_rag_context', (a) => ({ query: a.query, maxCards: a.maxCards ?? 32 })],
};

let nextId = 1;
const pending = new Map();
const child = spawn(process.execPath, [INTERNAL_SERVER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ATLAS_TASK_KERNEL_INTERNAL: '1' } });

function rejectPending(error) {
  for (const [id, waiter] of pending) {
    clearTimeout(waiter.timer);
    pending.delete(id);
    waiter.reject(error);
  }
}

createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    message.error ? waiter.reject(Object.assign(new Error(message.error.message || 'Internal Atlas error'), { code: message.error.code })) : waiter.resolve(message.result);
  } catch { /* non-protocol child output */ }
});
child.on('error', (error) => rejectPending(new Error(`Internal Atlas server failed to start: ${error.message}`)));
child.on('exit', (code, signal) => {
  rejectPending(new Error(`Internal Atlas server exited (code=${code ?? 'null'}, signal=${signal ?? 'none'})`));
});

function callInternal(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Internal Atlas ${method} timed out after ${INTERNAL_CALL_TIMEOUT_MS}ms`));
    }, INTERNAL_CALL_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', (error) => {
      if (!error) return;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`Internal Atlas ${method} request could not be sent: ${error.message}`));
    });
  });
}

let readyPromise;
async function ensureInternalReady() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await callInternal('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'atlas-task-kernel-facade', version: '1.0.0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  })().catch((error) => {
    readyPromise = undefined;
    throw error;
  });
  return readyPromise;
}

async function dispatch(method, params) {
  if (method === 'initialize') { await ensureInternalReady(); return { protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO, capabilities: { tools: {} } }; }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { tools: TOOLS };
  if (method !== 'tools/call') throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  const name = params?.name;
  const implementation = IMPLEMENTATIONS[name];
  if (!implementation) throw new Error(`Unknown Atlas task capability: ${name}`);
  await ensureInternalReady();
  const result = await callInternal('tools/call', { name: implementation[0], arguments: implementation[1](params?.arguments ?? {}) });
  if (name === 'atlas_research') {
    const envelope = {
      schema: 'atlas.local-research-mcp-result.v1',
      query: params?.arguments?.query,
      maxRounds: params?.arguments?.maxRounds ?? 3,
      // maxRounds is echoed for compatibility but never applied: exactly one atlas_context round runs.
      maxRoundsApplied: false,
      roundsExecuted: 1,
      maxCards: params?.arguments?.maxCards ?? 32,
      backend: 'atlas-task-kernel',
      ldrToolServer: 'ldr-research',
      ldrStatus: 'SEPARATE_STDIO_MCP_REGISTERED_NOT_CALLED',
      result,
      canonicalAuthority: false,
    };
    return { content: [{ type: 'text', text: JSON.stringify(envelope) }] };
  }
  return { content: result?.content ?? [{ type: 'text', text: JSON.stringify(result ?? {}) }] };
}

const input = createInterface({ input: process.stdin });
input.on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  try {
    const result = await dispatch(request.method, request.params);
    if (request.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  } catch (error) {
    if (request.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32000, message: error.message } }) + '\n');
  }
});

function shutdown() { child.kill(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
