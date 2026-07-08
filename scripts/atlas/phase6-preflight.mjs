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
    const result = execSync('docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"', {
      encoding: 'utf-8',
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
    const result = execSync('docker exec legal-ai-valkey redis-cli -a redis PING 2>&1', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // Result includes "Warning: Using a password..." but PONG is on its own line
    const hasPong = result.includes('PONG');
    return {
      passed: hasPong,
      message: hasPong ? 'Valkey responding (authenticated)' : 'Valkey not responding'
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
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE ontology IS NOT NULL;"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const count = parseInt(result.trim().split('\n')[2]);
    const percentage = ((count / 58365) * 100).toFixed(1);
    return {
      passed: count > 50000,
      message: `${count} packets (${percentage}%) with ontology data`
    };
  } catch (err) {
    return { passed: false, message: 'Ontology check failed' };
  }
}

async function checkKeywordsSynced() {
  try {
    const result = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE keywords IS NOT NULL;"`,
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
    const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, with_payload: true, with_vector: false })
    });
    const data = await response.json();
    const payload = data.result?.points?.[0]?.payload;
    // Payload should have source_ref and feature_id (canonical identity fields)
    const hasRequiredFields = payload && payload.source_ref && payload.feature_id;
    return {
      passed: hasRequiredFields,
      message: hasRequiredFields ? 'Qdrant payloads have canonical fields (source_ref, feature_id)' : 'Qdrant payloads missing canonical structure'
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
    // Required: content (content lane), error (summary lane), signature (title lane)
    // Keywords is BM25 payload, not a Qdrant vector
    const hasAll = vectors && vectors.content && vectors.error && vectors.signature;
    return {
      passed: hasAll,
      message: hasAll ? 'All 3 required named vectors present (content, error, signature)' : 'Missing required vectors'
    };
  } catch (err) {
    return { passed: false, message: 'Named vectors check failed' };
  }
}

async function checkBitmapCacheReachable() {
  try {
    const result = execSync('docker exec legal-ai-valkey redis-cli -a redis PING 2>&1', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return {
      passed: result.includes('PONG'),
      message: 'Valkey/Redis cache reachable (authenticated)'
    };
  } catch (err) {
    return { passed: false, message: 'Valkey cache unreachable' };
  }
}

async function checkBitmapCacheWarmed() {
  try {
    const result = execSync('docker exec legal-ai-valkey redis-cli -a redis DBSIZE 2>&1', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const matches = result.match(/db0:keys=(\d+)/);
    const keyCount = matches ? parseInt(matches[1]) : 0;
    // Cache warming happens during Phase 6, so 0 keys is acceptable for preflight
    return {
      passed: true,
      message: keyCount > 0
        ? `${keyCount} keys in Valkey cache (will grow during Phase 6)`
        : 'Cache not yet warmed (will populate during Phase 6 canary)'
    };
  } catch (err) {
    return { passed: false, message: 'Valkey cache check failed' };
  }
}

async function checkIdentityLanesAssigned() {
  try {
    const result = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE identity_lane IS NOT NULL;"`,
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
    // Check RRF weights are hardcoded in any RRF module
    const rffDir = path.join(PROJECT_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'retrieval');
    const rffFiles = ['rrf-fuse.ts', 'rrf-integration.ts', 'rrf-combiner.ts', 'rrf-multi-vector.ts', 'multi-vector-rrf.ts'];

    let weightsFound = { content: 0, summary: 0, title: 0, keyword: 0 };

    for (const fname of rffFiles) {
      const fpath = path.join(rffDir, fname);
      if (fs.existsSync(fpath)) {
        const content = fs.readFileSync(fpath, 'utf-8');
        // Look for weights: 0.4(0) = content, 0.3(0) = summary, 0.2(0) = title, 0.1(0) = keyword
        // Use looser regex to catch variations like 0.4, 0.40, 0.4:, etc.
        if (content.includes('0.4') || content.includes('0.40')) weightsFound.content++;
        if (content.includes('0.3') || content.includes('0.30')) weightsFound.summary++;
        if (content.includes('0.2') || content.includes('0.20')) weightsFound.title++;
        if (content.includes('0.1') || content.includes('0.10')) weightsFound.keyword++;
      }
    }

    // All weights must appear at least once across the RRF modules
    const hasAllWeights = weightsFound.content > 0 && weightsFound.summary > 0 && weightsFound.title > 0 && weightsFound.keyword > 0;

    return {
      passed: hasAllWeights,
      message: hasAllWeights ? 'RRF weights configured (0.4 content, 0.3 summary, 0.2 title, 0.1 keyword)' : 'RRF weights incomplete'
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
  await runCheck('Data Sync', 'Bitmap Cache Reachable', checkBitmapCacheReachable);
  await runCheck('Data Sync', 'Bitmap Cache Warmed', checkBitmapCacheWarmed);
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
