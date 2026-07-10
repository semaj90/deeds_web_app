#!/usr/bin/env node

/**
 * Phase 2A.3: Live Trace Collection
 *
 * Collect 160+ deterministic routing traces through the full pipeline:
 * 1. POST /api/agent/route → get ranked tools
 * 2. POST /api/agent/execute → dispatch selected tool
 * 3. Verify telemetry persisted (tool_call_events + outcome_ledger)
 * 4. Build HMM training corpus (state transitions + success rates)
 *
 * Usage:
 *   node scripts/phase2a3-collect-traces.mjs [--limit 160] [--dry-run] [--verbose]
 *
 * Output:
 *   - Postgres: 160 traces across tool_call_events + outcome_ledger
 *   - Report: ./reports/trace-collection-2026-07-09.md
 */

import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const ARGS = {
  limit: parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '160'),
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose')
};

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || 'legal_admin_pass',
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

// Test queries that should produce different router decisions
const TEST_QUERIES = [
  'Find implementation of authentication middleware',
  'Search for database schema definitions',
  'Locate vector search implementation',
  'Find error handling patterns in API routes',
  'Search for type definitions and interfaces',
  'Find RabbitMQ integration code',
  'Search for async/await patterns',
  'Locate test files and test patterns',
  'Find configuration files',
  'Search for documentation and comments',
  'Find import statements and module structure',
  'Locate function definitions',
  'Search for error types and exceptions',
  'Find middleware implementations',
  'Locate UI component code'
];

// State machine states for validation
const VALID_STATES = ['RETRIEVE', 'SYNTHESIZE', 'DONE', 'ESCALATE', 'RECOVERY'];
const VALID_RESULT_CLASSES = ['answer', 'candidates', 'partial', 'empty', 'validation_error', 'transport_error', 'tool_error', 'timeout'];

