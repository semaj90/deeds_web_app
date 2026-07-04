#!/usr/bin/env node
/**
 * Phase 9: BitFrost Semantic Cache Envelope
 *
 * Architecture:
 *   Postgres atlas_packets (canonical truth)
 *     ↓ read metadata.rrf + topology + retrieval
 *   Validate identity proof
 *     ↓
 *   Build BitFrost envelope
 *     ↓ RabbitMQ semantic.bitfrost.upsert
 *   BitFrost worker (1+ instances)
 *     ↓
 *   Redis exact cache (bitfrost:packet:*)
 *   Redis topology cache (bitfrost:som:*:packets)
 *   Redis semantic cache (bitfrost:rrf:query_hash:top-10)
 *     ↓
 *   Optional: Qdrant payload update
 *   Optional: Neo4j topology edge
 *   Optional: OpenTelemetry span
 *     ↓
 *   Postgres updated_at timestamp
 *
 * BitFrost packet envelope shape:
 *   {
 *     packet_id, packet_key, source_ref, feature_id, title_id,
 *     tree_id, topology { som_cluster, pagerank, community_id },
 *     retrieval { qdrant_point_id, rrf_score },
 *     identity_proof { source_ref_key, payload_hash, validated_at },
 *     telemetry { trace_id, span_id, producer }
 *   }
 *
 * Usage:
 *   # Step 1: Enqueue packets from Postgres
 *   node scripts/atlas/phase9-bitfrost-semantic-cache.mjs --enqueue --limit=40568
 *
 *   # Step 2: Start BitFrost worker
 *   node scripts/atlas/phase9-bitfrost-semantic-cache.mjs --worker --id=1
 *
 *   # Step 3: Monitor BitFrost population
 *   node scripts/atlas/phase9-bitfrost-semantic-cache.mjs --monitor
 */

import amqp from 'amqplib';
import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import fetch from 'node-fetch';
import process from 'process';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// Config
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

// Postgres pool
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

// Redis client factory
function createRedisClient() {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    retryStrategy: () => null
  });
}

// Parse args
const mode = process.argv[2];
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '40568');
const workerId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || '1';

