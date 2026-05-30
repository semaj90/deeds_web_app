#!/usr/bin/env node
/**
 * ingest-topology-to-neo4j.mjs
 *
 * Phase 3: Ingest USES_DB + USES_TOOL edges into Neo4j alongside existing
 * CALLS + IMPORT edges for complete topology.
 *
 * Creates:
 * - (CodebaseFile)-[:USES_DB {operation}]->(DBTable) edges
 * - (CodebaseFile)-[:USES_TOOL {type}]->(Tool) edges
 * - Indexes on CodebaseFile.filePath, DBTable.name, Tool.name
 *
 * Uses UNWIND batched MERGE for speed (500 edges/batch).
 * Creates CodebaseFile nodes via MERGE so we don't need them pre-loaded.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = 500;

// Read Neo4j connection from env (.env supports both NEO4J_PASS and NEO4J_PASSWORD)
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASS = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';

console.log(`🚀 Phase 3: Neo4j Topology Ingestion`);
console.log(`   URI: ${URI}`);
console.log(`   User: ${USER}`);
console.log();

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));

function batches(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  // Verify connection
  try {
    await driver.verifyConnectivity();
    console.log('[CONNECT] ✓ Neo4j reachable');
  } catch (e) {
    console.error('[CONNECT] ✗ Cannot reach Neo4j:', e.message);
    process.exit(1);
  }

  const session = driver.session();

  try {
    // 0. Ensure indexes/constraints
    console.log('[INDEX] Ensuring indexes/constraints...');
    const ddls = [
      'CREATE CONSTRAINT codebase_file_path IF NOT EXISTS FOR (f:CodebaseFile) REQUIRE f.filePath IS UNIQUE',
      'CREATE CONSTRAINT db_table_name IF NOT EXISTS FOR (t:DBTable) REQUIRE t.name IS UNIQUE',
      'CREATE CONSTRAINT tool_name IF NOT EXISTS FOR (t:Tool) REQUIRE t.name IS UNIQUE',
    ];
    for (const ddl of ddls) {
      try {
        await session.run(ddl);
      } catch (e) {
        console.log(`  ⚠ ${e.message.split('\n')[0]}`);
      }
    }
    console.log('  ✓ Constraints ensured');

    if (DRY_RUN) {
      console.log('[DRY-RUN] Skipping writes.');
      return;
    }

    // 1. USES_DB edges (batched UNWIND)
    console.log('[1/2] Ingesting USES_DB edges...');
    const dbEdges = readFileSync(path.join(projectRoot, 'scripts/atlas/out/').replace(/\\/g, '/') + 'db-usage-edges.ndjson', 'utf-8')
      .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

    let dbCount = 0;
    for (const batch of batches(dbEdges, BATCH_SIZE)) {
      const payload = batch.map(e => ({
        filePath: e.source_file.replace(/\\/g, '/'),
        table: e.table,
        operation: e.operation,
        line_num: e.line_num,
      }));
      const result = await session.run(
        `
        UNWIND $rows AS row
        MERGE (f:CodebaseFile {filePath: row.filePath})
        MERGE (t:DBTable {name: row.table})
        MERGE (f)-[r:USES_DB {operation: row.operation}]->(t)
        SET r.last_seen = datetime(), r.line_num = row.line_num
        RETURN count(r) AS created
        `,
        { rows: payload }
      );
      dbCount += result.records[0].get('created').toNumber();
    }
    console.log(`  ✓ Merged ${dbCount} USES_DB relationships (${dbEdges.length} input rows)`);

    // 2. USES_TOOL edges (batched UNWIND)
    console.log('[2/2] Ingesting USES_TOOL edges...');
    const toolEdges = readFileSync(path.join(projectRoot, 'scripts/atlas/out/').replace(/\\/g, '/') + 'tool-usage-edges.ndjson', 'utf-8')
      .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

    let toolCount = 0;
    for (const batch of batches(toolEdges, BATCH_SIZE)) {
      const payload = batch.map(e => ({
        filePath: e.source_file.replace(/\\/g, '/'),
        tool: e.tool,
        type: e.type || 'unknown',
        endpoint: e.endpoint || '',
      }));
      const result = await session.run(
        `
        UNWIND $rows AS row
        MERGE (f:CodebaseFile {filePath: row.filePath})
        MERGE (t:Tool {name: row.tool})
        SET t.toolType = row.type, t.endpoint = row.endpoint
        MERGE (f)-[r:USES_TOOL {type: row.type}]->(t)
        SET r.last_seen = datetime()
        RETURN count(r) AS created
        `,
        { rows: payload }
      );
      toolCount += result.records[0].get('created').toNumber();
    }
    console.log(`  ✓ Merged ${toolCount} USES_TOOL relationships (${toolEdges.length} input rows)`);

    // Verify totals
    const verifyDb = await session.run('MATCH ()-[r:USES_DB]->() RETURN count(r) AS c');
    const verifyTool = await session.run('MATCH ()-[r:USES_TOOL]->() RETURN count(r) AS c');
    const verifyFiles = await session.run('MATCH (f:CodebaseFile) RETURN count(f) AS c');
    const verifyTables = await session.run('MATCH (t:DBTable) RETURN count(t) AS c');
    const verifyTools = await session.run('MATCH (t:Tool) RETURN count(t) AS c');

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Phase 3 Neo4j Ingestion Complete');
    console.log(`  USES_DB edges in DB:    ${verifyDb.records[0].get('c').toNumber()}`);
    console.log(`  USES_TOOL edges in DB:  ${verifyTool.records[0].get('c').toNumber()}`);
    console.log(`  CodebaseFile nodes:     ${verifyFiles.records[0].get('c').toNumber()}`);
    console.log(`  DBTable nodes:          ${verifyTables.records[0].get('c').toNumber()}`);
    console.log(`  Tool nodes:             ${verifyTools.records[0].get('c').toNumber()}`);
    console.log();
    console.log('Sample Cypher (try in browser http://localhost:7474):');
    console.log('  MATCH (f:CodebaseFile)-[:USES_DB]->(t:DBTable) RETURN f.filePath, t.name LIMIT 25');
    console.log('═══════════════════════════════════════════════════════════════');

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
