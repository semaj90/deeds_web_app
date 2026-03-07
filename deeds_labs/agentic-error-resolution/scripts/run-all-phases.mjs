#!/usr/bin/env node
/**
 * Master Orchestrator: Run all error resolution phases
 * Coordinates automated → semi-automated → AI-assisted fixes
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS_DIR = path.join(__dirname);

function log(msg) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(msg);
  console.log('='.repeat(60));
}

function runPhase(script, phaseName) {
  log(`🚀 Running ${phaseName}...`);
  
  try {
    execSync(`node ${path.join(SCRIPTS_DIR, script)}`, {
      cwd: ROOT,
      stdio: 'inherit'
    });
    return true;
  } catch (err) {
    console.error(`❌ ${phaseName} failed:`, err.message);
    return false;
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   Agentic Error Resolution System                         ║
║   Legal AI Platform - 47K Error Fix Pipeline              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

  log('📊 Initial Error Count');
  try {
    const errorCheck = execSync('npx svelte-check --threshold error 2>&1 | findstr "error"', {
      cwd: ROOT,
      encoding: 'utf8'
    });
    console.log(errorCheck);
  } catch {
    // Ignore - will be many errors
  }

  // Phase 1: Automated fixes
  const phase1Success = runPhase('phase1-automated-fixes.mjs', 'Phase 1: Automated Fixes');
  
  if (!phase1Success) {
    console.log('\n⚠️  Phase 1 failed. Stopping.');
    return;
  }

  // Phase 2: Import fixes
  const phase2Success = runPhase('phase2-import-fixes.mjs', 'Phase 2: Import Fixes');
  
  if (!phase2Success) {
    console.log('\n⚠️  Phase 2 failed. Continuing to Phase 3...');
  }

  // Recheck errors
  log('📊 Midpoint Error Count');
  try {
    execSync('npx svelte-check --threshold error 2>&1 | findstr "error"', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit'
    });
  } catch {
    // Ignore
  }

  // Phase 3: AI-assisted repair
  console.log('\n');
  console.log('⚠️  Phase 3 requires Ollama to be running with gemma3-legal:latest');
  console.log('   If Ollama is not available, Phase 3 will skip.');
  console.log('');
  
  const phase3Success = runPhase('phase3-ai-repair.mjs', 'Phase 3: AI-Assisted Repair');

  // Final summary
  log('📊 Final Error Count');
  try {
    execSync('npx svelte-check --threshold error', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'inherit'
    });
  } catch {
    // Will show errors
  }

  log('✨ All Phases Complete!');
  
  // Compile summaries
  const summaries = [];
  for (let phase = 1; phase <= 3; phase++) {
    const summaryPath = path.join(ROOT, 'agentic-error-resolution/errors', `phase${phase}-summary.json`);
    if (fs.existsSync(summaryPath)) {
      summaries.push(JSON.parse(fs.readFileSync(summaryPath, 'utf8')));
    }
  }
  
  const totalFixed = summaries.reduce((sum, s) => sum + (s.estimatedErrorsFixed || 0), 0);
  
  console.log('\n📈 Overall Results:');
  summaries.forEach(s => {
    console.log(`   Phase ${s.phase}: ~${s.estimatedErrorsFixed} errors fixed`);
  });
  console.log(`   Total: ~${totalFixed} errors fixed`);
  console.log('');
  console.log(`📝 Logs available in: agentic-error-resolution/logs/`);
  console.log('');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
