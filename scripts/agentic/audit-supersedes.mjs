#!/usr/bin/env node
/**
 * Supersedes Audit: Detect duplicate/overlapping artifacts
 *
 * Checks for:
 * - Same basename (e.g., .mjs.mjs duplicates)
 * - Same npm script target
 * - Same report output path
 * - Same task_id/story_id
 * - Same function/class names
 * - Overlapping files_intended
 *
 * Usage:
 *   node scripts/agentic/audit-supersedes.mjs --task-id=P3G-QDRANT-CLASSIFY
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const LEDGER_PATH = 'docs/reports/agent-task-claims.json';
const taskId = process.argv.find(a => a.startsWith('--task-id='))?.split('=')[1];

if (!taskId) {
  console.error('Missing: --task-id=<id>');
  process.exit(1);
}

// Load ledger
function loadLedger() {
  if (fs.existsSync(LEDGER_PATH)) {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  }
  return [];
}

// Check filesystem for duplicates
function findDuplicates(filesList) {
  const duplicates = [];

  for (const file of filesList) {
    const dir = path.dirname(file);
    const base = path.basename(file);
    const variants = [
      base + '.mjs',
      base + '.ts',
      base + '.js'
    ];

    try {
      const files = fs.readdirSync(dir);
      for (const variant of variants) {
        if (variant !== base && files.includes(variant)) {
          duplicates.push({
            intended: file,
            found: path.join(dir, variant),
            type: 'DUPLICATE_EXTENSION'
          });
        }
      }
    } catch (_err) {
      /* dir doesn't exist yet */
    }
  }

  return duplicates;
}

// Check npm scripts for conflicts
function findNpmScriptConflicts(filesList) {
  const conflicts = [];

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const scripts = packageJson.scripts || {};

    // Try to find which npm scripts reference these files
    for (const [scriptName, scriptCmd] of Object.entries(scripts)) {
      for (const file of filesList) {
        if (scriptCmd.includes(file)) {
          conflicts.push({
            npm_script: scriptName,
            file,
            type: 'NPM_SCRIPT_REFERENCE'
          });
        }
      }
    }
  } catch (_err) {
    /* package.json not found */
  }

  return conflicts;
}

// Extract function/class names from file
function extractDefinitions(filePath) {
  const definitions = new Set();

  if (!fs.existsSync(filePath)) return definitions;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const funcMatch = content.match(/(?:async\s+)?function\s+(\w+)/g);
    const classMatch = content.match(/class\s+(\w+)/g);

    if (funcMatch) {
      funcMatch.forEach(m => definitions.add(m.split(/\s+/)[2]));
    }
    if (classMatch) {
      classMatch.forEach(m => definitions.add(m.split(/\s+/)[1]));
    }
  } catch (_err) {
    /* can't read file */
  }

  return definitions;
}

// Check for overlapping definitions
function findDefinitionOverlap(filesList, ledger) {
  const overlaps = [];
  const currentDefs = new Map();

  // Extract defs from intended files
  for (const file of filesList) {
    const defs = extractDefinitions(file);
    currentDefs.set(file, defs);
  }

  // Check against ledger entries
  for (const entry of ledger) {
    if (entry.task_id === taskId || entry.status === 'SUPERSEDED') continue;

    for (const file of entry.files_intended || []) {
      const existingDefs = extractDefinitions(file);
      for (const newFile of filesList) {
        const newDefs = currentDefs.get(newFile);
        const intersection = [...newDefs].filter(d => existingDefs.has(d));
        if (intersection.length > 0) {
          overlaps.push({
            new_file: newFile,
            existing_file: file,
            overlapping_defs: intersection,
            type: 'DEFINITION_OVERLAP'
          });
        }
      }
    }
  }

  return overlaps;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUPERSEDES AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const ledger = loadLedger();
  const claim = ledger.find(e => e.task_id === taskId);

  if (!claim) {
    console.error(`❌ No claim found for task ${taskId}`);
    process.exit(1);
  }

  console.log(`📋 Claim: ${claim.task_id} (${claim.agent})`);
  console.log(`   Files: ${claim.files_intended.join(', ')}`);
  console.log();

  const results = {
    task_id: taskId,
    timestamp: new Date().toISOString(),
    checks: {
      duplicate_extensions: [],
      npm_script_conflicts: [],
      definition_overlaps: [],
      overlapping_claims: []
    },
    verdict: 'PASS'
  };

  // Check 1: Duplicate extensions
  const dupes = findDuplicates(claim.files_intended);
  if (dupes.length > 0) {
    console.log('⚠️  DUPLICATE EXTENSIONS:');
    for (const dupe of dupes) {
      console.log(`  ${dupe.intended} → ${dupe.found}`);
      results.checks.duplicate_extensions.push(dupe);
      results.verdict = 'FAIL';
    }
    console.log();
  }

  // Check 2: npm script conflicts
  const npmConflicts = findNpmScriptConflicts(claim.files_intended);
  if (npmConflicts.length > 0) {
    console.log('ℹ️  NPM SCRIPT REFERENCES:');
    for (const conflict of npmConflicts) {
      console.log(`  ${conflict.npm_script} → ${conflict.file}`);
      results.checks.npm_script_conflicts.push(conflict);
    }
    console.log();
  }

  // Check 3: Definition overlap
  const defOverlaps = findDefinitionOverlap(claim.files_intended, ledger);
  if (defOverlaps.length > 0) {
    console.log('⚠️  DEFINITION OVERLAPS:');
    for (const overlap of defOverlaps) {
      console.log(`  ${overlap.new_file} overlaps with ${overlap.existing_file}`);
      console.log(`    Defs: ${overlap.overlapping_defs.join(', ')}`);
      results.checks.definition_overlaps.push(overlap);
      results.verdict = 'FAIL';
    }
    console.log();
  }

  // Check 4: Overlapping claims
  for (const other of ledger) {
    if (other.task_id === taskId) continue;

    const overlap = claim.files_intended.filter(f =>
      other.files_intended?.includes(f)
    );

    if (overlap.length > 0 && other.status !== 'SUPERSEDED') {
      console.log(`⚠️  OVERLAPPING CLAIM:`);
      console.log(`  Task: ${other.task_id} (agent: ${other.agent})`);
      console.log(`  Files: ${overlap.join(', ')}`);
      results.checks.overlapping_claims.push({
        task_id: other.task_id,
        agent: other.agent,
        files: overlap
      });
      if (other.status === 'CLAIMED' || other.status === 'VERIFYING') {
        results.verdict = 'FAIL';
      }
    }
  }

  // Write report
  const reportDir = 'docs/reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportDir, 'supersedes-audit.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`VERDICT: ${results.verdict}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  if (results.verdict === 'PASS') {
    console.log('✅ Safe to proceed with file creation/patch');
    console.log();
    console.log('Next: Create/patch files, then run:');
    console.log('  npm run agent:release -- --task-id=' + taskId + ' --status=VERIFYING');
  } else {
    console.log('❌ Conflicts detected. Do not proceed.');
    console.log();
    console.log('Options:');
    console.log('  1. Mark as SUPERSEDED (replaces older artifact)');
    console.log('  2. Patch existing file instead of creating new');
    console.log('  3. Wait for conflicting claim to complete');
  }

  console.log();
  console.log(`📄 Report: docs/reports/supersedes-audit.json`);
  console.log();

  process.exit(results.verdict === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
