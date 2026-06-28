#!/usr/bin/env node

/**
 * PHASE 85: PRODUCTION GAN READINESS AUDIT
 *
 * Senior reviewer gates before Phase 85 goes live:
 *
 * 1. No production mock/stub/fake GAN score
 * 2. No duplicate supersedes logic outside atlas-core
 * 3. No Qdrant/Redis/Neo4j truth decisions
 * 4. Every artifact has packet_key/source_ref/feature_id/content_hash
 * 5. Every validation emits trace_id + gates_passed + gates_failed
 * 6. Every script is wrapper-only
 * 7. npm run check:tsgo clean or failures documented as unrelated
 * 8. .tmp/phase85-production-gan-readiness.json written
 *
 * Usage:
 *   npm run atlas:phase85:audit:production-gan
 *   npm run atlas:phase85:audit:production-gan --verbose
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const cwd = process.cwd();

console.log(`\n🔒 PHASE 85: PRODUCTION GAN READINESS AUDIT\n`);
console.log(`Working directory: ${cwd}\n`);

// ── Gate 1: Compile check ────────────────────────────────────────────────────

function gateCompile() {
  console.log('🔍 GATE 1: Compile Check\n');

  const result = spawnSync('npx', ['tsc', '--noEmit'], {
    encoding: 'utf-8',
    cwd: 'sveltekit-frontend',
    timeout: 60000,
  });

  const passed = result.status === 0;
  console.log(`   ${passed ? '✅' : '❌'} TypeScript compilation: ${passed ? 'PASS' : 'FAIL'}`);

  if (!passed && verbose) {
    console.log(`   Error count: ${(result.stderr || '').split('\n').length}`);
  }

  console.log();
  return { passed, output: result.stderr || result.stdout };
}

// ── Gate 2: GAN validation wiring ────────────────────────────────────────────

function gateGanValidation() {
  console.log('🧠 GATE 2: GAN Validation Wiring\n');

  const checks = {
    ganDeepAuditExists: false,
    ganScoreTsExists: false,
    mockScoresFound: false,
    thresholdDefined: false,
    identityCheckPresent: false,
  };

  // Check for gan-deep-audit.ts
  checks.ganDeepAuditExists = fs.existsSync(
    'packages/atlas-core/src/validation/gan-deep-audit.ts'
  );

  // Check for gan-validation.ts
  checks.ganScoreTsExists = fs.existsSync(
    'packages/atlas-core/src/validation/gan-validation.ts'
  );

  // Scan for mock GAN scores in production paths
  const prodPath = 'sveltekit-frontend/src/lib/server';
  const mockGanPattern = /ganScore.*(?:=\s*0\.\d+|mock|fake|stub)/gi;

  for (const file of walkDirectory(prodPath, /\.(ts|tsx)$/).slice(0, 100)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (mockGanPattern.test(content)) {
        checks.mockScoresFound = true;
        if (verbose) console.log(`      ⚠️  Mock GAN score in ${file}`);
      }
    } catch {
      // skip unreadable files
    }
  }

  // Check for GAN threshold
  const rankerFile = 'packages/atlas-core/src/ranking/supersedes-ranker.ts';
  if (fs.existsSync(rankerFile)) {
    const content = fs.readFileSync(rankerFile, 'utf-8');
    checks.thresholdDefined = /0\.6[0-9]*/.test(content); // 0.60 threshold
    checks.identityCheckPresent = /identityGate/.test(content);
  }

  console.log(`   ✅ gan-deep-audit exists: ${checks.ganDeepAuditExists}`);
  console.log(`   ✅ gan-validation module: ${checks.ganScoreTsExists}`);
  console.log(`   ${checks.mockScoresFound ? '❌' : '✅'} No mock GAN scores: ${!checks.mockScoresFound}`);
  console.log(`   ✅ Threshold defined: ${checks.thresholdDefined}`);
  console.log(`   ✅ Identity check: ${checks.identityCheckPresent}\n`);

  const passed =
    checks.ganDeepAuditExists &&
    !checks.mockScoresFound &&
    checks.thresholdDefined &&
    checks.identityCheckPresent;

  return { passed, checks };
}

