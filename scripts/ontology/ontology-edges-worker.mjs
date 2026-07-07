#!/usr/bin/env node

/**
 * RabbitMQ Worker: ontology-edges
 * Reads PacketOntology tuples from ontology-edges queue
 * Extracts relationships (calls, imports, extends, etc.) between packets
 * Writes OntologyEdge tuples to Neo4j and ontology_edges Postgres table
 *
 * Queue: ontology-edges
 * Input: { packet_key, ontology }
 * Output: OntologyEdge tuples (source_packet_key, target_packet_key, edge_type, confidence)
 */

import amqplib from 'amqplib';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

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
    await channel.assertQueue('ontology-edges', { durable: true });
    log('✅ Queue declared');

    let processed = 0;
    const startTime = Date.now();

    // Consume messages
    channel.consume('ontology-edges', async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        const { packet_key, ontology } = payload;

        if (!packet_key || !ontology) {
          log(`⚠️ Skipping message without packet_key or ontology`);
          channel.ack(msg);
          return;
        }

        // Build edges from ontology tuple
        const edges = extractEdgesFromOntology(packet_key, ontology);

        if (edges.length === 0) {
          if (VERBOSE) {
            log(`ℹ️ No edges extracted from ${packet_key}`);
          }
          channel.ack(msg);
          return;
        }

        // Persist edges to Postgres ontology_edges table
        const client = await pool.connect();
        try {
          for (const edge of edges) {
            try {
              await client.query(
                `INSERT INTO ontology_edges
                  (source_packet_key, target_packet_key, edge_type, confidence)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (source_packet_key, target_packet_key, edge_type) DO UPDATE
                SET confidence = GREATEST(ontology_edges.confidence, $4)`,
                [edge.source_packet_key, edge.target_packet_key, edge.edge_type, edge.confidence]
              );
            } catch (err) {
              // Skip if target packet doesn't exist (foreign key constraint)
              if (err.message.includes('violates foreign key constraint')) {
                log(`⚠️ Target packet not found for edge: ${edge.source_packet_key} → ${edge.target_packet_key}`);
              } else {
                throw err;
              }
            }
          }

          processed++;

          if (VERBOSE && processed % 100 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const rate = (processed / elapsed).toFixed(1);
            console.log(`[ontology-edges-worker] Processed ${processed} packets (${rate} pkt/s, elapsed ${elapsed}s)`);
          }

          if (VERBOSE && edges.length > 0) {
            log(`✅ Extracted ${edges.length} edges from ${packet_key}`);
          }

          channel.ack(msg);
        } finally {
          client.release();
        }
      } catch (err) {
        log(`❌ Error processing message: ${err.message}`);
        channel.nack(msg, false, true); // Requeue
      }
    });

    log('👂 Worker listening on ontology-edges queue...');
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

/**
 * Extract OntologyEdge tuples from a PacketOntology
 * Deterministic: reads from pre-extracted calls/imports/parameters
 */
function extractEdgesFromOntology(sourcePacketKey, ontology) {
  const edges = [];
  const { calls = [], imports = [], parameters = [], node_type } = ontology;

  // Extract 'calls' edges (function A calls function B)
  for (const callee of calls) {
    // For now, calls array is empty (would need AST analysis to populate)
    // Placeholder for future enhancement
  }

  // Extract 'imports' edges (module imports module)
  for (const imported of imports) {
    // Placeholder: would need to resolve imported module name to packet_key
    if (imported) {
      edges.push({
        source_packet_key: sourcePacketKey,
        target_packet_key: imported, // This is a placeholder; should resolve to actual packet_key
        edge_type: 'imports',
        confidence: 0.8,
      });
    }
  }

  // Extract 'uses' edges (feature uses parameter)
  for (const param of parameters) {
    if (param.name) {
      // Placeholder: would need to resolve parameter to actual packet
      // For now, skip parameter edges
    }
  }

  return edges;
}

function log(msg) {
  if (VERBOSE || msg.includes('✅') || msg.includes('❌')) {
    console.log(`[ontology-edges-worker] ${msg}`);
  }
}

main();