class TraceCollector {
  constructor() {
    this.traces = [];
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      byResultClass: {},
      byNextState: {},
      avgDurationMs: 0,
      errors: []
    };
  }

  async collectTrace(index, query) {
    const traceId = uuid();
    const startTime = Date.now();

    try {
      // Step 1: Route query to select best tool
      const routeResponse = await fetch(`${BASE_URL}/api/agent/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          previousState: 'RETRIEVE',
          constraints: { readOnly: true },
          topK: 3
        })
      });

      if (!routeResponse.ok) {
        throw new Error(`Route failed: ${routeResponse.status}`);
      }

      const routeResult = await routeResponse.json();
      if (!routeResult.selectedTool) {
        throw new Error('No tool selected by router');
      }

      if (ARGS.verbose) {
        console.log(`  [${index}] Route: ${routeResult.selectedTool.name} (${(routeResult.confidenceScore * 100).toFixed(0)}% confidence)`);
      }

      // Step 2: Execute selected tool
      const executeResponse = await fetch(`${BASE_URL}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId,
          selectedTool: {
            name: routeResult.selectedTool.name,
            namespace: routeResult.selectedTool.name.split('.')[0]
          },
          arguments: { query },
          dry_run: false
        })
      });

      if (!executeResponse.ok) {
        throw new Error(`Execute failed: ${executeResponse.status}`);
      }

      const executeResult = await executeResponse.json();

      // Validate result structure
      if (!VALID_RESULT_CLASSES.includes(executeResult.result.resultClass)) {
        throw new Error(`Invalid result class: ${executeResult.result.resultClass}`);
      }

      if (!VALID_STATES.includes(executeResult.nextState)) {
        throw new Error(`Invalid next state: ${executeResult.nextState}`);
      }

      const durationMs = Date.now() - startTime;

      const trace = {
        traceId,
        query,
        selectedTool: routeResult.selectedTool.name,
        resultClass: executeResult.result.resultClass,
        nextState: executeResult.nextState,
        success: executeResult.result.success,
        durationMs,
        sourceRefCount: executeResult.result.sourceRefCount,
        recoveryAttempted: executeResult.recoveryPlan !== null
      };

      this.traces.push(trace);
      this.stats.total++;
      if (executeResult.result.success) {
        this.stats.successful++;
      } else {
        this.stats.failed++;
      }

      // Tally by result class
      this.stats.byResultClass[trace.resultClass] = (this.stats.byResultClass[trace.resultClass] || 0) + 1;

      // Tally by next state
      this.stats.byNextState[trace.nextState] = (this.stats.byNextState[trace.nextState] || 0) + 1;

      if (ARGS.verbose) {
        console.log(`  [${index}] Execute: ${trace.resultClass} → ${trace.nextState} (${durationMs}ms)`);
      }

      return trace;
    } catch (err) {
      this.stats.failed++;
      this.stats.errors.push({ index, query, error: err.message });

      if (ARGS.verbose) {
        console.log(`  [${index}] ❌ Error: ${err.message}`);
      }

      return null;
    }
  }

  async collectBatch(startIndex, batchSize) {
    const results = [];
    for (let i = 0; i < batchSize; i++) {
      const queryIndex = (startIndex + i) % TEST_QUERIES.length;
      const query = TEST_QUERIES[queryIndex];
      const trace = await this.collectTrace(startIndex + i + 1, query);
      if (trace) {
        results.push(trace);
      }
      // Stagger requests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
  }

  computeStats() {
    if (this.traces.length > 0) {
      this.stats.avgDurationMs = this.traces.reduce((sum, t) => sum + t.durationMs, 0) / this.traces.length;
    }
  }

  async verifyTelemetry() {
    console.log('\n📊 Verifying Telemetry Persistence...');

    try {
      const eventCount = await pool.query(
        'SELECT COUNT(*) as count FROM tool_call_events WHERE created_at > now() - interval \'10 minutes\''
      );
      const outcomeCount = await pool.query(
        'SELECT COUNT(*) as count FROM outcome_ledger WHERE created_at > now() - interval \'10 minutes\''
      );

      console.log(`✅ tool_call_events: ${eventCount.rows[0].count} rows (last 10min)`);
      console.log(`✅ outcome_ledger: ${outcomeCount.rows[0].count} rows (last 10min)`);

      // Sample HMM transitions
      const transitions = await pool.query(`
        SELECT previous_state, next_state, COUNT(*) as count
        FROM outcome_ledger
        WHERE created_at > now() - interval '10 minutes'
        GROUP BY previous_state, next_state
        ORDER BY count DESC
        LIMIT 10
      `);

      console.log(`\n📈 State Transitions (Top 10):`);
      for (const row of transitions.rows) {
        console.log(`   ${row.previous_state} → ${row.next_state}: ${row.count}`);
      }

      return true;
    } catch (err) {
      console.error(`❌ Telemetry verification failed: ${err.message}`);
      return false;
    }
  }

  async generateReport() {
    this.computeStats();

    const report = `# Phase 2A.3: Live Trace Collection Report
**Date**: ${new Date().toISOString()}
**Limit**: ${ARGS.limit} traces
**Collected**: ${this.stats.total} traces

## Summary
- **Successful**: ${this.stats.successful} (${((this.stats.successful / this.stats.total) * 100).toFixed(1)}%)
- **Failed**: ${this.stats.failed}
- **Average Duration**: ${this.stats.avgDurationMs.toFixed(0)}ms

## Result Class Distribution
${Object.entries(this.stats.byResultClass)
  .sort((a, b) => b[1] - a[1])
  .map(([cls, count]) => `- ${cls}: ${count}`)
  .join('\n')}

## Next State Distribution
${Object.entries(this.stats.byNextState)
  .sort((a, b) => b[1] - a[1])
  .map(([state, count]) => `- ${state}: ${count}`)
  .join('\n')}

## Errors (${this.stats.errors.length})
${this.stats.errors.length > 0
  ? this.stats.errors.slice(0, 10).map(e => `- [${e.index}] ${e.query}: ${e.error}`).join('\n')
  : 'None'}

## HMM Training Corpus
- Traces collected: ${this.stats.total}
- Unique tools: ${new Set(this.traces.map(t => t.selectedTool)).size}
- Coverage: ${Object.keys(this.stats.byNextState).length} / ${VALID_STATES.length} states visited

## Next Steps
1. Analyze state transition matrix for cycle detection
2. Compute success rates by (tool, result_class) pair
3. Build HMM transition matrix for Phase 2B training
4. Identify low-confidence routing decisions for retraining
`;

    const reportsDir = path.join(process.cwd(), 'reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const reportPath = path.join(reportsDir, 'trace-collection-2026-07-09.md');
    await fs.writeFile(reportPath, report);

    console.log(`\n📄 Report saved to: ${reportPath}`);
    return report;
  }
}

async function main() {
  console.log('🚀 Phase 2A.3: Live Trace Collection');
  console.log('='.repeat(50));
  console.log(`Target: ${ARGS.limit} traces`);
  console.log(`Dry-run: ${ARGS.dryRun}`);
  console.log();

  if (ARGS.dryRun) {
    console.log('⏭️  Dry-run mode: skipping actual collection');
    process.exit(0);
  }

  const collector = new TraceCollector();

  try {
    // Collect traces in batches of 20
    const batchSize = 20;
    const numBatches = Math.ceil(ARGS.limit / batchSize);

    for (let batch = 0; batch < numBatches; batch++) {
      const startIndex = batch * batchSize;
      const remaining = ARGS.limit - startIndex;
      const currentBatchSize = Math.min(batchSize, remaining);

      console.log(`\n📦 Batch ${batch + 1}/${numBatches} (${currentBatchSize} traces)`);
      await collector.collectBatch(startIndex, currentBatchSize);
      console.log(`   Collected: ${collector.stats.total}/${ARGS.limit}`);
    }

    // Verify telemetry
    await collector.verifyTelemetry();

    // Generate report
    const report = await collector.generateReport();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Phase 2A.3 Complete!');
    console.log(`   - ${collector.stats.total} traces collected`);
    console.log(`   - ${collector.stats.successful} successful executions`);
    console.log(`   - ${Object.keys(collector.stats.byNextState).length} states visited`);
    console.log(`   - HMM training corpus ready for Phase 2B`);
  } catch (err) {
    console.error('\n❌ Collection error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
