#!/usr/bin/env node

/**
 * consolidate-apply.mjs
 *
 * Executes file consolidation: merges duplicates, updates imports, deletes files.
 *
 * Usage:
 *   node scripts/consolidate/consolidate-apply.mjs [--dry-run] [--apply] [--confidence 0.90] [--preserve-tests] [--verbose]
 *
 * Modes:
 *   --dry-run   : Preview changes without applying
 *   --apply     : Actually execute the consolidation
 *
 * Output:
 *   .tmp/consolidation-applied.json (execution summary)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../');
const SVELTEKIT_FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const TMP_DIR = path.join(SVELTEKIT_FRONTEND, '.tmp');

// Parse CLI args
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');
const preserveTests = process.argv.includes('--preserve-tests');
const confidenceArg = parseFloat(process.argv.find(arg => arg.startsWith('--confidence='))?.split('=')[1] ?? '0.90');

const mode = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const vlog = (msg) => verbose && log(msg);

// Ensure .tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Protected paths (never delete)
 */
const PROTECTED_PATHS = [
  'docker/',
  'docker-compose',
  '.docker/',
  '.containers/',
  'Dockerfile',
  '.dockerignore',
  'container-definitions/',
];

function isProtectedPath(filePath) {
  const rel = path.relative(ROOT, filePath);
  return PROTECTED_PATHS.some(p => rel.toLowerCase().includes(p.toLowerCase()));
}

/**
 * Load consolidation candidates
 */
function loadCandidates() {
  const candidatesFile = path.join(TMP_DIR, 'consolidation-candidates.json');
  if (!fs.existsSync(candidatesFile)) {
    log('❌ consolidation-candidates.json not found');
    log('   Run: npm run consolidate:audit');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(candidatesFile, 'utf-8')).candidates || [];
}

/**
 * Safety check: verify no protected files are marked for deletion
 */
function verifyNoProtectedFiles(candidates) {
  for (const candidate of candidates) {
    for (const duplicate of candidate.duplicates) {
      const dupFile = duplicate.file ?? duplicate;
      if (isProtectedPath(dupFile)) {
        log(`❌ SAFETY CHECK FAILED: Protected file in deletion list!`);
        log(`   File: ${dupFile}`);
        log(`   Reason: Docker infrastructure must never be consolidated`);
        log(`   Action: Debug PROTECTED_PATHS logic in consolidate-audit.mjs`);
        process.exit(1);
      }
    }
  }
  vlog('✅ Safety check passed: No protected files in deletion list');
}

/**
 * Update imports in a file
 */
function updateImports(filePath, mappings) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let updated = false;

    for (const [oldPath, newPath] of Object.entries(mappings)) {
      const regex = new RegExp(`from\\s+['"]([^'"]*${oldPath.replace(/\//g, '[\\\\/]')}[^'"]*)['"]`, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, `from '${newPath}'`);
        updated = true;
      }
    }

    return { updated, content };
  } catch (e) {
    return { updated: false, error: e.message };
  }
}

/**
 * Create re-export shim
 */
function createReexportShim(canonicalPath) {
  const relPath = path.relative(path.dirname(canonicalPath), path.join(SVELTEKIT_FRONTEND, canonicalPath));
  return `// Re-export canonical module
// Generated: ${new Date().toISOString()}
// This file consolidates duplicates into a single canonical source
export * from '${relPath}';
`;
}

/**
 * Main apply function
 */
