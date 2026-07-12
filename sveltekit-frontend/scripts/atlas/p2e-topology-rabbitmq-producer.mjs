#!/usr/bin/env node
/**
 * Phase 2E: Topology Worker RabbitMQ Producer
 *
 * Publishes bounded packets to RabbitMQ topology queues for GPU workers (SOM, KMeans, PageRank)
 *
 * Usage:
 *   node scripts/atlas/p2e-topology-rabbitmq-producer.mjs --dry --limit=100
 *   node scripts/atlas/p2e-topology-rabbitmq-producer.mjs --limit=1000
 */

import pg from 'pg';
import amqp from 'amqplib';
const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '100'
);

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: 'legal_admin_password', // Will be overridden by env if needed
};

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

// RabbitMQ queues for topology workers
const QUEUES = {
  kmeans: 'topology.kmeans',
  som: 'topology.som',
  pagerank: 'topology.pagerank',
  results: 'topology.results'
};

async function produceTopologyBatch() {
  const dbPool = new Pool(DB_CONFIG);

  try {
    console.log('\n📦 Phase 2E: Topology RabbitMQ Producer\n');
    console.log(`Limit: ${limit} packets`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}\n`);

    // Step 1: Query eligible packets (with embeddings + lexical)
    console.log('📊 Step 1: Querying eligible packets...');

    const client = await dbPool.connect();
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_label,
        ap.community_id,
        afe.lexical_terms,
        ap.qdrant_point_id,
        ap.sha256
      FROM atlas_packets ap
      LEFT JOIN atlas_feature_envelopes afe ON ap.packet_key = afe.packet_key
      WHERE ap.qdrant_point_id IS NOT NULL
        AND afe.lexical_terms IS NOT NULL
        AND ap.sha256 IS NOT NULL
      ORDER BY RANDOM()
      LIMIT $1
    `, [limit]);
    client.release();

    const packets = result.rows;
    console.log(`  ✓ Found ${packets.length} eligible packets\n`);

    if (packets.length === 0) {
      console.log('No eligible packets. Exiting.\n');
      await dbPool.end();
      process.exit(0);
    }

    // Step 2: Build job payloads for GPU workers
    console.log('🔨 Step 2: Building job payloads...\n');

    // For simplicity in smoke test, create one batch job per worker type
    const jobPayloads = {
      kmeans: {
        run_id: `p2e-kmeans-${Date.now()}`,
        job_type: 'kmeans_clustering',
        packet_keys: packets.map(p => p.packet_key),
        metadata: {
          k: 10,
          max_iter: 50,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1'
        },
        requested_at: new Date().toISOString()
      },
      som: {
        run_id: `p2e-som-${Date.now()}`,
        job_type: 'som_training',
        packet_keys: packets.map(p => p.packet_key),
        metadata: {
          grid_size: 10,
          epochs: 20,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1'
        },
        requested_at: new Date().toISOString()
      },
      pagerank: {
        run_id: `p2e-pagerank-${Date.now()}`,
        job_type: 'pagerank_scoring',
        packet_keys: packets.map(p => p.packet_key),
        metadata: {
          damping: 0.85,
          iterations: 30,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1'
        },
        requested_at: new Date().toISOString()
      }
    };

    console.log(`  ✓ KMeans job: ${jobPayloads.kmeans.packet_keys.length} packets`);
    console.log(`  ✓ SOM job: ${jobPayloads.som.packet_keys.length} packets`);
    console.log(`  ✓ PageRank job: ${jobPayloads.pagerank.packet_keys.length} packets\n`);

    if (isDryRun) {
      console.log('📝 [DRY-RUN] Sample job payload (KMeans):');
      console.log(JSON.stringify(jobPayloads.kmeans, null, 2));
      console.log('\n✨ DRY-RUN COMPLETE\n');
      await dbPool.end();
      process.exit(0);
    }

    // Step 3: Connect to RabbitMQ and publish jobs
    console.log('📡 Step 3: Publishing to RabbitMQ...\n');

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Declare durable queues (will persist if they don't exist)
    const declarePromises = Object.values(QUEUES).map(queue =>
      channel.assertQueue(queue, { durable: true })
    );
    await Promise.all(declarePromises);
    console.log(`  ✓ Declared ${Object.keys(QUEUES).length} RabbitMQ queues\n`);

    // Publish jobs to respective queues
    let published = 0;

    for (const [worker, job] of Object.entries(jobPayloads)) {
      const queue = QUEUES[worker];
      const message = JSON.stringify(job);

      await channel.sendToQueue(queue, Buffer.from(message), {
        persistent: true,
        contentType: 'application/json'
      });

      published++;
      console.log(`  ✓ Published ${worker} job to ${queue}`);
    }

    console.log(`\n  Total published: ${published} jobs\n`);

    // Close RabbitMQ connection
    await channel.close();
    await connection.close();
    console.log('✨ Phase 2E Producer COMPLETE!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

produceTopologyBatch();
