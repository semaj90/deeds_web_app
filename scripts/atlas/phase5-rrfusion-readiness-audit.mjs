#!/usr/bin/env node
/**
 * Phase 5: RRF Fusion Readiness Audit
 *
 * Unified audit checking three integration stacks:
 * 1. Classifier stack (Naive Bayes + XGBoost feature coverage)
 * 2. Feature coverage stack (ast_symbols, lexical_features, used_concepts, etc.)
 * 3. Retrieval ranking stack (RRF wiring in retrieval path)
 *
 * Exit codes:
 *   0 = all gates PASS
 *   1 = critical blockers (RRF not wired, features missing, models absent)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import pg from 'pg';

const { Pool } = pg;

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '../../..').replace(/^\/([A-Z]:)/, '$1');
const SCRIPTS_ATLAS = join(REPO_ROOT, 'scripts/atlas');
const SVELTEKIT_SRC = join(REPO_ROOT, 'sveltekit-frontend/src');
const SVELTEKIT_SCRIPTS = join(REPO_ROOT, 'sveltekit-frontend/scripts/atlas');
const MODELS_DIR = join(REPO_ROOT, 'models');
const DOCS_DIR = join(REPO_ROOT, 'docs');

const gates = [];
const issues = [];
let criticalBlockers = 0;

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`);
}

function addGate(name, pass, detail = '') {
  gates.push({ name, pass, detail });
  const status = pass ? '✅' : '❌';
  log(`${status} ${name}: ${detail}`, pass ? 'PASS' : 'FAIL');
  if (!pass) criticalBlockers++;
}

function addIssue(severity, title, detail) {
  issues.push({ severity, title, detail });
  log(`[${severity}] ${title}: ${detail}`, 'ISSUE');
}

// ============================================================================
// GATE 1: Classifier Stack (Models + Training Data)
// ============================================================================

async function auditClassifierStack() {
  log('Auditing classifier stack...', 'SECTION');

  // G1a: Naive Bayes model file exists
  const nbModelPath = join(MODELS_DIR, 'naive-bayes-classifier.json');
  const nbExists = existsSync(nbModelPath);
  addGate('G1a: Naive Bayes model artifact', nbExists, nbExists ? nbModelPath : 'NOT FOUND');
  if (!nbExists) {
    addIssue('CRITICAL', 'Missing Naive Bayes model', 'Run: npm run atlas:train:naive-bayes --apply');
  }

  // G1b: XGBoost model file exists
  const xgbModelPath = join(MODELS_DIR, 'xgboost-reranker.ubj');
  const xgbExists = existsSync(xgbModelPath);
  addGate('G1b: XGBoost reranker model', xgbExists, xgbExists ? xgbModelPath : 'NOT FOUND');
  if (!xgbExists) {
    addIssue('CRITICAL', 'Missing XGBoost model', 'Run: npm run atlas:train:xgboost --apply');
  }

  // G1c: Training data exported
  const trainingDataPath = join(REPO_ROOT, '.tmp/semantic-training-rows.ndjson');
  const trainingDataExists = existsSync(trainingDataPath);
  addGate('G1c: Training data export', trainingDataExists, trainingDataExists ? trainingDataPath : 'NOT FOUND');
  if (!trainingDataExists) {
    addIssue('CRITICAL', 'Missing training data', 'Run: npm run atlas:export:semantic-training-rows --apply');
  }

  // G1d: Feature schema exists in DB
  const featureSchemaPath = join(SVELTEKIT_SCRIPTS, 'schema-packet-features.sql');
  const featureSchemaExists = existsSync(featureSchemaPath);
  addGate('G1d: Feature schema migration', featureSchemaExists, featureSchemaExists ? featureSchemaPath : 'NOT FOUND');
  if (!featureSchemaExists) {
    addIssue('CRITICAL', 'Missing feature schema', 'Create drizzle/NNNN_atlas_packet_features.sql');
  }
}

// ============================================================================
// GATE 2: Feature Coverage Stack (DB + Code)
// ============================================================================

async function auditFeatureCoverage() {
  log('Auditing feature coverage stack...', 'SECTION');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
  let client;

  try {
    client = await pool.connect();

    // G2a: Feature table exists
    const { rows: tableCheck } = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS exists",
      ['public.atlas_packet_features']
    );
    const featureTableExists = tableCheck[0]?.exists === true;
    addGate('G2a: atlas_packet_features table', featureTableExists, featureTableExists ? 'table exists' : 'table missing');
    if (!featureTableExists) {
      addIssue('CRITICAL', 'Feature table not created', 'Apply schema migration drizzle/NNNN_atlas_packet_features.sql');
    }

    // G2b: Feature coverage for ast_symbols
    const { rows: astCheck } = await client.query(`
      SELECT COUNT(*) as total, COUNT(ast_symbols) as populated
      FROM atlas_packet_features
      WHERE ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0
    `);
    const astCoverage = astCheck[0]?.total > 0 ? Math.round((astCheck[0]?.populated ?? 0) / astCheck[0]?.total * 100) : 0;
    addGate('G2b: AST symbols coverage', astCoverage >= 70, `${astCoverage}% of packets (target ≥70%)`);
    if (astCoverage < 70) {
      addIssue('MEDIUM', 'Low AST coverage', `Only ${astCoverage}% populated. Run: npm run atlas:extract:ast --apply`);
    }

    // G2c: Feature coverage for lexical_features
    const { rows: lexicalCheck } = await client.query(`
      SELECT COUNT(*) as total, COUNT(lexical_features) as populated
      FROM atlas_packet_features
      WHERE lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0
    `);
    const lexicalCoverage = lexicalCheck[0]?.total > 0 ? Math.round((lexicalCheck[0]?.populated ?? 0) / lexicalCheck[0]?.total * 100) : 0;
    addGate('G2c: Lexical features coverage', lexicalCoverage >= 70, `${lexicalCoverage}% of packets (target ≥70%)`);
    if (lexicalCoverage < 70) {
      addIssue('MEDIUM', 'Low lexical coverage', `Only ${lexicalCoverage}% populated. Run: npm run atlas:extract:lexical --apply`);
    }

    // G2d: Feature coverage for used_concepts
    const { rows: conceptCheck } = await client.query(`
      SELECT COUNT(*) as total, COUNT(used_concepts) as populated
      FROM atlas_packet_features
      WHERE used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0
    `);
    const conceptCoverage = conceptCheck[0]?.total > 0 ? Math.round((conceptCheck[0]?.populated ?? 0) / conceptCheck[0]?.total * 100) : 0;
    addGate('G2d: Used concepts coverage', conceptCoverage >= 60, `${conceptCoverage}% of packets (target ≥60%)`);
    if (conceptCoverage < 60) {
      addIssue('MEDIUM', 'Low concept coverage', `Only ${conceptCoverage}% populated. Run: npm run atlas:extract:concepts --apply`);
    }

    // G2e: Metric table exists
    const { rows: metricsTableCheck } = await client.query(
      "SELECT to_regclass($1) IS NOT NULL AS exists",
      ['public.atlas_packet_metrics']
    );
    const metricsTableExists = metricsTableCheck[0]?.exists === true;
    addGate('G2e: atlas_packet_metrics table', metricsTableExists, metricsTableExists ? 'table exists' : 'table missing');
    if (!metricsTableExists) {
      addIssue('CRITICAL', 'Metrics table not created', 'Apply schema migration drizzle/NNNN_atlas_packet_metrics.sql');
    }

    // G2f: Naive Bayes predictions populated
    if (metricsTableExists) {
      const { rows: nbPredCheck } = await client.query(`
        SELECT COUNT(*) as total, COUNT(naive_bayes_predictions) as populated
        FROM atlas_packet_metrics
        WHERE naive_bayes_predictions IS NOT NULL
      `);
      const nbPredCoverage = nbPredCheck[0]?.total > 0 ? Math.round((nbPredCheck[0]?.populated ?? 0) / nbPredCheck[0]?.total * 100) : 0;
      addGate('G2f: Naive Bayes predictions', nbPredCoverage >= 50, `${nbPredCoverage}% of packets (target ≥50%)`);
      if (nbPredCoverage < 50) {
        addIssue('MEDIUM', 'Low NB predictions', `Only ${nbPredCoverage}% populated. Run: npm run atlas:predict:naive-bayes --apply`);
      }
    }

  } catch (err) {
    addGate('G2*: Database connectivity', false, err.message);
    addIssue('CRITICAL', 'Database connection failed', `Cannot check feature coverage: ${err.message}`);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// ============================================================================
// GATE 3: Retrieval Ranking Stack (RRF Wiring)
// ============================================================================

async function auditRetrievalRanking() {
  log('Auditing retrieval ranking stack...', 'SECTION');

  // G3a: RRF fusion module exists
  const rrfModulePath = join(SVELTEKIT_SRC, 'lib/server/retrieval/rrf-fusion.ts');
  const rrfModuleExists = existsSync(rrfModulePath);
  addGate('G3a: RRF fusion module', rrfModuleExists, rrfModuleExists ? rrfModulePath : 'NOT FOUND');
  if (!rrfModuleExists) {
    addIssue('CRITICAL', 'RRF module missing', `Create ${rrfModulePath}`);
  }

  // G3b: RRF wired into retrieval orchestrator
  const orchestratorPath = join(SVELTEKIT_SRC, 'lib/server/retrieval/index.ts');
  if (existsSync(orchestratorPath)) {
    const orchestratorCode = readFileSync(orchestratorPath, 'utf8');
    const rrfWired = orchestratorCode.includes('fuseRRF') || orchestratorCode.includes('rrf-fusion');
    addGate('G3b: RRF wired in orchestrator', rrfWired, rrfWired ? 'found import/call' : 'NOT FOUND');
    if (!rrfWired) {
      addIssue('CRITICAL', 'RRF not integrated', `Add import and call in ${orchestratorPath}`);
    }
  } else {
    addGate('G3b: RRF wired in orchestrator', false, 'orchestrator not found');
    addIssue('CRITICAL', 'Orchestrator missing', `Create ${orchestratorPath}`);
  }

  // G3c: RRF API endpoint exists
  const rrfApiPath = join(SVELTEKIT_SRC, 'routes/api/retrieval/rrf/+server.ts');
  const rrfApiExists = existsSync(rrfApiPath);
  addGate('G3c: RRF API endpoint', rrfApiExists, rrfApiExists ? rrfApiPath : 'NOT FOUND');
  if (!rrfApiExists) {
    addIssue('MEDIUM', 'RRF endpoint missing', `Create ${rrfApiPath}`);
  }

  // G3d: Signal normalizer exists
  const signalNormalizerPath = join(SVELTEKIT_SRC, 'lib/server/retrieval/signal-normalizer.ts');
  const signalNormalizerExists = existsSync(signalNormalizerPath);
  addGate('G3d: Signal normalizer module', signalNormalizerExists, signalNormalizerExists ? signalNormalizerPath : 'NOT FOUND');
  if (!signalNormalizerExists) {
    addIssue('MEDIUM', 'Signal normalizer missing', `Create ${signalNormalizerPath}`);
  }

  // G3e: RRF tests exist
  const rrfTestPath = join(REPO_ROOT, 'tests/retrieval/rrf-fusion.spec.ts');
  const rrfTestExists = existsSync(rrfTestPath);
  addGate('G3e: RRF test suite', rrfTestExists, rrfTestExists ? rrfTestPath : 'NOT FOUND');
  if (!rrfTestExists) {
    addIssue('LOW', 'RRF tests missing', `Create ${rrfTestPath}`);
  }

  // G3f: Lane separation enforced
  const goretrievalFacadePath = join(SVELTEKIT_SRC, 'lib/server/retrieval/go-retrieval-facade.ts');
  if (existsSync(goretrievalFacadePath)) {
    const facadeCode = readFileSync(goretrievalFacadePath, 'utf8');
    const laneSepWired = facadeCode.includes('retrieval_strategy') || facadeCode.includes('lane_assignment');
    addGate('G3f: Lane separation enforced', laneSepWired, laneSepWired ? 'lane logic present' : 'NOT FOUND');
    if (!laneSepWired) {
      addIssue('MEDIUM', 'Lane separation not enforced', `Wire lane selection logic in ${goretrievalFacadePath}`);
    }
  } else {
    addGate('G3f: Lane separation enforced', false, 'go-retrieval-facade not found');
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport() {
  const passCount = gates.filter(g => g.pass).length;
  const totalCount = gates.length;
  const passRate = Math.round((passCount / totalCount) * 100);

  log('', 'SEPARATOR');
  log('PHASE 5 RRF FUSION READINESS AUDIT REPORT', 'SECTION');
  log('', 'SEPARATOR');

  console.log(`\n📊 Summary: ${passCount}/${totalCount} gates PASS (${passRate}%)\n`);

  console.log('Gates:');
  gates.forEach(g => {
    const icon = g.pass ? '✅' : '❌';
    console.log(`  ${icon} ${g.name}: ${g.detail}`);
  });

  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.forEach(i => {
      const icon = i.severity === 'CRITICAL' ? '🔴' : i.severity === 'MEDIUM' ? '🟡' : '🔵';
      console.log(`  ${icon} [${i.severity}] ${i.title}: ${i.detail}`);
    });
  }

  console.log('\nNext Steps:');
  if (criticalBlockers === 0) {
    console.log('  ✅ All gates PASS. Phase 5 RRF integration ready to execute.');
    console.log('  Recommended: npm run phase5:rrf:integrate --apply');
  } else {
    console.log(`  ❌ ${criticalBlockers} critical blockers. Address these before Phase 5:`);
    issues.filter(i => i.severity === 'CRITICAL').forEach(i => {
      console.log(`     - ${i.title}: ${i.detail}`);
    });
  }

  console.log('\n');
  return criticalBlockers === 0 ? 0 : 1;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log('Phase 5 RRF Fusion Readiness Audit starting...', 'START');
  log(`Repository root: ${REPO_ROOT}`);

  try {
    await auditClassifierStack();
    await auditFeatureCoverage();
    await auditRetrievalRanking();

    const exitCode = generateReport();
    process.exit(exitCode);
  } catch (err) {
    log(`Fatal error: ${err.message}`, 'ERROR');
    console.error(err);
    process.exit(1);
  }
}

main();