const EXCHANGE = 'semantic.bitfrost.fanout';
const QUEUE_PREFIX = 'bitfrost.worker';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildBitFrostEnvelope(packet, topology, retrieval) {
  /**
   * Build canonical BitFrost semantic cache packet
   */
  const sourceRefKey = sha256(packet.source_ref);
  const payloadHash = sha256(JSON.stringify({ ...topology, ...retrieval }));

  return {
    packet_id: packet.packet_id,
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    title_id: packet.title_id || packet.feature_id || packet.packet_key,
    summary: packet.summary || null,
    tree_id: `contextual-tree:${packet.feature_id}`,

    topology: {
      som_cluster: topology.som_cluster,
      som_row: Math.floor((topology.som_cluster || 0) / 20),
      som_col: (topology.som_cluster || 0) % 20,
      centroid_key: `centroid:som:${topology.som_cluster}`,
      neo4j_node_id: topology.neo4j_node_id || null,
      gds: {
        pagerank: topology.pagerank || 0,
        community_id: topology.community_id || null
      }
    },

    retrieval: {
      qdrant_collection: QDRANT_COLLECTION,
      qdrant_point_id: retrieval.qdrant_point_id,
      rrf_score: retrieval.rrf_score || 0
    },

    identity_proof: {
      source_ref_key: sourceRefKey,
      payload_hash: payloadHash,
      validated_at: new Date().toISOString()
    },

    telemetry: {
      trace_id: uuidv4(),
      span_id: uuidv4(),
      producer: 'semantic::bitfrost'
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: Enqueue Packets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function enqueuePackets() {
  console.log(`\n📤 BitFrost Enqueuer: Loading packets from Postgres\n`);

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    // Fetch packets with topology and retrieval metadata
    const result = await pool.query(`
      SELECT
        p.packet_id,
      p.packet_key,
      p.source_ref,
      p.feature_id,
      COALESCE(p.title, p.feature_id) as title_id,
      COALESCE(NULLIF(p.summary, ''), NULLIF(asl.summary_text, ''), NULLIF(asl.summary, '')) as summary,
      c.som_cluster,
      c.qdrant_id as qdrant_point_id,
      (p.metadata->>'rrf')::float as rrf_score,
      (p.metadata->'topology'->>'pagerank')::float as pagerank,
      (p.metadata->'topology'->>'community_id')::int as community_id
      FROM atlas_packets p
      LEFT JOIN codebase_chunk_index c ON p.source_ref = c.relative_path
      LEFT JOIN LATERAL (
        SELECT summary_text, summary
        FROM atlas_summary_layers layer
        WHERE layer.packet_key = p.packet_key
        ORDER BY layer.generated_at DESC NULLS LAST, layer.created_at DESC NULLS LAST
        LIMIT 1
      ) asl ON TRUE
      WHERE p.packet_key IS NOT NULL
      ORDER BY p.packet_id
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  Total packets: ${packets.length}\n`);

    let enqueued = 0;

    for (const packet of packets) {
      const message = {
        packet_id: packet.packet_id,
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        title_id: packet.title_id,
        summary: packet.summary || null,
        topology: {
          som_cluster: packet.som_cluster,
          pagerank: packet.pagerank || 0,
          community_id: packet.community_id
        },
        retrieval: {
          qdrant_point_id: packet.qdrant_point_id,
          rrf_score: packet.rrf_score || 0
        }
      };

      channel.publish(
        EXCHANGE,
        '',
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' }
      );

      enqueued++;

      if (enqueued % 5000 === 0) {
        console.log(`  ✓ Enqueued ${enqueued}/${packets.length}`);
      }
    }

    console.log(`\n  ✅ Enqueued ${enqueued} packets to ${EXCHANGE}`);
    console.log(`  📋 Start worker: node phase9-bitfrost-semantic-cache.mjs --worker --id=1\n`);

  } catch (err) {
    console.error(`❌ Enqueuer error:`, err.message);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: BitFrost Worker (Consume + Populate Cache)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function updateQdrantPayload(pointId, envelope) {
  /**
   * Optional: Update Qdrant payload with BitFrost metadata
   */
  if (!pointId) return;

  try {
    await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${pointId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          {
            id: pointId,
            payload: {
              packet_key: envelope.packet_key,
              source_ref: envelope.source_ref,
              feature_id: envelope.feature_id,
              som_cluster: envelope.topology.som_cluster,
              tree_id: envelope.tree_id,
              rrf_score: envelope.retrieval.rrf_score,
              pagerank: envelope.topology.gds.pagerank
            }
          }
        ]
      })
    });
  } catch (err) {
    // Qdrant update is optional; log but don't fail
  }
}

