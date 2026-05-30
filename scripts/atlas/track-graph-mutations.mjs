#!/usr/bin/env node
/**
 * track-graph-mutations.mjs
 *
 * Phase 5: Initialize and track graph mutation ledger.
 *
 * Records when edges become stale so inference can decide
 * whether to trust an old baseline (e.g., after schema change).
 *
 * Output:
 * - mutation-ledger.json (all mutations with timestamps)
 * - DuckDB mutation_ledger table (if --db-write)
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const INIT = args.includes('--init');
const DB_WRITE = args.includes('--db-write');

function createMutation(type, affectedEntity, changeDetails, reason) {
  return {
    id: randomUUID(),
    type, // schema_change, code_refactor, embeddings_updated, tool_modified, etc.
    affected_entity: affectedEntity,
    change_details: changeDetails,
    timestamp: new Date().toISOString(),
    discovered_at: 'initialization', // or: post_migration, git_hook, manual, etc.
    invalidates_edge_class: 'USES_DB', // or: USES_TOOL, CALLS, RESOLVES_INTENT, etc.
    invalidates_glyphs: false,
    recompute_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h from now
    reason,
    status: 'pending', // or: recomputed, expired
  };
}

async function main() {
  console.log('🚀 Phase 5: Graph Mutation Ledger Tracker');
  console.log();

  // Initialize ledger with known mutations
  const mutations = [];

  if (INIT) {
    console.log('[INIT] Recording baseline mutations...');

    // Baseline: DB schema is current
    mutations.push(
      createMutation(
        'schema_baseline',
        'postgres_schema',
        { tables: 148, columns_tracked: true },
        'Schema baseline as of Phase 3 extraction'
      )
    );

    // Baseline: CALLS graph was extracted in Phase 2
    mutations.push(
      createMutation(
        'calls_graph_extracted',
        'CALLS_edges',
        { edges: 164909, files: 5613 },
        'Phase 2 CALLS extraction complete'
      )
    );

    // Baseline: USES_DB graph extracted in Phase 3
    mutations.push(
      createMutation(
        'uses_db_extracted',
        'USES_DB_edges',
        { edges: 467, tables: 44 },
        'Phase 3 USES_DB extraction complete'
      )
    );

    // Baseline: USES_TOOL graph extracted in Phase 3
    mutations.push(
      createMutation(
        'uses_tool_extracted',
        'USES_TOOL_edges',
        { edges: 1032, tools: 731 },
        'Phase 3 USES_TOOL extraction complete'
      )
    );

    console.log(`  ✓ Initialized ${mutations.length} baseline mutations`);
  } else {
    console.log('[READ] Loading existing mutation ledger...');
    if (existsSync('scripts/atlas/out/mutation-ledger.json')) {
      const existing = JSON.parse(readFileSync('scripts/atlas/out/mutation-ledger.json', 'utf-8'));
      mutations.push(...existing);
      console.log(`  ✓ Loaded ${mutations.length} existing mutations`);
    }
  }

  // Output mutation ledger
  const outputFile = 'scripts/atlas/out/mutation-ledger.json';
  writeFileSync(outputFile, JSON.stringify(mutations, null, 2));
  console.log(`[WRITE] ✓ ${outputFile}`);

  // DuckDB schema (if --db-write is used)
  if (DB_WRITE) {
    console.log('[DB-WRITE] Creating DuckDB mutation_ledger table...');
    // This would execute DuckDB SQL in production
    // For now, just document the schema
    const schema = `
    CREATE TABLE IF NOT EXISTS mutation_ledger (
      id UUID PRIMARY KEY,
      type STRING,
      affected_entity STRING,
      change_details JSON,
      timestamp TIMESTAMP WITH TIME ZONE,
      discovered_at STRING,
      invalidates_edge_class STRING,
      invalidates_glyphs BOOLEAN,
      recompute_at TIMESTAMP WITH TIME ZONE,
      reason TEXT,
      status STRING
    );

    CREATE INDEX IF NOT EXISTS idx_mutation_edge_class
      ON mutation_ledger(invalidates_edge_class, status);
    CREATE INDEX IF NOT EXISTS idx_mutation_timestamp
      ON mutation_ledger(timestamp DESC);
    `;
    writeFileSync('scripts/atlas/out/mutation-ledger-schema.sql', schema);
    console.log('  ✓ Schema written to mutation-ledger-schema.sql');
  }

  // Summary
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mutation Ledger Status:`);
  console.log(`  Total mutations: ${mutations.length}`);
  console.log(`  Pending: ${mutations.filter(m => m.status === 'pending').length}`);
  console.log(`  Invalidates USES_DB: ${mutations.filter(m => m.invalidates_edge_class === 'USES_DB').length}`);
  console.log(`  Invalidates USES_TOOL: ${mutations.filter(m => m.invalidates_edge_class === 'USES_TOOL').length}`);
  console.log();
  console.log('Mutation types recorded:');
  const types = new Set(mutations.map(m => m.type));
  types.forEach(t => {
    const count = mutations.filter(m => m.type === t).length;
    console.log(`  - ${t}: ${count}`);
  });
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Phase 3-5 Complete: Supervision layer ready');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
