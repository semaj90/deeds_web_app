/**
 * Example: How to use the LangGraph Agent Worker
 *
 * This example shows the integration pattern:
 * 1. Initialize service clients (Postgres, Redis, Qdrant, Neo4j)
 * 2. Build the agent graph with dependencies injected
 * 3. Create task envelopes from NATS messages
 * 4. Run the agent with the envelope
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';

import { buildAgentGraph, runAgent } from './worker.js';
import { createEnvelope, SUBJECTS } from '../events/subjects.js';

/**
 * Initialize all service clients
 */
async function initializeServices() {
  // Postgres pool (canonical truth)
  const postgresPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/atlas',
  });

  // Redis/Bifrost client (hot memory)
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  // Qdrant client (vector search mirror)
  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  });

  // Neo4j driver (topology mirror)
  const neo4jDriver = neo4j.driver(
    process.env.NEO4J_URL || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  return { postgresPool, redis, qdrant, neo4jDriver };
}

/**
 * Example: Run agent with a task envelope
 */
async function exampleRunAgent() {
  const { postgresPool, redis, qdrant, neo4jDriver } = await initializeServices();

  // Build the compiled state machine (once at startup)
  const agent = buildAgentGraph(postgresPool, redis, qdrant, neo4jDriver);

  // Example: Create an envelope from a hypothetical NATS message
  const envelope = createEnvelope(
    'trace-123', // trace_id
    SUBJECTS.AGENT_EXECUTE, // from NATS subject
    'agent', // strategy
    { query: 'How does authentication work?' }, // payload
    {
      packet_key: 'ace:packet:auth:001',
      source_ref: 'src/lib/server/auth.ts',
      feature_id: 'auth.sessions',
    }
  );

  console.log('🚀 Running agent with envelope:', envelope.trace_id);
  console.log(`   Packet: ${envelope.packet_key} (${envelope.feature_id})`);

  // Run the agent loop
  const finalState = await runAgent(agent, envelope);

  console.log('\n✅ Agent loop complete:');
  console.log(`   Steps: ${finalState.step}`);
  console.log(`   Synthesis: ${finalState.synthesis?.substring(0, 80)}...`);
  if (finalState.error) {
    console.error(`   Error: ${finalState.error}`);
  }

  // Cleanup
  await postgresPool.end();
  await redis.quit();
  await neo4jDriver.close();

  return finalState;
}

/**
 * Example: NATS subscriber that routes to agent
 *
 * This would be wired into a NATS message subscriber (not implemented in this example).
 */
export async function exampleNatsSubscriber() {
  const { postgresPool, redis, qdrant, neo4jDriver } = await initializeServices();
  const agent = buildAgentGraph(postgresPool, redis, qdrant, neo4jDriver);

  // Pseudo-code: subscribe to NATS subject
  // natsConnection.subscribe(SUBJECTS.AGENT_EXECUTE, async (msg) => {
  //   const envelope = JSON.parse(msg.data) as AtlasTaskEnvelope;
  //   const result = await runAgent(agent, envelope);
  //   console.log('Agent result:', result);
  // });
}

// Run example if invoked directly
if (require.main === module) {
  exampleRunAgent().catch(console.error);
}

export { exampleRunAgent };