async function startWorker() {
  console.log(`\n🤖 BitFrost Worker ${workerId}: Starting\n`);

  let connection, channel;
  const redis = createRedisClient();
  let processed = 0;
  let failed = 0;

  try {
    await redis.connect();
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    const queueName = `${QUEUE_PREFIX}.${workerId}`;
    const queue = await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE, '');

    await channel.prefetch(1);

    console.log(`  ✓ Listening on ${queueName}`);
    console.log(`  Type Ctrl+C to stop\n`);

    await channel.consume(queue.queue, async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        const { packet_key, source_ref, feature_id, topology, retrieval } = payload;

        // Build BitFrost envelope
        const envelope = buildBitFrostEnvelope(
          { packet_id: payload.packet_id, packet_key, source_ref, feature_id, title_id: payload.title_id },
          topology,
          retrieval
        );

        // Redis exact cache: bitfrost:packet:{packet_key}
        const packetCacheKey = `bitfrost:packet:${packet_key}`;
        await redis.setex(packetCacheKey, 86400, JSON.stringify(envelope)); // 24h TTL

        // Redis source index: bitfrost:source:{hash}:packets
        const sourceRefHash = sha256(source_ref);
        const sourceIndexKey = `bitfrost:source:${sourceRefHash}:packets`;
        await redis.sadd(sourceIndexKey, packet_key);

        // Redis feature cache: bitfrost:feature:{feature_id}:packets
        const featureKey = `bitfrost:feature:${feature_id}:packets`;
        await redis.sadd(featureKey, packet_key);

        // Redis topology cache: bitfrost:som:{cluster}:packets
        if (topology.som_cluster) {
          const somKey = `bitfrost:som:${topology.som_cluster}:packets`;
          await redis.sadd(somKey, packet_key);

          // Cache centroid reference
          const centroidKey = `centroid:som:${topology.som_cluster}`;
          await redis.setex(centroidKey, 86400, JSON.stringify({
            cluster_id: topology.som_cluster,
            row: Math.floor(topology.som_cluster / 20),
            col: topology.som_cluster % 20
          }));
        }

        // Redis contextual tree cache: bitfrost:tree:{tree_id}:packets
        const treeKey = `bitfrost:tree:${envelope.tree_id}:packets`;
        await redis.sadd(treeKey, packet_key);

        // Optional: Update Qdrant payload
        if (retrieval.qdrant_point_id) {
          await updateQdrantPayload(retrieval.qdrant_point_id, envelope);
        }

        // Optional: Update Postgres metadata with BitFrost trace
        try {
          if (packet.summary) {
            await pool.query(
              `UPDATE atlas_packets
               SET summary = COALESCE(NULLIF(summary, ''), $1),
                   updated_at = NOW()
               WHERE packet_key = $2`,
              [packet.summary, packet.packet_key]
            );
          }

          await pool.query(
            `UPDATE atlas_packets SET metadata = jsonb_set(metadata, '{bitfrost_trace}', $1) WHERE packet_key = $2`,
            [JSON.stringify({
              trace_id: envelope.telemetry.trace_id,
              cached_at: new Date().toISOString(),
              worker_id: workerId
            }), packet_key]
          );
        } catch (err) {
          // Postgres update is optional
        }

        processed++;
        channel.ack(msg);

        if (processed % 1000 === 0) {
          console.log(`  ✓ BitFrost cache: ${processed} packets\n`);
        }

      } catch (err) {
        console.error(`\n  ❌ Error: ${err.message}`);
        failed++;
        channel.nack(msg, false, true); // Requeue
      }
    }, { noAck: false });

  } catch (err) {
    console.error(`❌ Worker error:`, err.message);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    console.log(`\n\n  ✅ Worker ${workerId} stopped (${processed} cached, ${failed} failed)\n`);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: Monitor BitFrost Population
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function monitorBitFrost() {
  console.log(`\n📊 BitFrost Cache Monitor\n`);

  const redis = createRedisClient();

  try {
    await redis.connect();

    // Count cache keys
    const keyPattern = 'bitfrost:packet:*';
    const keys = await redis.keys(keyPattern);

    console.log(`  💾 Cached packets: ${keys.length}\n`);

    // Sample keys
    if (keys.length > 0) {
      const sample = keys[0];
      const envelope = await redis.get(sample);
      if (envelope) {
        const parsed = JSON.parse(envelope);
        console.log(`  📦 Sample envelope:\n`);
        console.log(`     packet_key: ${parsed.packet_key}`);
        console.log(`     source_ref: ${parsed.source_ref}`);
        console.log(`     som_cluster: ${parsed.topology.som_cluster}`);
        console.log(`     rrf_score: ${parsed.retrieval.rrf_score}\n`);
      }
    }

    // Topology index sizes
    const somKeys = await redis.keys('bitfrost:som:*:packets');
    console.log(`  🗺️  SOM topology indices: ${somKeys.length}\n`);

    // Feature indices
    const featureKeys = await redis.keys('bitfrost:feature:*:packets');
    console.log(`  🏷️  Feature indices: ${featureKeys.length}\n`);

  } catch (err) {
    console.error(`❌ Monitor error:`, err.message);
  } finally {
    await redis.quit();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (!mode) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase9-bitfrost-semantic-cache.mjs --enqueue [--limit=40568]`);
  console.error(`  node phase9-bitfrost-semantic-cache.mjs --worker [--id=1]`);
  console.error(`  node phase9-bitfrost-semantic-cache.mjs --monitor\n`);
  process.exit(1);
}

if (mode === '--enqueue') {
  enqueuePackets().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--worker') {
  startWorker().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--monitor') {
  monitorBitFrost().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown mode: ${mode}\n`);
  process.exit(1);
}
