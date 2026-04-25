#!/usr/bin/env node
/**
 * Error Resolution Orchestrator
 * Coordinates all phases of automated error fixing for 47K errors
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PHASES = [
  {
    id: 1,
    name: 'Automated Fixes',
    script: 'agentic-phase1-automated.mjs',
    description: 'Fix $state placement, imports, event handlers, casing',
    estimated: 2000
  },
  {
    id: 2,
    name: 'Type Inference',
    script: 'agentic-phase2-types.mjs',
    description: 'Fix never[] arrays, add type annotations, Promise types',
    estimated: 4500
  }
];

const logFile = path.join(ROOT, 'agentic-error-resolution', 'logs', `run-${Date.now()}.log`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

function runCommand(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function getSvelteCheckErrors() {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['svelte-check', '--threshold', 'error'], {
      cwd: ROOT,
      shell: true
    });

    let output = '';
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', () => {
      // Parse error count from output
      const match = output.match(/(\d+)\s+error/);
      const errorCount = match ? parseInt(match[1], 10) : 0;
      resolve(errorCount);
    });
  });
}

async function main() {
  const startTime = Date.now();
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🤖 Error Resolution System                             ║');
  console.log('║   47K Errors → Production Ready                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Get initial error count
  log('📊 Counting errors (this may take a minute)...');
  const initialErrors = await getSvelteCheckErrors();
  log(`   Found ${initialErrors.toLocaleString()} errors`);
  console.log('');

  const results = [];

  for (const phase of PHASES) {
    console.log('─'.repeat(60));
    console.log(`🚀 Phase ${phase.id}: ${phase.name}`);
    console.log(`   ${phase.description}`);
    console.log(`   Target: ~${phase.estimated.toLocaleString()} fixes`);
    console.log('─'.repeat(60));
    console.log('');

    const phaseStart = Date.now();

    try {
      // Run phase script
      await runCommand('node', [path.join(ROOT, 'scripts', phase.script)]);

      // Get error count after phase
      console.log('');
      console.log('📊 Recounting errors...');
      const errorsAfter = await getSvelteCheckErrors();
      const errorsBefore = results.length > 0 ? results[results.length - 1].errorsAfter : initialErrors;
      const fixed = errorsBefore - errorsAfter;
      const phaseTime = ((Date.now() - phaseStart) / 1000).toFixed(2);

      results.push({
        phase: phase.id,
        name: phase.name,
        errorsBefore,
        errorsAfter,
        fixed,
        time: parseFloat(phaseTime)
      });

      console.log('');
      console.log('✅ Phase Complete');
      console.log(`   Errors fixed: ${fixed.toLocaleString()}`);
      console.log(`   Remaining: ${errorsAfter.toLocaleString()}`);
      console.log(`   Time: ${phaseTime}s`);
      console.log('');

    } catch (error) {
      log(`❌ Phase ${phase.id} failed: ${error.message}`);
      console.error(`❌ Phase ${phase.id} failed:`, error.message);
      
      results.push({
        phase: phase.id,
        name: phase.name,
        errorsBefore: results.length > 0 ? results[results.length - 1].errorsAfter : initialErrors,
        errorsAfter: null,
        fixed: 0,
        error: error.message
      });
      
      break;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalErrors = results[results.length - 1]?.errorsAfter ?? initialErrors;
  const totalFixed = initialErrors - finalErrors;
  const percentFixed = initialErrors > 0 ? ((totalFixed / initialErrors) * 100).toFixed(1) : 0;

  console.log('═'.repeat(60));
  console.log('🎉 Resolution Complete');
  console.log('═'.repeat(60));
  console.log('');
  console.log('📊 Final Statistics:');
  console.log(`   Initial errors: ${initialErrors.toLocaleString()}`);
  console.log(`   Final errors: ${finalErrors.toLocaleString()}`);
  console.log(`   Total fixed: ${totalFixed.toLocaleString()} (${percentFixed}%)`);
  console.log(`   Total time: ${totalTime}s`);
  console.log('');
  console.log('📋 Phase Breakdown:');
  
  for (const result of results) {
    if (result.errorsAfter !== null) {
      console.log(`   Phase ${result.phase} (${result.name}):`);
      console.log(`      Fixed: ${result.fixed.toLocaleString()} errors in ${result.time}s`);
    } else {
      console.log(`   Phase ${result.phase} (${result.name}): ❌ Failed`);
    }
  }

  // Write final report
  const report = {
    timestamp: new Date().toISOString(),
    initialErrors,
    finalErrors,
    totalFixed,
    percentFixed: parseFloat(percentFixed),
    totalTime: parseFloat(totalTime),
    phases: results,
    logFile: path.relative(ROOT, logFile)
  };

  const reportPath = path.join(ROOT, 'agentic-error-resolution', 'final-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('');
  console.log(`📄 Full report: ${path.relative(ROOT, reportPath)}`);
  console.log(`📄 Log file: ${path.relative(ROOT, logFile)}`);
  console.log('');

  if (finalErrors > 30000) {
    console.log('💡 Next steps:');
    console.log('   Run Phase 3 AI-assisted repairs with:');
    console.log('   node scripts/agentic-phase3-ai-repair.mjs');
    console.log('');
  }

  return finalErrors > 0 ? 1 : 0;
}

main().then(process.exit).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
