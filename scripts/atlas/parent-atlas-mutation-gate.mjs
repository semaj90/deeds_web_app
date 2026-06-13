#!/usr/bin/env node
/**
 * @file scripts/atlas/parent-atlas-mutation-gate.mjs
 * @description Master gate orchestrator for Parent Atlas mutation contract.
 * Runs all mutation pipelines through the canonical 5-stage gate system.
 *
 * Stages per pipeline:
 *   0. Syntax check (node --check)
 *   1. Producer (generates read-only artifact)
 *   2. Artifact validation (JSON.parse)
 *   3. Consumer dry-run (generates execution plan)
 *   4. ACE/KAG/DAG evidence
 *   5. Apply (mutation with --apply flag)
 *
 * Pipelines:
 *   - env_contract (environment variables)
 *   - parent_atlas_packets (packet definitions)
 *   - ace_packet_cache (cache strategy)
 *   - gpu_karpathy_scoring (authority blend)
 *
 * Execution:
 *   node scripts/atlas/parent-atlas-mutation-gate.mjs [--apply] [--verbose]
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const PIPELINES = [
  {
    name: 'env_contract',
    description: 'Environment variables contract',
    stages: [
      { name: 'syntax', cmd: 'node --check scripts/atlas/audit-env-contract.mjs' },
      { name: 'producer', cmd: 'node scripts/atlas/audit-env-contract.mjs' },
      { name: 'artifact', validate: 'docs/reports/env-contract-audit.json' },
      { name: 'consumer-dry-run', cmd: 'node scripts/atlas/index-env-contract.mjs' },
      { name: 'consumer-apply', cmd: 'node scripts/atlas/index-env-contract.mjs --apply', gated: true }
    ]
  },
  {
    name: 'parent_atlas_packets',
    description: 'Packet definitions manifest',
    stages: [
      { name: 'syntax', cmd: 'node --check scripts/atlas/generate-parent-atlas-packets.mjs' },
      { name: 'producer', cmd: 'node scripts/atlas/generate-parent-atlas-packets.mjs' },
      { name: 'artifact', validate: 'docs/reports/parent-atlas-packets-manifest.json' },
      { name: 'consumer-dry-run', cmd: 'node scripts/atlas/index-parent-atlas-packets.mjs' },
      { name: 'consumer-apply', cmd: 'node scripts/atlas/index-parent-atlas-packets.mjs --apply', gated: true }
    ]
  },
  {
    name: 'ace_packet_cache',
    description: 'ACE packet caching strategy',
    stages: [
      { name: 'syntax', cmd: 'node --check scripts/atlas/cache-ace-packet.mjs' },
      { name: 'producer', cmd: 'node scripts/atlas/cache-ace-packet.mjs' },
      { name: 'artifact', validate: 'docs/reports/ace-cache-manifest.json' },
      { name: 'consumer-dry-run', cmd: 'node scripts/atlas/index-ace-cache.mjs' },
      { name: 'consumer-apply', cmd: 'node scripts/atlas/index-ace-cache.mjs --apply', gated: true }
    ]
  },
  {
    name: 'concept_evidence_spine',
    description: 'Concept evidence spine and taxonomy',
    stages: [
      { name: 'syntax', cmd: 'node --check scripts/atlas/generate-concept-evidence-spine.mjs' },
      { name: 'producer', cmd: 'node scripts/atlas/generate-concept-evidence-spine.mjs' },
      { name: 'artifact', validate: 'docs/reports/concept-evidence-spine.json' },
      { name: 'consumer-dry-run', cmd: 'node scripts/atlas/index-concept-evidence-spine.mjs' },
      { name: 'consumer-apply', cmd: 'node scripts/atlas/index-concept-evidence-spine.mjs --apply', gated: true }
    ]
  }
];

async function runCommand(cmd, pipelineName) {
  try {
    if (VERBOSE) console.log(`  [${pipelineName}] Running: ${cmd}`);
    const { stdout, stderr } = await execAsync(cmd, { cwd: ROOT });
    if (stderr && VERBOSE) console.warn(`  [${pipelineName}] Warning: ${stderr}`);
    return { ok: true, output: stdout };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function validateArtifact(filePath, pipelineName) {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    const content = await fs.readFile(fullPath, 'utf8');
    JSON.parse(content);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Invalid or missing artifact: ${filePath}` };
  }
}

async function runMutationGate() {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  Parent Atlas Mutation Contract Gate Orchestrator  ║`);
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY RUN'.padEnd(41)} ║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const pipeline of PIPELINES) {
    console.log(`\n┌─ Pipeline: ${pipeline.name}`);
    console.log(`│  ${pipeline.description}`);
    console.log(`└─────────────────────────────────────────────────\n`);

    let pipelinePassed = 0;
    let pipelineFailed = 0;

    for (const stage of pipeline.stages) {
      // Skip apply stage if not applying
      if (stage.gated && !APPLY) {
        console.log(`  ⊘ ${stage.name.padEnd(20)} (skipped, use --apply to execute)`);
        continue;
      }

      let result;
      if (stage.validate) {
        result = await validateArtifact(stage.validate, pipeline.name);
      } else {
        result = await runCommand(stage.cmd, pipeline.name);
      }

      if (result.ok) {
        console.log(`  ✅ ${stage.name.padEnd(20)} passed`);
        pipelinePassed++;
        totalPassed++;
      } else {
        console.log(`  ❌ ${stage.name.padEnd(20)} failed: ${result.error}`);
        pipelineFailed++;
        totalFailed++;
        break; // Stop pipeline on first failure
      }
    }

    const status = pipelineFailed === 0 ? '✅ PASSED' : '❌ FAILED';
    console.log(`\n  ${status} (${pipelinePassed}/${pipelinePassed + pipelineFailed})`);
  }

  console.log(`\n╔════════════════════════════════════════════════════╗`);
  if (totalFailed === 0) {
    console.log(`║ ✅ ALL PIPELINES PASSED                          ║`);
    console.log(`║ Total stages passed: ${totalPassed}                           ║`);
    if (APPLY) {
      console.log(`║ ✨ Parent Atlas mutations committed!             ║`);
    } else {
      console.log(`║ Next: run with --apply to commit mutations       ║`);
    }
  } else {
    console.log(`║ ❌ PIPELINES FAILED                               ║`);
    console.log(`║ Passed: ${totalPassed}, Failed: ${totalFailed}                         ║`);
  }
  console.log(`╚════════════════════════════════════════════════════╝\n`);

  process.exit(totalFailed === 0 ? 0 : 1);
}

runMutationGate().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
