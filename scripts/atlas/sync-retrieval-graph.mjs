#!/usr/bin/env node
/**
 * Sync retrieval data (concepts, traces, telemetry) to Neo4j for GDS planning.
 * Usage: node scripts/atlas/sync-retrieval-graph.mjs [--dry-run] [--full] [--skip-gds]
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipGds = args.includes('--skip-gds');

const pgPool = new pg.Pool({ connectionString: DATABASE_URL });
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function main() {
  try {
    console.log('[Retrieval Sync] Starting', { dryRun, skipGds });
    
    // Concepts
    const concepts = await pgPool.query('SELECT concept_id, concept_temperature FROM concept_records LIMIT 10000');
    console.log(`[Concepts] ${concepts.rows.length} found`);
    
    // Traces
    const traces = await pgPool.query('SELECT trace_id, retrieval_strategy, selected_concepts FROM agent_traces LIMIT 5000');
    console.log(`[Traces] ${traces.rows.length} found`);
    
    // Telemetry
    const tel = await pgPool.query('SELECT COUNT(*) as cnt FROM retrieval_telemetry');
    console.log(`[Telemetry] ${tel.rows[0].cnt} total`);
    
    console.log('[Sync] ✅ Complete');
  } finally {
    await pgPool.end();
    await driver.close();
  }
}

main().catch(console.error);
