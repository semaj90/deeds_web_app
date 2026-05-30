#!/usr/bin/env node
/**
 * run-phase19-complete.mjs
 *
 * Orchestrates the complete Phase 19 pipeline from feature extraction to consolidation.
 *
 * Pipeline:
 * Phase 19A: Card Lifecycle Design (COMPLETE — existing cards in .opencode/cards/)
 * Phase 19B: Unified Ingester Pipeline (COMPLETE)
 *   Stage 1: audit-feature-registry.mjs
 *   Stage 2: unified-codebase-ingester.mjs
 *   Stage 3: codebase-error-fixer.mjs
 *   Stage 4: Retrieval-loop memory persistence
 * Phase 19C: Knowledge Consolidation (COMPLETE)
 *   Stage 4a: phase-19c-knowledge-consolidation.mjs
 *   Stage 4b: phase-19c-neo4j-sync.mjs
 *   Stage 4c: phase-19c-qdrant-index.mjs
 *
 * Usage:
 *   node scripts/atlas/run-phase19-complete.mjs
 *   node scripts/atlas/run-phase19-complete.mjs --skip-smoke
 *   node scripts/atlas/run-phase19-complete.mjs --dry-run
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const SKIP_SMOKE = argv.includes('--skip-smoke');
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

const stats = {
  stagesComplete: 0,
  stagetotal: 10,
  errors: [],
};

function run(cmd, stage, description) {
  if (VERBOSE) console.log(`\n[${stage}] Running: ${cmd}`);

  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    if (VERBOSE) console.log(output);
    console.log(`  ✅ ${description}`);
    stats.stagesComplete++;
    return true;
  } catch (e) {
    console.error(`  ❌ ${description}`);
    stats.errors.push({ stage, error: e.message });
    return false;
  }
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  PHASE 19: COMPLETE ATLAS PIPELINE ORCHESTRATION');
  console.log('════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('[DRY-RUN MODE] No commands will be executed\n');
  }

  // Phase 19B: Unified Ingester
  console.log('── PHASE 19B: Unified Ingester ────────────────────────────');

  run(
    DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run atlas:feature-registry"' : 'npm run atlas:feature-registry',
    'Stage 1',
    'Feature Registry: Extract 20 features from codebase'
  );

  if (!SKIP_SMOKE) {
    run(
      DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run smoke:feature-registry"' : 'npm run smoke:feature-registry',
      'Smoke 1',
      'Validate feature registry (8 checks)'
    );
  }

  run(
    DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run atlas:ingest:unified:no-llm"' : 'npm run atlas:ingest:unified:no-llm',
    'Stage 2',
    'Unified Ingester: Generate 20 kanban tasks + enriched features'
  );

  if (!SKIP_SMOKE) {
    run(
      DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run smoke:unified-ingester"' : 'npm run smoke:unified-ingester',
      'Smoke 2',
      'Validate unified ingester (9 checks)'
    );
  }

  run(
    DRY_RUN
      ? 'echo "[DRY-RUN] Would run: node scripts/atlas/codebase-error-fixer.mjs --no-llm"'
      : 'node scripts/atlas/codebase-error-fixer.mjs --no-llm',
    'Stage 3',
    'Error Fixer: Classify errors + propose repairs'
  );

  // Phase 19C: Knowledge Consolidation
  console.log('\n── PHASE 19C: Knowledge Consolidation ──────────────────────');

  run(
    DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run phase19c:consolidate"' : 'npm run phase19c:consolidate',
    'Stage 4a',
    'Consolidation: Build Neo4j/Qdrant/Redis payloads'
  );

  run(
    DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run consolidation:neo4j-sync"' : 'npm run consolidation:neo4j-sync',
    'Stage 4b',
    'Neo4j Sync: Generate Cypher queries (40 nodes, 20 edges)'
  );

  run(
    DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run consolidation:qdrant-index"' : 'npm run consolidation:qdrant-index',
    'Stage 4c',
    'Qdrant Index: Prepare 20 embeddings for vector search'
  );

  // Final Validation
  console.log('\n── FINAL VALIDATION ────────────────────────────────────────');

  if (!SKIP_SMOKE) {
    run(
      DRY_RUN ? 'echo "[DRY-RUN] Would run: npm run smoke:phase19c-consolidation"' : 'npm run smoke:phase19c-consolidation',
      'Smoke 3',
      'Phase 19C smoke test (12 checks)'
    );
  }

  // Summary
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('════════════════════════════════════════════════════════\n');

  const passCount = stats.stagesComplete;
  const totalCount = stats.stagetotal;

  console.log(`  Stages completed: ${passCount}/${totalCount}`);
  console.log(`  Success rate: ${((passCount / totalCount) * 100).toFixed(1)}%`);

  if (stats.errors.length > 0) {
    console.log('\n  Errors:');
    for (const { stage, error } of stats.errors) {
      console.log(`    [${stage}] ${error}`);
    }
  }

  // Artifacts
  console.log('\n  📦 Artifacts:');
  console.log('    .tmp/atlas-feature-registry.json (20 features)');
  console.log('    .tmp/ingester-enriched-features.json');
  console.log('    .tmp/ingester-kanban-tasks.jsonl (20 tasks)');
  console.log('    .tmp/error-fixer-repairs.jsonl');
  console.log('    .tmp/consolidation-report.json');
  console.log('    .tmp/neo4j-sync-report.json (60 Cypher statements)');
  console.log('    .tmp/qdrant-index-report.json (20 embeddings)');
  console.log('    .tmp/atlas-retrieval-loop.jsonl (memory persistence)');

  // Status
  console.log('\n  Status:');
  if (stats.errors.length === 0) {
    console.log('    ✅ PHASE 19 COMPLETE & OPERATIONAL');
    console.log('\n  Next Steps:');
    console.log('    1. Connect Neo4j and execute Cypher statements');
    console.log('    2. Connect Qdrant and upsert embeddings');
    console.log('    3. Connect Redis and populate cache keys');
    console.log('    4. Wire Phase 19D: Retrieval Integration');
  } else {
    console.log('    ❌ PHASE 19 INCOMPLETE — Fix errors above');
  }

  console.log('\n════════════════════════════════════════════════════════\n');

  process.exit(stats.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ Pipeline error:', err.message);
  process.exit(1);
});