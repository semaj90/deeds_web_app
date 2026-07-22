#!/usr/bin/env node

/**
 * Parallel Gates Orchestrator (Gates 2-4)
 *
 * Gates can run concurrently with Gate 12:
 * - Gate 2: Autoencoder training (8h GPU)
 * - Gate 3: tree_node_id propagation (6h CPU)
 * - Gate 4: Neo4j PageRank computation (12h CPU)
 *
 * This orchestrator manages parallel execution with shared state tracking.
 *
 * Usage:
 *   npx tsx scripts/atlas/parallel-gates-orchestrator.mts --dry-run
 *   npx tsx scripts/atlas/parallel-gates-orchestrator.mts --apply
 *   npx tsx scripts/atlas/parallel-gates-orchestrator.mts --monitor
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

interface GateStatus {
  gate: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  duration?: number;
  processId?: number;
  error?: string;
}

interface OrchestratorState {
  startedAt: number;
  gates: Map<string, GateStatus>;
}

class ParallelGatesOrchestrator {
  private stateFile = join(process.cwd(), '.tmp/parallel-gates-state.json');
  private state: OrchestratorState;

  constructor() {
    this.state = {
      startedAt: Date.now(),
      gates: new Map([
        ['gate-2-autoencoder', { gate: 'gate-2-autoencoder', status: 'pending' }],
        ['gate-3-tree-nodes', { gate: 'gate-3-tree-nodes', status: 'pending' }],
        ['gate-4-pagerank', { gate: 'gate-4-pagerank', status: 'pending' }],
      ]),
    };
    this.loadState();
  }

  private loadState() {
    try {
      const content = readFileSync(this.stateFile, 'utf-8');
      const loaded = JSON.parse(content);
      this.state.gates = new Map(Object.entries(loaded.gates));
    } catch {
      // File doesn't exist yet, use default state
    }
  }

  private saveState() {
    const data = {
      startedAt: this.state.startedAt,
      gates: Object.fromEntries(this.state.gates),
    };
    writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
  }

  async runParallel(dryRun = false) {
    console.log('═'.repeat(80));
    console.log('PARALLEL GATES ORCHESTRATOR (Gates 2-4)');
    console.log('═'.repeat(80));
    console.log();

    const gate2 = this.runGate('gate-2-autoencoder', 'Gate 2: Autoencoder Training (8h GPU)', dryRun);
    const gate3 = this.runGate('gate-3-tree-nodes', 'Gate 3: tree_node_id Propagation (6h CPU)', dryRun);
    const gate4 = this.runGate('gate-4-pagerank', 'Gate 4: Neo4j PageRank (12h CPU)', dryRun);

    const results = await Promise.allSettled([gate2, gate3, gate4]);

    console.log();
    console.log('═'.repeat(80));
    console.log('PARALLEL GATES SUMMARY');
    console.log('═'.repeat(80));

    results.forEach((result, idx) => {
      const gates = ['gate-2-autoencoder', 'gate-3-tree-nodes', 'gate-4-pagerank'];
      const status = this.state.gates.get(gates[idx]);
      if (status) {
        const duration = status.duration ? `(${(status.duration / 1000).toFixed(1)}s)` : '';
        console.log(`${status.gate}: ${status.status} ${duration}`);
      }
    });

    console.log();
    this.printTotalDuration();
  }

  private runGate(gateId: string, label: string, dryRun = false): Promise<void> {
    return new Promise((resolve) => {
      const gate = this.state.gates.get(gateId)!;
      gate.status = 'running';
      gate.startTime = Date.now();
      this.saveState();

      console.log(`▶ ${label}`);

      if (dryRun) {
        // Simulate gate execution
        setTimeout(() => {
          gate.status = 'completed';
          gate.endTime = Date.now();
          gate.duration = gate.endTime - gate.startTime!;
          this.saveState();
          console.log(`✅ ${gateId} completed (simulated)\n`);
          resolve();
        }, 1000);
      } else {
        // Actually run the gate
        const script = this.getGateScript(gateId);
        const args = dryRun ? ['--dry-run'] : ['--apply'];
        const proc = spawn('npx', ['tsx', script, ...args], {
          cwd: process.cwd(),
          shell: true,
          stdio: ['inherit', 'pipe', 'pipe']
        });

        gate.processId = proc.pid;
        this.saveState();

        proc.stdout?.on('data', (data) => {
          process.stdout.write(`[${gateId}] ${data}`);
        });

        proc.stderr?.on('data', (data) => {
          process.stderr.write(`[${gateId}] ERROR: ${data}`);
        });

        proc.on('close', (code) => {
          gate.status = code === 0 ? 'completed' : 'failed';
          gate.endTime = Date.now();
          gate.duration = gate.endTime - gate.startTime!;
          if (code !== 0) {
            gate.error = `Process exited with code ${code}`;
          }
          this.saveState();
          resolve();
        });
      }
    });
  }

  private getGateScript(gateId: string): string {
    const scripts: Record<string, string> = {
      'gate-2-autoencoder': 'scripts/atlas/train-autoencoder-768-64.mts',
      'gate-3-tree-nodes': 'scripts/atlas/propagate-tree-node-ids.mts',
      'gate-4-pagerank': 'scripts/atlas/compute-neo4j-pagerank.mts',
    };
    return scripts[gateId] || '';
  }

  private printTotalDuration() {
    const durations = Array.from(this.state.gates.values())
      .filter(g => g.duration)
      .map(g => g.duration!);

    if (durations.length === 0) return;

    const maxDuration = Math.max(...durations);
    const totalWallClock = (maxDuration / 1000).toFixed(1);
    const totalCPUTime = (durations.reduce((a, b) => a + b, 0) / 1000).toFixed(1);

    console.log(`Wall-clock time:  ${totalWallClock}s (parallel execution)`);
    console.log(`Total CPU time:   ${totalCPUTime}s (if sequential)`);
    console.log(`Parallelism gain: ${(durations.reduce((a, b) => a + b, 0) / maxDuration).toFixed(1)}x`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const orchestrator = new ParallelGatesOrchestrator();

  if (args.includes('--monitor')) {
    // TODO: Implement live monitoring
    console.log('Monitor mode not yet implemented');
  } else {
    await orchestrator.runParallel(dryRun);
  }
}

main().catch(err => {
  console.error('❌ Orchestrator failed:', err);
  process.exit(1);
});
