#!/usr/bin/env node
/**
 * Phase 106: Route HMM Output to Kanban/Task Router
 *
 * Converts HMM error state recommendations into actionable tasks.
 * Routes each packet to appropriate repair lane via Kanban system.
 *
 * Contract:
 *   HMM recommendation (error_state, confidence)
 *   → route to repair lane (qdrant_bridge, tree_propagation, etc.)
 *   → enqueue as Kanban task
 *   → ACP dispatcher picks up task for execution
 *
 * Task shape:
 *   task_id: unique identifier
 *   packet_key: which packet needs repair
 *   source_ref: source file reference
 *   feature_id: feature identifier
 *   hmm_state: error classification (StructureError, VectorError, etc.)
 *   repair_lane: recommended tool/process
 *   confidence: HMM confidence score (0.0-1.0)
 *   recommended_command: npm or node command to run
 *   safe_scope: number of packets affected
 *   created_at: timestamp
 *
 * Usage:
 *   npm run atlas:route:hmm:kanban:dry --limit=50
 *   npm run atlas:route:hmm:kanban:apply --limit=500
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '500'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Map HMM state to repair lane and command
 */
function routeToRepairLane(hmm_state) {
  const routing = {
    StructureError: {
      repair_lane: 'ast_structure_repair',
      command: 'npm run atlas:phase1:ast-grep:dry',
      description: 'AST extraction and tree propagation'
    },
    SemanticError: {
      repair_lane: 'semantic_concepts_extraction',
      command: 'npm run atlas:phase8:langextract:dry',
      description: 'LangExtract concept extraction'
    },
    VectorError: {
      repair_lane: 'embedding_generation',
      command: 'npm run atlas:embed:regenerate:dry',
      description: 'Vector embedding generation'
    },
    QdrantBridgeError: {
      repair_lane: 'qdrant_indexing',
      command: 'npm run atlas:qdrant:index:dry',
      description: 'Qdrant vector indexing'
    },
    TopologyError: {
      repair_lane: 'topology_reconstruction',
      command: 'npm run atlas:topology:reconstruct:dry',
      description: 'SOM and PageRank reconstruction'
    },
    TreePropagationError: {
      repair_lane: 'tree_node_backfill',
      command: 'npm run atlas:tree-node:backfill:dry',
      description: 'Tree node ID propagation'
    },
    IdentityError: {
      repair_lane: 'identity_resolution',
      command: 'npm run atlas:identity:validate:dry',
      description: 'Packet identity validation'
    },
    CachePromotionError: {
      repair_lane: 'cache_invalidation',
      command: 'npm run atlas:cache:invalidate:dry',
      description: 'Cache invalidation and rewarming'
    }
  };

  return routing[hmm_state] || {
    repair_lane: 'unknown_repair',
    command: 'manual_review_required',
    description: 'Unknown HMM state, requires manual review'
  };
}

async function main() {
  console.log(`\n[PHASE 106] Route HMM Output to Kanban [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch HMM recommendations
    console.log('Step 1: Fetch HMM recommendations...');
    const hmmResult = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.feature_label,
        apm.hmm_recommendations
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_metrics apm ON ap.packet_key = apm.packet_key
      WHERE apm.hmm_recommendations IS NOT NULL
      AND apm.hmm_recommendations != '{}'::jsonb
      LIMIT $1
    `, [limit]);

    const hmmRows = hmmResult.rows;
    console.log(`  [OK] Found ${hmmRows.length} HMM recommendations\n`);

    if (hmmRows.length === 0) {
      console.log('  [WARN] No HMM recommendations found.\n');
      console.log('[SUCCESS] No tasks to route.\n');
      process.exit(0);
    }

    // 2. Route each recommendation to Kanban
    console.log('Step 2: Route recommendations to Kanban tasks...');

    const tasks = [];
    const laneCounts = {};

    for (const row of hmmRows) {
      const hmm = row.hmm_recommendations;
      const errorState = hmm.error_state || 'UnknownError';
      const confidence = hmm.confidence || 0.5;

      // Route to repair lane
      const routing = routeToRepairLane(errorState);

      // Generate task
      const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const task = {
        task_id: taskId,
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        hmm_state: errorState,
        repair_lane: routing.repair_lane,
        confidence: confidence,
        recommended_command: routing.command,
        description: routing.description,
        safe_scope: 1, // Single packet
        created_at: new Date().toISOString()
      };

      tasks.push(task);

      // Track lane distribution
      laneCounts[routing.repair_lane] = (laneCounts[routing.repair_lane] || 0) + 1;
    }

    console.log(`  [OK] Routed ${tasks.length} recommendations\n`);

    if (isDryRun) {
      console.log('Sample Kanban tasks (first 5):\n');
      tasks.slice(0, 5).forEach(task => {
        console.log(`  Task: ${task.task_id}`);
        console.log(`    Packet: ${task.packet_key}`);
        console.log(`    HMM State: ${task.hmm_state}`);
        console.log(`    Repair Lane: ${task.repair_lane}`);
        console.log(`    Confidence: ${task.confidence.toFixed(2)}`);
        console.log(`    Command: ${task.recommended_command}`);
        console.log();
      });

      console.log('Repair Lane Distribution:');
      Object.entries(laneCounts).forEach(([lane, count]) => {
        console.log(`  ${lane}: ${count} tasks (${(count / tasks.length * 100).toFixed(1)}%)`);
      });
      console.log();

      console.log('[OK] Dry-run complete. Use apply to enqueue.\n');
      process.exit(0);
    }

    // 3. Persist tasks to NDJSON (Kanban queue)
    console.log('Step 3: Enqueue tasks to Kanban...');

    const tmpDir = path.join(process.cwd(), '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const kanbanPath = path.join(tmpDir, 'hmm-kanban-actions.ndjson');
    const ndjsonContent = tasks.map(t => JSON.stringify(t)).join('\n') + '\n';
    fs.writeFileSync(kanbanPath, ndjsonContent);
    console.log(`  [OK] ${tasks.length} tasks enqueued to ${kanbanPath}\n`);

    // 4. Generate summary report
    console.log('Step 4: Generate routing report...');

    const reportsDir = path.join(process.cwd(), 'docs', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTasks: tasks.length,
        laneCounts,
        confidenceStats: {
          high: tasks.filter(t => t.confidence >= 0.85).length,
          medium: tasks.filter(t => t.confidence >= 0.70 && t.confidence < 0.85).length,
          low: tasks.filter(t => t.confidence < 0.70).length
        }
      },
      files: {
        ndjson: kanbanPath,
        json: path.join(reportsDir, 'hmm-kanban-actions.json')
      },
      samples: tasks.slice(0, 10)
    };

    const reportPath = path.join(reportsDir, 'hmm-kanban-actions.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  [OK] Report written to ${reportPath}\n`);

    // 5. Summary
    console.log('Kanban Routing Summary:');
    console.log(`  Total tasks enqueued: ${tasks.length}`);
    console.log();

    console.log('Repair Lane Distribution:');
    Object.entries(laneCounts).forEach(([lane, count]) => {
      console.log(`  ${lane}: ${count} (${(count / tasks.length * 100).toFixed(1)}%)`);
    });
    console.log();

    console.log('Confidence Distribution:');
    console.log(`  High (≥0.85): ${report.summary.confidenceStats.high}`);
    console.log(`  Medium (0.70-0.84): ${report.summary.confidenceStats.medium}`);
    console.log(`  Low (<0.70): ${report.summary.confidenceStats.low}`);
    console.log();

    console.log('[SUCCESS] HMM Output Routed to Kanban.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