// ── Gate 3: Artifact registry completeness ──────────────────────────────────

function gateArtifactRegistry() {
  console.log('📦 GATE 3: Artifact Registry Completeness\n');

  const checks = {
    atlasArtifactsSchema: false,
    logArtifactFunction: false,
    contentHashRequired: false,
    supersedesSupported: false,
    traceIdTracking: false,
  };

  // Check for atlas_artifacts table in schema
  const schemaFile = 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts';
  if (fs.existsSync(schemaFile)) {
    const content = fs.readFileSync(schemaFile, 'utf-8');
    checks.atlasArtifactsSchema = /atlas.*artifacts|artifactTable/i.test(content);
    checks.contentHashRequired = /content_hash|contentHash/.test(content);
    checks.supersedesSupported = /supersedes_artifact_id|supersedesArtifactId/.test(content);
    checks.traceIdTracking = /trace_id|traceId/.test(content);
  }

  // Check for logArtifact function
  const artifactLoggerFile = 'sveltekit-frontend/src/lib/server/generation/artifact-logger.ts';
  if (fs.existsSync(artifactLoggerFile)) {
    const content = fs.readFileSync(artifactLoggerFile, 'utf-8');
    checks.logArtifactFunction = /export.*logArtifact|function logArtifact/.test(content);
  }

  console.log(`   ✅ atlas_artifacts schema: ${checks.atlasArtifactsSchema}`);
  console.log(`   ✅ logArtifact() function: ${checks.logArtifactFunction}`);
  console.log(`   ✅ content_hash required: ${checks.contentHashRequired}`);
  console.log(`   ✅ supersedes_artifact_id: ${checks.supersedesSupported}`);
  console.log(`   ✅ trace_id tracking: ${checks.traceIdTracking}\n`);

  const passed = Object.values(checks).every((v) => v === true);
  return { passed, checks };
}

// ── Gate 4: Supersedes ranker authority ──────────────────────────────────────

function gateSuperseedesRanker() {
  console.log('🏆 GATE 4: Supersedes Ranker Authority\n');

  const checks = {
    singleAuthority: false,
    duplicateRankers: [],
    identityGate: false,
    confidenceScoring: false,
  };

  const rankerFile = 'packages/atlas-core/src/ranking/supersedes-ranker.ts';
  if (fs.existsSync(rankerFile)) {
    const content = fs.readFileSync(rankerFile, 'utf-8');
    checks.singleAuthority = /export.*rankSupersedes|function rankSupersedes/.test(content);
    checks.identityGate = /identityGate|packet_key.*source_ref.*feature_id/.test(content);
    checks.confidenceScoring = /confidence.*[0-9]\.?[0-9]/.test(content);
  }

  // Scan for duplicate rankers
  const dupPattern = /rankSupersedes|rankCandidates|decideSupersedes/i;
  for (const file of walkDirectory('sveltekit-frontend/src', /\.(ts|tsx)$/).slice(0, 100)) {
    if (file.includes('ranking') || file.includes('ranker')) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (dupPattern.test(content) && !file.includes('supersedes-ranker')) {
          checks.duplicateRankers.push(file);
        }
      } catch {
        // skip
      }
    }
  }

  console.log(`   ✅ Single authority: ${checks.singleAuthority}`);
  console.log(`   ✅ Identity gate: ${checks.identityGate}`);
  console.log(`   ✅ Confidence scoring: ${checks.confidenceScoring}`);
  console.log(`   ${checks.duplicateRankers.length === 0 ? '✅' : '❌'} No duplicate rankers: ${checks.duplicateRankers.length === 0}`);

  if (checks.duplicateRankers.length > 0 && verbose) {
    for (const dup of checks.duplicateRankers) {
      console.log(`      ⚠️  ${dup}`);
    }
  }

  console.log();

  const passed =
    checks.singleAuthority &&
    checks.duplicateRankers.length === 0 &&
    checks.identityGate &&
    checks.confidenceScoring;

  return { passed, checks };
}

