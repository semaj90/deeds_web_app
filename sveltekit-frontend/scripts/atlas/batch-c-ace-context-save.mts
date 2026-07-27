#!/usr/bin/env tsx
/**
 * Batch C: Save ACE Context to Valkey
 * Persists Batch C completion metadata to Redis for downstream retrieval
 */

import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

function log(msg: string) {
  console.log(`[Batch C ACE] ${msg}`);
}

async function saveACEContext() {
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    log('Connected to Valkey');

    // Read Batch C audit report
    const reportPath = path.join(
      process.cwd(),
      'reports',
      'batch-c',
      'batch-c-ontology-audit.json'
    );
    const auditData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

    // Prepare ACE context metadata
    const batchCContext = {
      batch_id: 'batch-c-ontology-observations',
      version: '1.0',
      phase: 'parent-atlas-p0-p1',
      status: 'COMPLETE',
      total_nodes: auditData.total_nodes_processed,
      total_observations: auditData.total_observations,
      lanes: auditData.nodes_by_lane,
      lane_coverage: auditData.lane_coverage,
      gates: auditData.gates.map((g: any) => ({
        gate_id: g.gate_id,
        pass: g.pass,
        metric: g.metric,
      })),
      all_gates_pass: auditData.gates.every((g: any) => g.pass),
      executed_at: auditData.timestamp,
      duration_ms: auditData.duration_ms,
    };

    // Save to Valkey with TTL (24h)
    const contextKey = 'ace:batch-c:ontology-context';
    await redis.setex(
      contextKey,
      86400, // 24 hours
      JSON.stringify(batchCContext)
    );
    log(`✓ Saved ACE context to ${contextKey}`);

    // Save batch completion marker
    const completionKey = 'ace:batch:completed:batch-c';
    await redis.setex(completionKey, 86400, JSON.stringify({ completed_at: new Date().toISOString() }));
    log(`✓ Marked batch-c as complete in ${completionKey}`);

    // Save lane statistics for downstream retrieval
    const laneStatsKey = 'ace:batch-c:lane-stats';
    await redis.setex(
      laneStatsKey,
      86400,
      JSON.stringify(auditData.nodes_by_lane)
    );
    log(`✓ Saved lane statistics to ${laneStatsKey}`);

    // Create index for Batch D readiness
    const readinessKey = 'ace:batch:ready:batch-d';
    const readinessData = {
      predecessor: 'batch-c',
      ready: true,
      available_nodes: auditData.total_nodes_processed,
      observations_indexed: auditData.total_observations,
      all_lanes_present: auditData.gates[2].pass && auditData.gates[4].pass,
      suggested_next_step: 'batch-d-semantic-embeddings',
    };
    await redis.setex(readinessKey, 86400, JSON.stringify(readinessData));
    log(`✓ Set Batch D readiness in ${readinessKey}`);

    log(`\n=== Batch C ACE Context Saved ===`);
    log(`Nodes processed: ${batchCContext.total_nodes}`);
    log(`Total observations: ${batchCContext.total_observations}`);
    log(`All gates pass: ${batchCContext.all_gates_pass}`);
    log(`Next step: Batch D (Semantic Embeddings)`);
    log('');

    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error(`[Batch C ACE] ERROR: ${(err as Error).message}`);
    if (redis.isOpen) await redis.quit();
    process.exit(1);
  }
}

saveACEContext();
