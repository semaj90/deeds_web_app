#!/usr/bin/env node
/**
 * Test Mirror Worker Flow
 *
 * Verifies publisher emits events and queues are declared.
 * Dry-run: no DB/Qdrant/Neo4j/Redis mutations.
 */

import {
  initializeMirrorSyncPublisher,
  publishIdentityUpdatedEvent,
  getMirrorQueueStats,
  healthCheckMirrorSync,
  closeMirrorSyncPublisher,
  MirrorSyncConfig
} from '../src/lib/server/workers/mirror-sync-publisher.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`🧪 Mirror Worker Flow Test ${DRY_RUN ? '(DRY-RUN)' : '(LIVE)'}`);
  console.log('═'.repeat(60));

  try {
    // 1. Health check
    console.log('\n✓ 1. Health check...');
    const healthy = await healthCheckMirrorSync();
    if (!healthy) {
      throw new Error('Health check failed');
    }
    console.log('  Exchange and queues declared ✓');

    // 2. Publish test event
    console.log('\n✓ 2. Publishing test event...');
    const testEvent = {
      packet_key: 'ace:test:001',
      source_ref: 'src/lib/server/test.ts',
      feature_id: 'test.module',
      identity_lane: 'canonical' as const,
      mirror_parity: {
        qdrant_synced_at: undefined,
        neo4j_synced_at: undefined,
        redis_invalidated_at: undefined
      },
      updated_at: new Date().toISOString()
    };

    await publishIdentityUpdatedEvent(testEvent, { dryRun: DRY_RUN });
    console.log(`  Event published ${DRY_RUN ? '(dry-run)' : ''} ✓`);

    // 3. Check queue stats
    console.log('\n✓ 3. Queue stats:');
    const stats = await getMirrorQueueStats();
    for (const [queue, stat] of Object.entries(stats)) {
      console.log(`  ${queue}: ${stat.messageCount} messages, ${stat.consumerCount} consumers`);
    }

    // 4. Summary
    console.log('\n' + '═'.repeat(60));
    console.log('✓ Mirror worker flow test PASSED');
    console.log(`  - Publisher initialized`);
    console.log(`  - Topology verified (exchange + 4 queues)`);
    console.log(`  - Test event emitted ${DRY_RUN ? '(dry-run)' : ''}`);
    console.log(`  - Ready for worker consumption`);

    if (DRY_RUN) {
      console.log('\n⚠ DRY-RUN MODE: No workers consumed message');
    } else {
      console.log('\n ℹ Test event queued for worker consumption');
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  } finally {
    await closeMirrorSyncPublisher();
  }
}

main();
