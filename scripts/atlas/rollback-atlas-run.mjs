#!/usr/bin/env node
/**
 * rollback-atlas-run.mjs
 *
 * Removes data persisted during a specific atlas/karpathy run.
 * Targets:
 *   - Redis (keys with runId)
 *   - CouchDB (docs with runId)
 *   - Neo4j (nodes/edges with runId)
 *   - Qdrant (points or payload patches with runId)
 *
 * Usage:
 *   node scripts/atlas/rollback-atlas-run.mjs --runId atlas-scale-500-001 --dry-run
 */

import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const runId = args.find(a => a.startsWith('--runId='))?.split('=')[1] || args[args.indexOf('--runId') + 1];
const DRY_RUN = args.includes('--dry-run');

if (!runId) {
  console.error('Usage: node rollback-atlas-run.mjs --runId <id> [--dry-run]');
  process.exit(1);
}

console.log(`[rollback] target: ${runId} | dry_run: ${DRY_RUN}\n`);

async function rollback() {
  // 1. Redis Cleanup
  console.log('--- Redis ---');
  console.log(`[plan] Scan and DEL keys matching *:${runId}* or containing ${runId} in payload.`);
  
  // 2. Neo4j Cleanup
  console.log('\n--- Neo4j ---');
  console.log(`[plan] MATCH (n {runId: "${runId}"}) DETACH DELETE n`);
  console.log(`[plan] MATCH ()-[r {runId: "${runId}"}]->() DELETE r`);

  // 3. Qdrant Cleanup
  console.log('\n--- Qdrant ---');
  console.log(`[plan] Clear payload fields set during ${runId} (requires scroll + set_payload)`);
  console.log(`[plan] DELETE points created during ${runId} (kind: "directory-cluster", runId: "${runId}")`);

  // 4. CouchDB Cleanup
  console.log('\n--- CouchDB ---');
  console.log(`[plan] Find docs where runId == "${runId}" via by_runId view and mark as _deleted: true`);

  if (DRY_RUN) {
    console.log('\n[dry-run] No changes were made.');
  } else {
    console.warn('\n[warn] Rollback execution not yet implemented. Use manual psql/cypher for now.');
  }
}

rollback().catch(console.error);
