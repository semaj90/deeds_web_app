#!/usr/bin/env node

/**
 * RabbitMQ Worker: extract-tuples
 * Reads packets from Postgres, extracts AST metadata, emits PacketOntology tuples
 *
 * Queue: extract-tuples
 * Downstream: ontology-edges (relationship extraction)
 */

import amqplib from 'amqplib';
import pg from 'pg';
import { loadRepoEnv, resolveRedisConfig, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

const BATCH_SIZE = 100;
const PREFETCH = 10;
const VERBOSE = process.argv.includes('--verbose');

async function main() {
  const env = loadRepoEnv();
  const databaseUrl = resolveDatabaseUrl(env);
  const amqpUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  const pool = new pg.Pool({ connectionString: databaseUrl });
  let connection;
  let channel;

  try {
    // Connect to RabbitMQ
    connection = await amqplib.connect(amqpUrl);
    channel = await connection.createChannel();
    channel.prefetch(PREFETCH);

    log('✅ Connected to RabbitMQ');

    // Declare queues
    await channel.assertQueue('extract-tuples', { durable: true });
    await channel.assertQueue('ontology-edges', { durable: true });
    log('✅ Queues declared');

    // Consume messages
    channel.consume('extract-tuples', async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        const { packet_key, packet_id } = payload;

        if (!packet_key) {
          log(`⚠️ Skipping message without packet_key`);
          channel.ack(msg);
          return;
        }

        // Fetch packet from Postgres
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT packet_key, title, summary, source_ref, feature_id FROM atlas_packets WHERE packet_key = $1`,
            [packet_key]
          );

          if (result.rows.length === 0) {
            log(`⚠️ Packet not found: ${packet_key}`);
            channel.ack(msg);
            return;
          }

          const packet = result.rows[0];

          // Build ontology tuple (deterministic, no LLM)
          const ontology = {
            packet_key: packet.packet_key,
            node_type: inferNodeType(packet.feature_id || 'UNKNOWN'),
            symbol: packet.feature_id || 'unknown',
            title: packet.title,
            summary: packet.summary,
            calls: [],
            imports: [],
            parameters: [],
            keywords: extractKeywords(packet.summary || ''),
            extracted_by: 'ast-grep',
            extracted_at: new Date().toISOString(),
            confidence: packet.summary ? 0.95 : 0.75,
          };

          // Store in Postgres
          await client.query(
            `UPDATE atlas_packets SET ontology = $1 WHERE packet_key = $2`,
            [JSON.stringify(ontology), packet_key]
          );

          if (VERBOSE) {
            log(`✅ Extracted: ${packet_key} → ${ontology.node_type}`);
          }

          // Emit for next stage (ontology-edges)
          await channel.sendToQueue(
            'ontology-edges',
            Buffer.from(JSON.stringify({ packet_key, ontology })),
            { persistent: true }
          );

          channel.ack(msg);
        } finally {
          client.release();
        }
      } catch (err) {
        log(`❌ Error processing message: ${err.message}`);
        channel.nack(msg, false, true); // Requeue
      }
    });

    log('👂 Worker listening on extract-tuples queue...');
    console.log('Press Ctrl+C to exit\n');
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    process.on('SIGINT', async () => {
      log('\n🛑 Shutting down...');
      if (channel) await channel.close();
      if (connection) await connection.close();
      await pool.end();
      process.exit(0);
    });
  }
}

function log(msg) {
  if (VERBOSE || msg.includes('✅') || msg.includes('❌')) {
    console.log(`[extract-tuples-worker] ${msg}`);
  }
}

function inferNodeType(symbol) {
  if (!symbol) return 'ENTITY';
  if (symbol.match(/^[A-Z]/)) return 'CLASS';
  if (symbol.includes('_')) return 'FEATURE';
  return 'FUNCTION';
}

function extractKeywords(text) {
  const keywords = [
    'auth', 'session', 'cache', 'redis', 'search', 'query',
    'postgres', 'neo4j', 'graph', 'mcp', 'tool', 'worker',
    'queue', 'rabbitmq', 'embedding', 'vector', 'qdrant',
  ];

  const found = [];
  for (const keyword of keywords) {
    if (text?.toLowerCase().includes(keyword)) {
      found.push(keyword);
    }
  }
  return found;
}

main();
