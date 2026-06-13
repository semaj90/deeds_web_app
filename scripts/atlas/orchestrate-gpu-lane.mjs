#!/usr/bin/env node
/**
 * @file scripts/atlas/orchestrate-gpu-lane.mjs
 * @description Orchestrates the complete GPU enrichment lane (Lane 4).
 * Enforces sequence: audit → standardize karpathy → standardize nes → merge → verify
 *
 * Execution:
 *   node scripts/atlas/orchestrate-gpu-lane.mjs [--apply] [--verbose]
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const scripts = [
  {
    name: 'Audit GPU Enrichment',
    file: 'audit-gpu-enrichment.mjs',
    args: ['--save', ...(VERBOSE ? ['--verbose'] : [])]
  },
  {
    name: 'Standardize Karpathy',
    file: 'standardize-karpathy-gpu-packets.mjs',
    args: ['--save', ...(VERBOSE ? ['--verbose'] : [])]
  },
  {
    name: 'Standardize NES Chrom',
    file: 'standardize-nes-chrom-packets.mjs',
    args: ['--save', ...(VERBOSE ? ['--verbose'] : [])]
  },
  {
    name: 'Merge GPU Enrichment',
    file: 'merge-gpu-enrichment.mjs',
    args: [...(APPLY ? ['--apply'] : []), '--save', ...(VERBOSE ? ['--verbose'] : [])]
  },
  {
    name: 'Verify Merge',
    file: 'verify-gpu-merge.mjs',
    args: ['--save', ...(VERBOSE ? ['--verbose'] : [])]
  }
];

async function runScript(script) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[ORCHESTRATE] Running: ${script.name}`);
    console.log(`${'='.repeat(60)}`);

    const proc = spawn('node', [path.resolve(__dirname, script.file), ...script.args], {
      cwd: ROOT,
      stdio: 'inherit'
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ ${script.name} completed successfully`);
        resolve();
      } else {
        reject(new Error(`${script.name} failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`${script.name} error: ${err.message}`));
    });
  });
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 GPU ENRICHMENT LANE ORCHESTRATOR (Lane 4)');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('='.repeat(60));

  try {
    for (const script of scripts) {
      await runScript(script);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL SCRIPTS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    if (!APPLY) {
      console.log('1. Review dry-run reports in docs/reports/gpu-*');
      console.log('2. Run: node scripts/atlas/orchestrate-gpu-lane.mjs --apply');
    } else {
      console.log('1. Check verification report: docs/reports/gpu-merge-verification.json');
      console.log('2. Lane 4 ready for Phase B cross-lane verification');
    }
    process.exit(0);
  } catch (err) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ORCHESTRATION FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
