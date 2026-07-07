#!/usr/bin/env node

/**
 * Phase 6 Preflight Check
 *
 * Verifies all infrastructure, data synchronization, and retrieval readiness
 * before enabling canary traffic ramp.
 *
 * Exit codes:
 *   0 = all checks pass, safe to proceed with canary
 *   1 = one or more checks failed, do NOT proceed
 *
 * Usage:
 *   node phase6-preflight.mjs [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const VERBOSE = process.argv.includes('--verbose');

const checks = {};
let allPass = true;

function log(category, check, passed, message) {
  if (!checks[category]) checks[category] = [];
  checks[category].push({ check, passed, message });

  if (VERBOSE || !passed) {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${category}] ${check}: ${message}`);
  }

  if (!passed) allPass = false;
}

async function runCheck(category, checkName, testFn) {
  try {
    const result = await testFn();
    log(category, checkName, result.passed, result.message);
  } catch (err) {
    log(category, checkName, false, `Exception: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE HEALTH
// ════════════════════════════════════════════════════════════════════════════

async function checkPostgres() {
  try {
    const result = execSync('psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });
    const count = parseInt(result.trim().split('\n')[2]);
    return {
      passed: count > 50000,
      message: `${count} packets in database`
    };
  } catch (err) {
    return { passed: false, message: 'Postgres unavailable or query failed' };
  }
}

async function checkValkey() {
  try {
    const result = execSync('redis-cli PING', {
      encoding: 'utf-8',
      timeout: 5000
    });
    return {
      passed: result.trim() === 'PONG',
      message: 'Valkey responding'
    };
  } catch (err) {
    return { passed: false, message: 'Valkey unavailable' };
  }
}

async function checkQdrant() {
  try {
    const response = await fetch('http://127.0.0.1:6333/');
    return {
      passed: response.ok,
      message: 'Qdrant responding'
    };
  } catch (err) {
    return { passed: false, message: 'Qdrant unavailable' };
  }
}

async function checkNeo4j() {
  try {
    const response = await fetch('http://127.0.0.1:7474');
    return {
      passed: response.ok || response.status === 401, // 401 is expected (auth required)
      message: 'Neo4j responding'
    };
  } catch (err) {
    return { passed: false, message: 'Neo4j unavailable' };
  }
}

async function checkGoRetrieval() {
  try {
    const response = await fetch('http://127.0.0.1:8100/health');
    return {
      passed: response.ok,
      message: 'Go Retrieval responding'
    };
  } catch (err) {
    return { passed: false, message: 'Go Retrieval unavailable' };
  }
}

async function checkGemma4() {
  try {
    const response = await fetch('http://127.0.0.1:8090/v1/models');
    const data = await response.json();
    return {
      passed: response.ok && data.data && data.data.length > 0,
      message: `${data.data?.length || 0} models available`
    };
  } catch (err) {
    return { passed: false, message: 'Gemma4 unavailable (non-blocking if retrieval-only)' };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DATA SYNCHRONIZATION
// ════════════════════════════════════════════════════════════════════════════

async function checkOntologySynced() {
  try {
    const result = execSync(
      `psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE ontology_tuples IS NOT NULL AND array_length(ontology_tuples, 1) > 0;"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const count = parseInt(result.trim().split('\n')[2]);
    const percentage = ((count / 58365) * 100).toFixed(1);
    return {
      passed: count > 50000,
      message: `${count} packets (${percentage}%) with ontology tuples`
    };
  } catch (err) {
    return { passed: false, message: 'Ontology check failed' };
  }
}

async function checkKeywordsSynced() {
  try {
    const result = execSync(
      `psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT packet_key) FROM packet_keywords;"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const count = parseInt(result.trim().split('\n')[2]);
    return {
      passed: count > 40000,
      message: `${count} packets with keywords indexed`
    };
  } catch (err) {
    return { passed: false, message: 'Keyword index check failed' };
  }
}

async function checkQdrantPayloads() {
  try {
    const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/1');
    const data = await response.json();
    const payload = data.result?.payload;
    const hasRequiredFields = payload && payload.derived_title && payload.keywords;
    return {
      passed: hasRequiredFields,
      message: hasRequiredFields ? 'Qdrant payloads enriched' : 'Qdrant payloads missing enrichment'
    };
  } catch (err) {
    return { passed: false, message: 'Qdrant payload check failed' };
  }
}

async function checkNamedVectorsPresent() {
  try {
    const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768');
    const data = await response.json();
    const vectors = data.result?.config?.params?.vectors;
    const hasAll = vectors && vectors.content && vectors.summary && vectors.title && vectors.keywords;
    return {
      passed: hasAll,
      message: hasAll ? 'All 4 named vectors present' : 'Missing named vectors'
    };
  } catch (err) {
    return { passed: false, message: 'Named vectors check failed' };
  }
}

async function checkBitmapCacheWarmed() {
  try {
    const result = execSync('redis-cli DBSIZE', {
      encoding: 'utf-8',
      timeout: 5000
    });
    const matches = result.match(/db0:keys=(\d+)/);
    const keyCount = matches ? parseInt(matches[1]) : 0;
    return {
      passed: keyCount > 1000,
      message: `${keyCount} keys in Redis`
    };
  } catch (err) {
    return { passed: false, message: 'Redis cache check failed' };
  }
}

async function checkIdentityLanesAssigned() {
  try {
    const result = execSync(
      `psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE identity_lane IS NOT NULL;"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const count = parseInt(result.trim().split('\n')[2]);
    const percentage = ((count / 58365) * 100).toFixed(1);
    return {
      passed: count > 50000,
      message: `${count} packets (${percentage}%) with identity lane assigned`
    };
  } catch (err) {
    return { passed: false, message: 'Identity lane check failed' };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RETRIEVAL READINESS
// ════════════════════════════════════════════════════════════════════════════

async function checkRRFConfiguration() {
  try {
    const configFile = path.join(PROJECT_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval', 'rrf-weights.json');
    if (!fs.existsSync(configFile)) {
      return { passed: false, message: 'RRF weights config not found' };
    }
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    const weightSum = (config.content + config.summary + config.title + config.keywords).toFixed(2);
    return {
      passed: Math.abs(parseFloat(weightSum) - 1.0) < 0.01,
      message: `RRF weights sum to ${weightSum}`
    };
  } catch (err) {
    return { passed: false, message: 'RRF configuration check failed' };
  }
}

async function checkFeatureFlagLogic() {
  try {
    const facadeFile = path.join(PROJECT_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval', 'go-retrieval-facade.ts');
    const content = fs.readFileSync(facadeFile, 'utf-8');
    const hasTrafficRampConfig = content.includes('TRAFFIC_RAMP_CONFIG');
    const hasCanaryLogic = content.includes('MULTI_VECTOR_CANARY_PERCENT');
    return {
      passed: hasTrafficRampConfig && hasCanaryLogic,
      message: 'Feature flag logic wired'
    };
  } catch (err) {
    return { passed: false, message: 'Feature flag check failed' };
  }
}

async function checkRollbackPath() {
  try {
    const rampScript = path.join(PROJECT_ROOT, 'scripts', 'atlas', 'phase6-traffic-ramp-control.mjs');
    if (!fs.existsSync(rampScript)) {
      return { passed: false, message: 'Ramp control script not found' };
    }
    const content = fs.readFileSync(rampScript, 'utf-8');
    const hasRollback = content.includes("case 'rollback'");
    return {
      passed: hasRollback,
      message: 'Rollback path implemented'
    };
  } catch (err) {
    return { passed: false, message: 'Rollback path check failed' };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runPreflightChecks() {
  console.log(`
${'═'.repeat(80)}
Phase 6 Preflight Check
${'═'.repeat(80)}
  `);

  // Infrastructure
  await runCheck('Infrastructure', 'Postgres', checkPostgres);
  await runCheck('Infrastructure', 'Valkey', checkValkey);
  await runCheck('Infrastructure', 'Qdrant', checkQdrant);
  await runCheck('Infrastructure', 'Neo4j', checkNeo4j);
  await runCheck('Infrastructure', 'Go Retrieval', checkGoRetrieval);
  await runCheck('Infrastructure', 'Gemma4', checkGemma4);

  // Data Synchronization
  await runCheck('Data Sync', 'Ontology Tables', checkOntologySynced);
  await runCheck('Data Sync', 'Keywords Indexed', checkKeywordsSynced);
  await runCheck('Data Sync', 'Qdrant Payloads', checkQdrantPayloads);
  await runCheck('Data Sync', 'Named Vectors', checkNamedVectorsPresent);
  await runCheck('Data Sync', 'Bitmap Cache', checkBitmapCacheWarmed);
  await runCheck('Data Sync', 'Identity Lanes', checkIdentityLanesAssigned);

  // Retrieval Readiness
  await runCheck('Retrieval', 'RRF Configuration', checkRRFConfiguration);
  await runCheck('Retrieval', 'Feature Flag Logic', checkFeatureFlagLogic);
  await runCheck('Retrieval', 'Rollback Path', checkRollbackPath);

  // Summary
  console.log(`
${'═'.repeat(80)}
Preflight Summary
${'═'.repeat(80)}
  `);

  Object.entries(checks).forEach(([category, items]) => {
    const passed = items.filter(i => i.passed).length;
    const total = items.length;
    const icon = passed === total ? '✅' : '⚠️';
    console.log(`${icon} ${category}: ${passed}/${total} passed`);
  });

  console.log(`
${'═'.repeat(80)}
Result: ${allPass ? '✅ READY FOR CANARY' : '❌ BLOCKING ISSUES FOUND'}
${'═'.repeat(80)}
  `);

  if (!allPass) {
    console.log('\nFailing checks:');
    Object.entries(checks).forEach(([category, items]) => {
      items.filter(i => !i.passed).forEach(item => {
        console.log(`  ❌ [${category}] ${item.check}: ${item.message}`);
      });
    });
  }

  process.exit(allPass ? 0 : 1);
}

runPreflightChecks().catch(err => {
  console.error('❌ Preflight check crashed:', err.message);
  process.exit(1);
});
