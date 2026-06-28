#!/usr/bin/env node

/**
 * PHASE 85: PROMOTION READINESS AUDIT
 *
 * Validates that Phase 85 code is ready for promotion from:
 *   scripts/phase85/ → packages/atlas-core/ → packages/parent-atlas/ → sveltekit-frontend/
 *
 * Checklist per file:
 *   1. Duplicate implementation already exists?     → Supersede it
 *   2. Same algorithm in two places?                → Merge into atlas-core
 *   3. Script only wraps logic?                     → Keep in scripts
 *   4. Uses HTTP/UI?                                → Keep in SvelteKit
 *   5. Talks to DB?                                 → Use adapter
 *   6. Makes business decision?                     → Move to atlas-core
 *
 * Usage:
 *   npm run atlas:phase85:audit:promotion
 *   npm run atlas:phase85:audit:promotion --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const registryPath = 'packages/atlas-core/PROMOTION_REGISTRY.json';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

console.log(`\n📋 PHASE 85: PROMOTION READINESS AUDIT\n`);
console.log(`Registry: ${registryPath}`);
console.log(`Entries: ${Object.keys(registry).length}\n`);

// ── Step 1: Check duplicate implementations ──────────────────────────────────

function checkDuplicateImplementations() {
  console.log('🔍 DUPLICATE DETECTION\n');

  const duplicates = [];

  for (const [name, entry] of Object.entries(registry)) {
    if (entry.duplicates?.length > 0) {
      duplicates.push({
        name,
        canonical: entry.canonical,
        duplicates: entry.duplicates,
      });
    }
  }

  if (duplicates.length === 0) {
    console.log('   ✅ No duplicate implementations detected\n');
    return { count: 0, files: [] };
  }

  console.log(`   ⚠️  Found ${duplicates.length} entries with duplicates:\n`);
  for (const dup of duplicates) {
    console.log(`   ${dup.name}`);
    console.log(`      Canonical: ${dup.canonical}`);
    for (const file of dup.duplicates) {
      console.log(`      Duplicate: ${file}`);
    }
  }
  console.log();

  return { count: duplicates.length, files: duplicates };
}

// ── Step 2: Validate file locations ──────────────────────────────────────────

function validateFileLocations() {
  console.log('📂 FILE LOCATION VALIDATION\n');

  const missing = [];
  const found = [];

  for (const [name, entry] of Object.entries(registry)) {
    if (!entry.current_location) continue;

    const exists = fs.existsSync(entry.current_location);
    if (exists) {
      found.push({ name, location: entry.current_location });
    } else {
      missing.push({ name, location: entry.current_location });
    }
  }

  console.log(`   Found: ${found.length}`);
  console.log(`   Missing: ${missing.length}\n`);

  if (missing.length > 0 && verbose) {
    console.log('   ⚠️  Missing files:');
    for (const file of missing) {
      console.log(`      ${file.name}: ${file.location}`);
    }
    console.log();
  }

  return { found, missing };
}

// ── Step 3: Assess promotion readiness ───────────────────────────────────────

function assessPromotionReadiness() {
  console.log('🚀 PROMOTION READINESS ASSESSMENT\n');

  const readyForAtlasCore = [];
  const readyForParentAtlas = [];
  const keepInScripts = [];
  const needsRefactoring = [];
  const pendingCreation = [];

  for (const [name, entry] of Object.entries(registry)) {
    const verdict = entry.supersession_review?.verdict;

    switch (verdict) {
      case 'MOVE_TO_ATLAS_CORE':
      case 'ALREADY_IN_ATLAS_CORE':
      case 'MOVE_TO_ATLAS_CORE_WITH_ADAPTER':
        readyForAtlasCore.push(name);
        break;
      case 'CREATE_IN_PARENT_ATLAS':
        readyForParentAtlas.push(name);
        break;
      case 'KEEP_IN_SCRIPTS_AS_CLI_WRAPPER':
      case 'KEEP_IN_SCRIPTS_AS_CLI_TOOL':
        keepInScripts.push(name);
        break;
      case 'SPLIT_LOGIC_AND_ADAPTERS':
        needsRefactoring.push(name);
        break;
      case 'CREATE_IN_ATLAS_CORE_AFTER_AUDIT':
        pendingCreation.push(name);
        break;
    }
  }

  console.log(`   Ready for atlas-core: ${readyForAtlasCore.length}`);
  for (const name of readyForAtlasCore) {
    console.log(`      ✅ ${name}`);
  }

  console.log(`\n   Ready for parent-atlas: ${readyForParentAtlas.length}`);
  for (const name of readyForParentAtlas) {
    console.log(`      ✅ ${name}`);
  }

  console.log(`\n   Keep in scripts: ${keepInScripts.length}`);
  for (const name of keepInScripts) {
    console.log(`      📝 ${name}`);
  }

  if (needsRefactoring.length > 0) {
    console.log(`\n   Needs refactoring: ${needsRefactoring.length}`);
    for (const name of needsRefactoring) {
      console.log(`      ⚙️  ${name}`);
    }
  }

  if (pendingCreation.length > 0) {
    console.log(`\n   Pending creation (audit required): ${pendingCreation.length}`);
    for (const name of pendingCreation) {
      console.log(`      ⏳ ${name}`);
    }
  }

  console.log();

  return {
    readyForAtlasCore,
    readyForParentAtlas,
    keepInScripts,
    needsRefactoring,
    pendingCreation,
  };
}

// ── Step 4: Generate promotion plan ──────────────────────────────────────────

function generatePromotionPlan(readiness) {
  console.log('📋 PROMOTION PLAN\n');

  console.log('Phase 1 (IMMEDIATE): Move pure logic to atlas-core');
  for (const name of readiness.readyForAtlasCore) {
    const entry = registry[name];
    if (entry.current_location && entry.current_location.includes('sveltekit-frontend')) {
      console.log(`   1. ${name}`);
      console.log(`      From: ${entry.current_location}`);
      console.log(`      To:   ${entry.canonical}`);
      console.log(`      Size: ${entry.lines_of_code} lines`);
    }
  }

  console.log(`\nPhase 2 (NEXT): Create adapters in parent-atlas`);
  for (const name of readiness.readyForParentAtlas) {
    const entry = registry[name];
    console.log(`   1. ${name}`);
    console.log(`      To:   ${entry.canonical}`);
    console.log(`      Tests: ${entry.tests_required?.length ?? 0} required`);
  }

  console.log(`\nPhase 3 (AFTER P3-P4): Refactor split logic`);
  for (const name of readiness.needsRefactoring) {
    const entry = registry[name];
    console.log(`   1. ${name}`);
    console.log(`      Logic → ${entry.canonical}`);
    console.log(`      HTTP  → Keep in SvelteKit`);
  }

  console.log(`\nPhase 4 (P5-P7): Create from audit results`);
  for (const name of readiness.pendingCreation) {
    const entry = registry[name];
    console.log(`   1. ${name}`);
    console.log(`      Target: ${entry.canonical}`);
    if (entry.duplicates?.length > 0) {
      console.log(`      Audit: ${entry.duplicates.join(', ')}`);
    }
  }

  console.log();
}

// ── Step 5: Estimate effort ──────────────────────────────────────────────────

function estimateEffort(readiness) {
  console.log('⏱️  EFFORT ESTIMATION\n');

  let totalLines = 0;
  let totalTests = 0;

  for (const name of readiness.readyForAtlasCore) {
    const entry = registry[name];
    totalLines += entry.lines_of_code || 0;
    totalTests += entry.tests_required?.length || 0;
  }

  for (const name of readiness.readyForParentAtlas) {
    const entry = registry[name];
    totalLines += entry.lines_of_code || 0;
    totalTests += entry.tests_required?.length || 0;
  }

  const hours = Math.ceil(totalLines / 100) + Math.ceil(totalTests / 5);

  console.log(`   Total lines to move: ${totalLines}`);
  console.log(`   Total test cases: ${totalTests}`);
  console.log(`   Estimated effort: ${hours} hours`);
  console.log();

  return { hours, lines: totalLines, tests: totalTests };
}

// ── Main execution ───────────────────────────────────────────────────────────

function main() {
  const duplicates = checkDuplicateImplementations();
  const files = validateFileLocations();
  const readiness = assessPromotionReadiness();
  generatePromotionPlan(readiness);
  const effort = estimateEffort(readiness);

  // Summary
  console.log('✅ AUDIT SUMMARY\n');
  console.log(`   Duplicate implementations: ${duplicates.count}`);
  console.log(`   Files found: ${files.found.length} / ${files.found.length + files.missing.length}`);
  console.log(`   Ready to promote (atlas-core): ${readiness.readyForAtlasCore.length}`);
  console.log(`   Ready to create (parent-atlas): ${readiness.readyForParentAtlas.length}`);
  console.log(`   Keep in scripts: ${readiness.keepInScripts.length}`);
  console.log(`   Estimated effort: ${effort.hours} hours\n`);

  if (duplicates.count === 0 && files.missing.length === 0) {
    console.log('🎯 READY FOR PHASE 85 PROMOTIONS\n');
    process.exit(0);
  } else {
    console.log('⚠️  Review warnings above before proceeding\n');
    process.exit(files.missing.length > 0 ? 1 : 0);
  }
}

main();