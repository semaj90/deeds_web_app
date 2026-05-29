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
        arguments: {
          tool: 'smoke_test_tool'
        }
      }
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

  // 2. record_outcome output
  const ro = byId[3];
  if (ro?.result && !ro.result.isError) {
    const r = JSON.parse(ro.result.content?.[0]?.text ?? '{}');
    if (r.ok && r.id) {
      ok(`record_outcome completed successfully, id: ${r.id}`);
      if (r.syncedToNeo4j) {
        ok('Outcome synced to Neo4j database successfully.');
      } else {
        ko('Outcome failed to sync to Neo4j (warning or offline db).');
      }
    } else {
      ko('record_outcome returned missing properties', JSON.stringify(r));
    }
  } else {
    ko('record_outcome tool execution failed', JSON.stringify(ro));
  }

  // 3. Verify local NDJSON ledger writes
  if (fs.existsSync(LEDGER)) {
    const finalSize = fs.statSync(LEDGER).size;
    if (finalSize > initialSize) {
      ok(`outcome-ledger.ndjson updated successfully (new size: ${finalSize} bytes)`);
    } else {
      ko(`outcome-ledger.ndjson size did not increase (old: ${initialSize}, new: ${finalSize})`);
    }
  } else {
    ko('outcome-ledger.ndjson file does not exist');
  }

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

  if (fail > 0) {
    console.log('\n--- Child Process STDERR ---');
    console.log(stderr);
    console.log('----------------------------\n');
  }

  console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