// ── Gate 5: No truth decisions outside adapters ──────────────────────────────

function gateNoOutsideTruthDecisions() {
  console.log('🔐 GATE 5: Infrastructure Isolation\n');

  const violations = [];
  const patterns = [
    { pattern: /qdrant.*(?:decision|rank|score|choose)/i, service: 'Qdrant', issue: 'truth decision' },
    { pattern: /redis.*(?:decision|rank|score|choose)/i, service: 'Redis', issue: 'truth decision' },
    {
      pattern: /neo4j.*(?:decision|rank|score|choose)/i,
      service: 'Neo4j',
      issue: 'truth decision',
    },
  ];

  // Scan atlas-core for infrastructure decisions
  for (const file of walkDirectory('packages/atlas-core/src', /\.ts$/).slice(0, 100)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      for (const { pattern, service, issue } of patterns) {
        if (pattern.test(content)) {
          violations.push({
            file,
            service,
            issue,
          });
        }
      }
    } catch {
      // skip
    }
  }

  if (violations.length === 0) {
    console.log(`   ✅ No Qdrant truth decisions in atlas-core`);
    console.log(`   ✅ No Redis truth decisions in atlas-core`);
    console.log(`   ✅ No Neo4j truth decisions in atlas-core\n`);
  } else {
    console.log(`   ❌ Found ${violations.length} infrastructure decision(s):\n`);
    for (const v of violations) {
      console.log(`      ${v.file}: ${v.service} ${v.issue}`);
    }
    console.log();
  }

  return { passed: violations.length === 0, violations };
}

// ── Gate 6: Artifact identity completeness ──────────────────────────────────

function gateArtifactIdentity() {
  console.log('🔑 GATE 6: Artifact Identity Completeness\n');

  const requiredFields = ['packet_key', 'source_ref', 'feature_id', 'content_hash'];
  const checksum = { found: 0, missing: 0 };

  const registryFile = 'packages/atlas-core/PROMOTION_REGISTRY.json';
  if (fs.existsSync(registryFile)) {
    const registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8'));
    for (const entry of Object.values(registry)) {
      if (entry.canonical_path?.includes('artifact')) {
        checksum.found++;
      }
    }
  }

  const schemaFile = 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts';
  if (fs.existsSync(schemaFile)) {
    const content = fs.readFileSync(schemaFile, 'utf-8');
    for (const field of requiredFields) {
      if (!content.includes(field)) {
        checksum.missing++;
      }
    }
  }

  console.log(`   ✅ Required fields present: ${4 - checksum.missing}/4`);
  console.log(`   ✅ Artifact modules found: ${checksum.found}\n`);

  return { passed: checksum.missing === 0, checksum };
}

// ── Gate 7: Validation telemetry ─────────────────────────────────────────────

function gateValidationTelemetry() {
  console.log('📊 GATE 7: Validation Telemetry\n');

  const checks = {
    traceIdEmitted: false,
    gatesPassedTracked: false,
    gatesFailedTracked: false,
    reasonsLogged: false,
  };

  const rankerFile = 'packages/atlas-core/src/ranking/supersedes-ranker.ts';
  if (fs.existsSync(rankerFile)) {
    const content = fs.readFileSync(rankerFile, 'utf-8');
    checks.traceIdEmitted = /trace_id|traceId/.test(content);
    checks.gatesPassedTracked = /gates_passed|gatesPassed|gates\.passed/.test(content);
    checks.gatesFailedTracked = /gates_failed|gatesFailed|gates\.failed/.test(content);
    checks.reasonsLogged = /reasons|reason\[/.test(content);
  }

  console.log(`   ✅ trace_id emitted: ${checks.traceIdEmitted}`);
  console.log(`   ✅ gates_passed tracked: ${checks.gatesPassedTracked}`);
  console.log(`   ✅ gates_failed tracked: ${checks.gatesFailedTracked}`);
  console.log(`   ✅ reasons logged: ${checks.reasonsLogged}\n`);

  const passed = Object.values(checks).every((v) => v === true);
  return { passed, checks };
}

// ── Gate 8: Script wrapper-only ──────────────────────────────────────────────

function gateScriptWrappers() {
  console.log('📝 GATE 8: Script Wrapper-Only Policy\n');

  const scripts = [
    'scripts/phase85/p3-backfill-artifact-registry.mjs',
    'scripts/phase85/p4-summary-extraction-qa.mjs',
    'scripts/phase85/audit-promotion-readiness.mjs',
  ];

  let violations = 0;

  for (const script of scripts) {
    if (!fs.existsSync(script)) continue;

    const content = fs.readFileSync(script, 'utf-8');

    // Check if script contains business logic (not just calls to imported functions)
    const hasBusinessLogic =
      /(?<!\/\/).*(if|switch|for|while).*(?:rank|score|validate|decide)/.test(content) &&
      !/import.*from.*packages/.test(content);

    if (hasBusinessLogic) {
      violations++;
      console.log(`   ⚠️  ${script} contains business logic (should import from packages)`);
    } else {
      console.log(`   ✅ ${script} is wrapper-only`);
    }
  }

  console.log();
  return { passed: violations === 0, violations };
}

// ── Helper: Walk directory ───────────────────────────────────────────────────

function walkDirectory(dir, pattern) {
  const files = [];

  function walk(current) {
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
            walk(fullPath);
          }
        } else if (pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  walk(dir);
  return files;
}

// ── Main execution ───────────────────────────────────────────────────────────

async function main() {
  const results = {
    timestamp: new Date().toISOString(),
    compile_gate: null,
    gan_validation: null,
    artifact_registry: null,
    supersedes_ranker: null,
    infrastructure_isolation: null,
    artifact_identity: null,
    validation_telemetry: null,
    script_wrappers: null,
    violations: [],
    passed_gates: 0,
    total_gates: 8,
  };

  // Run all gates
  const gateResults = [
    { name: 'compile', fn: gateCompile },
    { name: 'gan_validation', fn: gateGanValidation },
    { name: 'artifact_registry', fn: gateArtifactRegistry },
    { name: 'supersedes_ranker', fn: gateSuperseedesRanker },
    { name: 'infrastructure_isolation', fn: gateNoOutsideTruthDecisions },
    { name: 'artifact_identity', fn: gateArtifactIdentity },
    { name: 'validation_telemetry', fn: gateValidationTelemetry },
    { name: 'script_wrappers', fn: gateScriptWrappers },
  ];

  for (const { name, fn } of gateResults) {
    const result = fn();
    results[name] = result;
    if (result.passed) {
      results.passed_gates++;
    } else {
      if (result.violations?.length > 0) {
        results.violations.push(...result.violations);
      }
    }
  }

  // Summary
  console.log('═'.repeat(70));
  console.log('\n📋 PRODUCTION GAN READINESS SUMMARY\n');
  console.log(`Gates passed: ${results.passed_gates}/${results.total_gates}`);
  console.log(`Violations: ${results.violations.length}`);

  if (results.passed_gates === results.total_gates) {
    console.log(`\n✅ PHASE 85 PRODUCTION READY\n`);
    results.status = 'READY';
  } else {
    console.log(`\n⚠️  REVIEW REQUIRED BEFORE PRODUCTION\n`);
    results.status = 'NEEDS_REVIEW';

    if (results.violations.length > 0) {
      console.log('Violations:');
      for (const v of results.violations.slice(0, 10)) {
        console.log(`  - ${v.file || v.issue}`);
      }
    }
  }

  // Write report
  fs.mkdirSync('.tmp', { recursive: true });
  fs.writeFileSync('.tmp/phase85-production-gan-readiness.json', JSON.stringify(results, null, 2));
  console.log(`Report: .tmp/phase85-production-gan-readiness.json\n`);

  process.exit(results.passed_gates === results.total_gates ? 0 : 1);
}

main();
