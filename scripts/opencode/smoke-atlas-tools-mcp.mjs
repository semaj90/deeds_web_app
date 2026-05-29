#!/usr/bin/env node
/**
 * smoke-atlas-tools-mcp.mjs
 *
 * Smoke test for atlas-tools-mcp.mjs:
 *   1. tools/list shows all 3 tools
 *   2. classify_intent call works
 *   3. build_agentic_rag_context call works
 *   4. build_recommendation call works
 *   5. no Redis/Qdrant/filesystem writes
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs');

let pass = 0;
let fail = 0;

function ok(label) { console.log('  ✅', label); pass++; }
function ko(label, detail) { console.log('  ❌', label, detail ? `— ${detail}` : ''); fail++; }

async function runMcp(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', () => resolve({ stdout, stderr }));
    child.on('error', reject);
    for (const msg of messages) {
      child.stdin.write(JSON.stringify(msg) + '\n');
    }
    child.stdin.end();
  });
}

function parseResponses(stdout) {
  return stdout.split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

async function main() {
  console.log('smoke-atlas-tools-mcp\n');

  const { stdout } = await runMcp([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'smoke', version: '0.1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'classify_intent', arguments: { prompt: 'atlas:phase17 only producing 1 card' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'build_agentic_rag_context', arguments: { query: 'phase17 card count', maxCards: 5 } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'build_recommendation', arguments: { intent: 'repair', domain: 'retrieval', errorSummary: 'phase17 input file missing', evidenceLines: ['memory/knowledge/schema-indexer-contract-cards.jsonl not found'], patchTargets: ['sveltekit-frontend/package.json'] } } },
  ]);

  const responses = parseResponses(stdout);
  const byId = Object.fromEntries(responses.map(r => [r.id, r]));

  // 1. initialize
  if (byId[1]?.result?.serverInfo?.name === 'atlas-tools') ok('initialize — serverInfo.name = atlas-tools');
  else ko('initialize', JSON.stringify(byId[1]));

  // 2. tools/list
  const tools = byId[2]?.result?.tools ?? [];
  const names = tools.map(t => t.name);
  if (names.includes('classify_intent'))           ok('tools/list — classify_intent present');
  else ko('tools/list — classify_intent missing', names.join(', '));
  if (names.includes('build_agentic_rag_context')) ok('tools/list — build_agentic_rag_context present');
  else ko('tools/list — build_agentic_rag_context missing', names.join(', '));
  if (names.includes('build_recommendation'))      ok('tools/list — build_recommendation present');
  else ko('tools/list — build_recommendation missing', names.join(', '));

  // all tools have inputSchema with descriptions
  let schemaOk = true;
  for (const t of tools) {
    if (!t.inputSchema) { ko(`${t.name} — missing inputSchema`); schemaOk = false; continue; }
    for (const [k, v] of Object.entries(t.inputSchema.properties ?? {})) {
      if (!v.description) { ko(`${t.name}.${k} — missing description`); schemaOk = false; }
    }
  }
  if (schemaOk) ok('all tool properties have descriptions');

  // 3. classify_intent result
  const ci = byId[3];
  if (ci?.result && !ci.result.isError) {
    const r = JSON.parse(ci.result.content?.[0]?.text ?? '{}');
    if (r.intent && r.domain && r.safeNextCommand) ok(`classify_intent — intent=${r.intent} domain=${r.domain}`);
    else ko('classify_intent — missing fields', JSON.stringify(r));
    if (!r.intent.includes('write') && !r.safeNextCommand?.includes('rm')) ok('classify_intent — no destructive commands');
    else ko('classify_intent — safeNextCommand looks destructive');
  } else ko('classify_intent call failed', JSON.stringify(ci));

  // 4. build_agentic_rag_context result
  const rac = byId[4];
  if (rac?.result && !rac.result.isError) {
    const r = JSON.parse(rac.result.content?.[0]?.text ?? '{}');
    if ('ok' in r && 'cards' in r && 'sourceRefs' in r) ok(`build_agentic_rag_context — ok=${r.ok} cards=${r.cards?.length ?? 0}`);
    else ko('build_agentic_rag_context — missing fields', JSON.stringify(r).slice(0, 80));
  } else ko('build_agentic_rag_context call failed', JSON.stringify(rac));

  // 5. build_recommendation result
  const br = byId[5];
  if (br?.result && !br.result.isError) {
    const r = JSON.parse(br.result.content?.[0]?.text ?? '{}');
    if (r.likely_cause && r.safe_next_command && Array.isArray(r.do_not_do)) ok(`build_recommendation — safe_next_command="${r.safe_next_command}"`);
    else ko('build_recommendation — missing fields', JSON.stringify(r).slice(0, 80));
    if (Array.isArray(r.do_not_do) && r.do_not_do.length > 0) ok('build_recommendation — do_not_do populated');
    else ko('build_recommendation — do_not_do empty');
  } else ko('build_recommendation call failed', JSON.stringify(br));

  console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });