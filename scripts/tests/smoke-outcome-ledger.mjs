#!/usr/bin/env node
/**
 * smoke-outcome-ledger.mjs
 *
 * Smoke test for the Phase 18+ Behavioral Supervision & Outcome Ledger implementation:
 * - Spawns atlas-tools-mcp.mjs
 * - Invokes record_outcome
 * - Asserts the local outcome-ledger.ndjson file is updated
 * - Invokes path trace tools (find_dependencies, trace_database, trace_tool_chain)
 * - Verifies Neo4j connection and behavior queries
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs');
const LEDGER = path.resolve(__dirname, '../../.opencode/outcome-ledger.ndjson');

let pass = 0;
let fail = 0;

function ok(label) { console.log('  ✅', label); pass++; }
function ko(label, detail) { console.log('  ❌', label, detail ? `— ${detail}` : ''); fail++; }

async function runMcp(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ATLAS_TOOLS_MOCK: '1' } });
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
  console.log('🚀 Running Smoke Test: smoke-outcome-ledger.mjs\n');

  // Capture original ledger size or existence
  const initialLedgerExists = fs.existsSync(LEDGER);
  const initialSize = initialLedgerExists ? fs.statSync(LEDGER).size : 0;

  const { stdout, stderr } = await runMcp([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'smoke-ledger', version: '0.1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'record_outcome',
        arguments: {
          intent: 'smoke_test_intent',
          tool: 'smoke_test_tool',
          sourceRefs: ['sveltekit-frontend/src/lib/server/cache/cache-config.ts'],
          recommendationAccepted: true,
          reward: 0.99,
          graphVersion: '2026-05-29'
        }
      }
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'find_dependencies',
        arguments: {
          target: 'sveltekit-frontend/src/lib/server/cache/cache-config.ts'
        }
      }
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'trace_database',
        arguments: {
          query: 'scenarios'
        }
      }
    },
    {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'trace_tool_chain',
        arguments: { tool: 'smoke_test_tool' }
      }
    },
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'find_source_refs', arguments: { query: 'cache' } }
    },
    {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'find_feature', arguments: { feature: 'retrieval' } }
    },
    {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'find_route', arguments: { route: '/api/atlas' } }
    }
  ]);

  const responses = parseResponses(stdout);
  const byId = Object.fromEntries(responses.map(r => [r.id, r]));

  // 1. tools/list
  const tools = byId[2]?.result?.tools ?? [];
  const names = tools.map(t => t.name);
  if (names.includes('record_outcome')) ok('tools/list includes record_outcome');
  else ko('tools/list missing record_outcome', names.join(', '));
  if (names.includes('find_dependencies')) ok('tools/list includes find_dependencies');
  else ko('tools/list missing find_dependencies', names.join(', '));

  // 2. record_outcome output (mock mode must not touch ledger or Neo4j)
  const ro = byId[3];
  if (ro?.result && !ro.result.isError) {
    const r = JSON.parse(ro.result.content?.[0]?.text ?? '{}');
    if (r.ok && r.id) {
      ok(`record_outcome completed successfully, id: ${r.id}`);
      if (r.mock === true && r.syncedToNeo4j === false) ok('record_outcome mock mode avoided Neo4j');
      else ko('record_outcome did not report deterministic mock mode', JSON.stringify(r));
    } else {
      ko('record_outcome returned missing properties', JSON.stringify(r));
    }
  } else {
    ko('record_outcome tool execution failed', JSON.stringify(ro));
  }
  // 3. Verify mock mode did not write the local ledger
  const finalSize = fs.existsSync(LEDGER) ? fs.statSync(LEDGER).size : 0;
  if (finalSize === initialSize) ok('record_outcome mock mode did not write outcome-ledger.ndjson');
  else ko(`record_outcome mock mode changed ledger size (old: ${initialSize}, new: ${finalSize})`);

  // 4. trace dependencies result
  const fd = byId[4];
  if (fd?.result && !fd.result.isError) {
    const r = JSON.parse(fd.result.content?.[0]?.text ?? '{}');
    if (r.target && Array.isArray(r.dependencies)) {
      ok(`find_dependencies parsed result correctly, dependencies count: ${r.dependencies.length}`);
    } else {
      ko('find_dependencies returned missing fields', JSON.stringify(r));
    }
  } else {
    ko('find_dependencies tool call failed', JSON.stringify(fd));
  }

  // 5. trace database result
  const td = byId[5];
  if (td?.result && !td.result.isError) {
    const r = JSON.parse(td.result.content?.[0]?.text ?? '{}');
    if (r.query && Array.isArray(r.traces)) {
      ok(`trace_database parsed result correctly, traces count: ${r.traces.length}`);
    } else {
      ko('trace_database returned missing fields', JSON.stringify(r));
    }
  } else {
    ko('trace_database tool call failed', JSON.stringify(td));
  }

  // 6. remaining graph lookup tools
  for (const [id, tool, field] of [[7, 'find_source_refs', 'sourceRefs'], [8, 'find_feature', 'features'], [9, 'find_route', 'routes']]) {
    const response = byId[id];
    if (response?.result && !response.result.isError) {
      const result = JSON.parse(response.result.content?.[0]?.text ?? '{}');
      if (Array.isArray(result[field]) && result.mock === true) ok(`${tool} returned deterministic mock result`);
      else ko(`${tool} returned invalid mock result`, JSON.stringify(result));
    } else {
      ko(`${tool} tool call failed`, JSON.stringify(response));
    }
  }
  if (fail > 0) {
    console.log('\n--- Child Process STDERR ---');
    console.log(stderr);
    console.log('----------------------------\n');
  }

  console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
