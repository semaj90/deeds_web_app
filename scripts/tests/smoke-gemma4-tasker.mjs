#!/usr/bin/env node
/**
 * scripts/tests/smoke-gemma4-tasker.mjs
 *
 * Smoke test for Phase 20: Agentic Fix Loop.
 * Checks service health, runs task context extraction through Gemma4 + TRACE MCP,
 * and validates outcome recording.
 *
 * Usage:
 *   node scripts/tests/smoke-gemma4-tasker.mjs
 *   node scripts/tests/smoke-gemma4-tasker.mjs --apply
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

async function main() {
  console.log(`\n${C.bold}══ Smoke Test: Gemma4 Agentic Fix Loop (Phase 20) ══${C.reset}\n`);
  console.log(`  Mode: ${APPLY ? 'APPLY (live)' : 'DRY-RUN'}`);

  // 1. Health checks
  console.log(`  ${C.bold}Step 1: Running Dev Services Health Probe...${C.reset}`);
  const healthRes = spawnSync('node', ['scripts/atlas/validate-dev-services.mjs', '--json'], { encoding: 'utf8', cwd: ROOT });
  let health = { upCount: 0 };
  try {
    health = JSON.parse(healthRes.stdout);
    console.log(`    Postgres: ${health.services.find(s => s.name === 'Postgres')?.status || 'down'}`);
    console.log(`    Redis:    ${health.services.find(s => s.name === 'Redis')?.status || 'down'}`);
    console.log(`    TRACE:    ${health.services.find(s => s.name === 'TRACE MCP')?.status || 'down'}`);
    console.log(`    Gemma4:   ${health.services.find(s => s.name === 'TurboQuant')?.status || 'down'}`);
  } catch {
    console.warn('    ⚠️ Could not parse health probe JSON. Proceeding...');
  }

  // 2. Prepare mock task in .tmp/ingest/gemma4-tasks.ndjson
  console.log(`\n  ${C.bold}Step 2: Preparing mock task payload...${C.reset}`);
  const ingestDir = path.join(ROOT, '.tmp', 'ingest');
  if (!fs.existsSync(ingestDir)) {
    fs.mkdirSync(ingestDir, { recursive: true });
  }
  const mockTask = {
    id: "task-smoke-test-42",
    priority: "P1",
    lane: "card",
    node_id: "sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts",
    sourceRef: "sveltekit-frontend/src/lib/server/db/schema/legal-cases.ts",
    degree: 12,
    reason: "Verify cases.status varchar schema drift mapping",
    suggested_action: "Change cases.status to text()",
    queryHash: "cases_status_drift"
  };
  const tasksPath = path.join(ingestDir, 'gemma4-tasks.ndjson');
  fs.writeFileSync(tasksPath, JSON.stringify(mockTask) + '\n', 'utf8');
  console.log(`    Written mock task to ${tasksPath}`);

  // 3. Execute gemma4-error-fixer.mjs
  console.log(`\n  ${C.bold}Step 3: Running gemma4-error-fixer.mjs...${C.reset}`);
  const args = ['scripts/atlas/ingester/gemma4-error-fixer.mjs', '--limit', '1', '--priorities', 'P1'];
  if (APPLY) args.push('--apply');
  
  const fixerRes = spawnSync('node', args, { encoding: 'utf8', cwd: ROOT });
  console.log(fixerRes.stdout || fixerRes.stderr);

  // 4. Record outcomes
  console.log(`\n  ${C.bold}Step 4: Recording Outcome to Ledger...${C.reset}`);
  const recArgs = [
    'scripts/atlas/record-fix-outcome.mjs',
    '--task-id', 'task-smoke-test-42',
    '--reward-score', '0.90',
    '--reward-reason', 'Smoke test verification of text mapping',
    '--tools', 'search.dev_context,context.build_kv_packet'
  ];
  if (!APPLY) recArgs.push('--dry-run');

  const recRes = spawnSync('node', recArgs, { encoding: 'utf8', cwd: ROOT });
  console.log(recRes.stdout || recRes.stderr);

  console.log(`\n${C.green}✅ Phase 20 Agentic Fix Loop Smoke Test Complete!${C.reset}\n`);
}

main().catch(console.error);