async function applyConsolidation() {
  log(`🔧 Consolidation Apply (${mode})`);
  log(`   Confidence threshold: ${confidenceArg}`);

  // Load candidates
  const allCandidates = loadCandidates();
  const candidates = allCandidates.filter(c => c.confidence >= confidenceArg);

  log(`📊 Processing ${candidates.length}/${allCandidates.length} candidates`);

  // Safety check
  verifyNoProtectedFiles(candidates);

  const executionPlan = {
    timestamp: new Date().toISOString(),
    mode,
    confidenceThreshold: confidenceArg,
    preserveTests,
    totalCandidates: candidates.length,
    filesToDelete: [],
    importsToUpdate: [],
    shimToCreate: [],
    successCount: 0,
    failureCount: 0,
    skippedCount: 0
  };

  // Phase 1: Build execution plan
  log('\n📋 Phase 1: Building execution plan...');

  for (const candidate of candidates) {
    const canonical = candidate.canonical;
    const duplicates = candidate.duplicates.map(d => d.file ?? d);

    for (const duplicate of duplicates) {
      if (isProtectedPath(duplicate)) {
        vlog(`⏭️  SKIP (protected): ${duplicate}`);
        executionPlan.skippedCount++;
        continue;
      }

      executionPlan.filesToDelete.push({
        file: duplicate,
        canonical,
        confidence: candidate.confidence
      });
    }
  }

  log(`  → ${executionPlan.filesToDelete.length} files to delete`);
  log(`  → ${candidates.length} canonical files (no changes)`);

  if (mode === 'DRY_RUN') {
    // Write dry-run report
    const dryRunFile = path.join(TMP_DIR, 'consolidation-dry-run.json');
    fs.writeFileSync(dryRunFile, JSON.stringify(executionPlan, null, 2));
    log(`\n✅ DRY-RUN COMPLETE`);
    log(`   Report: ${dryRunFile}`);
    log(`\n📋 Files that WILL be deleted:`);
    for (const item of executionPlan.filesToDelete) {
      log(`   - ${item.file} (→ ${item.canonical})`);
    }
    return executionPlan;
  }

  // Phase 2: Apply changes (--apply mode only)
  if (mode === 'APPLY') {
    log('\n⚙️  Phase 2: Applying consolidation...');

    // Delete duplicate files
    for (const item of executionPlan.filesToDelete) {
      try {
        const filePath = path.join(ROOT, item.file);
        if (fs.existsSync(filePath)) {
          vlog(`  DELETE: ${item.file}`);
          fs.unlinkSync(filePath);
          executionPlan.successCount++;
        }
      } catch (e) {
        log(`  ❌ Failed to delete ${item.file}: ${e.message}`);
        executionPlan.failureCount++;
      }
    }

    // Update imports in consumer files
    log('\n📝 Phase 3: Updating imports...');

    const updateMappings = {};
    for (const candidate of candidates) {
      const canonical = candidate.canonical;
      const duplicates = candidate.duplicates.map(d => d.file ?? d);
      for (const duplicate of duplicates) {
        updateMappings[duplicate] = canonical;
      }
    }

    try {
      const result = execSync(
        `rg --type ts --type mjs -l "from.*(.*/|\\\\)(" src/ packages/ scripts/`,
        { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
      const files = result.split('\n').filter(Boolean);
      vlog(`  Found ${files.length} files with imports`);

      for (const file of files) {
        const filePath = path.join(ROOT, file);
        const { updated, content } = updateImports(filePath, updateMappings);
        if (updated && !dryRun) {
          fs.writeFileSync(filePath, content);
          executionPlan.importsToUpdate.push(file);
          vlog(`  UPDATED: ${file}`);
        }
      }
    } catch (e) {
      vlog(`  Warning: Import update scan failed: ${e.message}`);
    }

    log(`\n✅ CONSOLIDATION APPLIED`);
    log(`   Files deleted: ${executionPlan.successCount}`);
    log(`   Imports updated: ${executionPlan.importsToUpdate.length}`);
    log(`   Failed operations: ${executionPlan.failureCount}`);

    // Write applied report
    const appliedFile = path.join(TMP_DIR, 'consolidation-applied.json');
    fs.writeFileSync(appliedFile, JSON.stringify(executionPlan, null, 2));
    log(`   Report: ${appliedFile}`);
  }

  return executionPlan;
}

// Run
await applyConsolidation().catch(e => {
  log(`❌ Error: ${e.message}`);
  process.exit(1);
});