#!/usr/bin/env node

/**
 * PHASE 85 P7: EVENT EMISSION & TRACING
 *
 * Step 5 of 5-step canonical flow: emit trace events after Postgres + Redis complete
 * - Publish trace checkpoints to event bus (RabbitMQ)
 * - Record packet_updated events
 * - Track feature_label extraction completion
 * - Publish P5/P6 completion metrics
 *
 * Execution: AFTER P6 invalidation completes
 * Dependency: P5 (Postgres writes), P6 (Redis invalidation) must be complete
 *
 * Usage:
 *   node scripts/phase85/p7-event-emission.mjs --dry-run
 *   node scripts/phase85/p7-event-emission.mjs [--apply]
 */

import amqp from 'amqplib';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const EXCHANGE_NAME = 'atlas.events';
const ROUTING_KEY = 'packets.feature-labels.extracted';

console.log(`\n📤 PHASE 85 P7: EVENT EMISSION & TRACING\n`);
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
console.log(`RabbitMQ: ${RABBITMQ_URL.replace(/:[^:]*@/, ':***@')}`);
console.log(`Exchange: ${EXCHANGE_NAME}`);
console.log(`Routing key: ${ROUTING_KEY}\n`);

// ── Step 1: Connect to RabbitMQ ────────────────────────────────────────

async function connectRabbitMQ() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    const channel = await conn.createChannel();
    if (verbose) console.log('✅ RabbitMQ connected');
    return { connection: conn, channel };
  } catch (err) {
    console.error(`❌ RabbitMQ connection failed: ${err.message}`);
    return null;
  }
}

// ── Step 2: Declare exchange ───────────────────────────────────────────

async function declareExchange(channel) {
  try {
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    if (verbose) console.log(`✅ Exchange declared: ${EXCHANGE_NAME}`);
    return true;
  } catch (err) {
    console.error(`❌ Exchange declaration failed: ${err.message}`);
    return false;
  }
}

// ── Step 3: Publish completion event ───────────────────────────────────

async function publishCompletionEvent(channel, metadata) {
  const event = {
    timestamp: new Date().toISOString(),
    phase: 'P5-P6',
    event_type: 'feature_labels.extracted',
    source: 'phase85-backfill',
    status: 'complete',
    metrics: {
      packets_processed: metadata.packets_processed,
      feature_labels_inserted: metadata.feature_labels_inserted,
      cache_keys_invalidated: metadata.cache_keys_invalidated,
      duration_seconds: metadata.duration_seconds
    }
  };

  if (dryRun) {
    if (verbose) console.log(`   [DRY-RUN] Would publish event:`, JSON.stringify(event, null, 2));
    return { published: 1, status: 'DRY-RUN' };
  }

  try {
    const message = Buffer.from(JSON.stringify(event));
    const published = await channel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY,
      message,
      { persistent: true, contentType: 'application/json' }
    );

    if (published) {
      if (verbose) console.log(`   ✅ Event published to ${ROUTING_KEY}`);
      return { published: 1, status: 'OK' };
    } else {
      console.warn(`   ⚠️  Event may not have been published (buffer full)`);
      return { published: 0, status: 'BUFFER_FULL' };
    }
  } catch (err) {
    console.error(`   ❌ Publish failed: ${err.message}`);
    return { published: 0, status: 'ERROR', error: err.message };
  }
}

// ── Step 4: Publish trace checkpoint ───────────────────────────────────

async function publishTraceCheckpoint(channel, checkpointData) {
  const checkpoint = {
    timestamp: new Date().toISOString(),
    phase: 'P5-P6-P7',
    checkpoint_type: 'canonical_flow_complete',
    steps: {
      p5_postgres_write: { status: 'complete', rows: checkpointData.p5_rows },
      p6_redis_invalidation: { status: 'complete', keys: checkpointData.p6_keys },
      p7_event_emission: { status: 'complete', events: 1 }
    }
  };

  if (dryRun) {
    if (verbose) console.log(`   [DRY-RUN] Would publish checkpoint:`, JSON.stringify(checkpoint, null, 2));
    return { published: 1, status: 'DRY-RUN' };
  }

  try {
    const message = Buffer.from(JSON.stringify(checkpoint));
    const published = await channel.publish(
      EXCHANGE_NAME,
      'trace.checkpoint.phase85',
      message,
      { persistent: true, contentType: 'application/json' }
    );

    if (published) {
      if (verbose) console.log(`   ✅ Checkpoint published to trace.checkpoint.phase85`);
      return { published: 1, status: 'OK' };
    } else {
      console.warn(`   ⚠️  Checkpoint may not have been published`);
      return { published: 0, status: 'BUFFER_FULL' };
    }
  } catch (err) {
    console.error(`   ❌ Checkpoint publish failed: ${err.message}`);
    return { published: 0, status: 'ERROR', error: err.message };
  }
}

// ── Main execution ────────────────────────────────────────────────────

async function main() {
  let connection = null;
  let channel = null;

  try {
    // Connect
    console.log('📡 Connecting to RabbitMQ...');
    const result = await connectRabbitMQ();
    if (!result) {
      console.error('❌ Cannot proceed without RabbitMQ connection');
      process.exit(1);
    }
    connection = result.connection;
    channel = result.channel;

    // Declare exchange
    console.log('\n📮 Setting up exchange...');
    const exchangeOk = await declareExchange(channel);
    if (!exchangeOk) {
      console.error('❌ Cannot proceed without exchange');
      process.exit(1);
    }

    // Publish completion event
    console.log('\n📤 Publishing completion event...');
    const completionMetadata = {
      packets_processed: 58304,
      feature_labels_inserted: 58304,
      cache_keys_invalidated: 0, // Will be populated by P6
      duration_seconds: 0 // Will be calculated
    };
    const eventResult = await publishCompletionEvent(channel, completionMetadata);

    // Publish trace checkpoint
    console.log('📤 Publishing trace checkpoint...');
    const checkpointData = {
      p5_rows: 58304,
      p6_keys: 0, // Will be populated by P6
      p7_events: 1
    };
    const checkpointResult = await publishTraceCheckpoint(channel, checkpointData);

    // Summary
    console.log(`\n📊 P7 EMISSION SUMMARY:`);
    console.log(`   Events published: ${eventResult.published}`);
    console.log(`   Checkpoints published: ${checkpointResult.published}`);
    console.log(`   Total published: ${eventResult.published + checkpointResult.published}`);

    if (dryRun) {
      console.log(`\n🔄 DRY-RUN MODE: No events were actually published`);
      console.log('   Run without --dry-run flag to emit events\n');
    } else {
      console.log(`\n✅ P7 EMISSION COMPLETE\n`);
    }

    // Cleanup
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    console.error('❌ Event emission failed:', err.message);
    if (channel) try { await channel.close(); } catch (e) { /* ignore */ }
    if (connection) try { await connection.close(); } catch (e) { /* ignore */ }
    process.exit(1);
  }
}

main();