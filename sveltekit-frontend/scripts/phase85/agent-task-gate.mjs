#!/usr/bin/env node
/**
 * Agent Task Gate — Validation Before Execution
 * Enforces validation: task → files → proofs → gates → allowed
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const PROOF_GATES = {
  TASK_DEFINED: {
    name: 'Task Definition',
    check: (task) => !!task.id && !!task.description,
  },
  AGENT_AUTHORIZED: {
    name: 'Agent Authorization',
    check: (task, agent) => ['codex', 'claude', 'opencode', 'human'].includes(agent),
  },
  NO_DOCKER_EXEC: {
    name: 'No Docker Exec Antipattern',
    check: async (task) => {
      if (!task.relatedFiles) return true;
      for (const file of task.relatedFiles) {
        if (!existsSync(file)) continue;
        try {
          const content = await readFile(file, 'utf8');
          if (content.includes('docker exec') && (file.endsWith('.ts') || file.endsWith('.mjs') || file.endsWith('.js'))) {
            console.error(`  ❌ Found 'docker exec' in ${file}`);
            return false;
          }
        } catch {}
      }
      return true;
    },
  },
};

const TASK_REGISTRY = {
  'gan-validate-live': {
    id: 'gan-validate-live',
    description: 'Validate GAN probes on live Postgres packets',
    scriptPath: 'scripts/atlas/gan-validate-live-packets.mts',
    relatedFiles: ['scripts/atlas/gan-validate-live-packets.mts'],
    validation: {
      gates: ['TASK_DEFINED', 'AGENT_AUTHORIZED', 'NO_DOCKER_EXEC'],
      hardFailOn: ['TASK_DEFINED', 'AGENT_AUTHORIZED', 'NO_DOCKER_EXEC'],
    },
  },
};

async function main() {
  const args = process.argv.slice(2);
  const taskId = args[args.indexOf('--task-id') + 1] || 'gan-validate-live';
  const agent = args[args.indexOf('--agent') + 1] || 'codex';
  const dryRun = args.includes('--dry-run');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ Agent Task Gate — Validation Before Execution         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    const task = TASK_REGISTRY[taskId];
    if (!task) throw new Error(`Task '${taskId}' not found`);

    console.log(`Task: ${taskId}\nAgent: ${agent}\nDry-run: ${dryRun}\n`);
    console.log('Validating gates...\n');
    const results = { taskId, agent, timestamp: new Date().toISOString(), gatesPassed: [], gatesFailed: [] };

    for (const gateName of task.validation.gates) {
      const gate = PROOF_GATES[gateName];
      if (!gate) {
        console.error(`  ❌ Unknown gate: ${gateName}`);
        results.gatesFailed.push(gateName);
        continue;
      }
      try {
        const passed = await gate.check(task, agent);
        if (passed) {
          console.log(`  ✅ ${gate.name}`);
          results.gatesPassed.push(gateName);
        } else {
          console.error(`  ❌ ${gate.name}`);
          results.gatesFailed.push(gateName);
        }
      } catch (err) {
        console.error(`  ❌ ${gate.name}: ${err.message}`);
        results.gatesFailed.push(gateName);
      }
    }

    const hardFailGates = task.validation.hardFailOn || [];
    const failedHard = results.gatesFailed.filter(g => hardFailGates.includes(g));

    console.log();
    if (failedHard.length > 0) {
      console.error(`❌ BLOCKED: Hard fail on [${failedHard.join(', ')}]`);
      process.exit(1);
    }

    console.log(`✅ ALLOWED: All gates passed\n`);
    await mkdir('.tmp', { recursive: true });
    await writeFile('.tmp/agent-task-proof.json', JSON.stringify(results, null, 2));
    console.log(`📋 Proof: .tmp/agent-task-proof.json`);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
