#!/usr/bin/env node
/**
 * ingest-topology-batched.mjs
 *
 * Phase 3 → Neo4j: Batched ingestion of USES_DB + USES_TOOL edges.
 *
 * Differences from ingest-topology-to-neo4j.mjs:
 *  - Uses UNWIND for batch MERGE (100× faster than per-edge MATCH)
 *  - Reads .env via dotenv pattern
 *  - Falls back to neo4j-driver in sveltekit-frontend/node_modules
 *  - Creates label-scoped indexes (CodebaseFile.filePath, DBTable.name, Tool.name)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const neo4j = require('/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/node_modules/neo4j-driver');

// Read .env manually (avoid dotenv dependency)
const envContent = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const URI = env.NEO4J_URI || 'bolt://localhost:7687';
const USER = env.NEO4J_USER || 'neo4j';
const PASS = env.NEO4J_PASSWORD || 'neo4j123';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = 500;

async function main() {
  console.log('🚀 Phase 3 Neo4j Topology Ingestion (Batched)');
  console.log(`URI: ${URI}, User: ${USER}`);
  console.log();

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));

  try {
    const session = driver.session();

    // 0. Verify connectivity
    const ping = await session.run('RETURN 1 AS ok');
    console.log(`[CONNECT] ✓ Neo4j responded (${ping.records[0].get('ok')})`);

    if (DRY_RUN) {
      console.log('[DRY-RUN] Use without --dry-run to write to Neo4j');
      await session.close();
      await driver.close();
      return;
    }

    // 1. Create indexes (idempotent)
    console.log('[1/4] Creating label indexes...');
    await session.run('CREATE INDEX codebase_file_path IF NOT EXISTS FOR (f:CodebaseFile) ON (f.filePath)');
    await session.run('CREATE INDEX db_table_name IF NOT EXISTS FOR (t:DBTable) ON (t.name)');
    await session.run('CREATE INDEX tool_name IF NOT EXISTS FOR (t:Tool) ON (t.name)');
    console.log('  ✓ Indexes ensured');

    // 2. Load + batch USES_DB edges
    console.log('[2/4] Ingesting USES_DB edges (batched)...');
    const dbEdges = readFileSync('scripts/atlas/out/db-usage-edges.ndjson', 'utf-8')
      .trim().split('\n').filter(l => l).map(l => JSON.parse(l));

    let dbCount = 0;
    for (let i = 0; i < dbEdges.length; i += BATCH_SIZE) {
      const batch = dbEdges.slice(i, i + BATCH_SIZE);
      const result = await session.run(
        `
        UNWIND $batch AS e
        MERGE (f:CodebaseFile {filePath: e.source_file})
        MERGE (t:DBTable {name: e.table})
        MERGE (f)-[r:USES_DB]->(t)
        SET r.operation = e.operation, r.type = e.type, r.line_num = e.line_num
        RETURN count(r) AS created
        `,
        { batch }
      );
      dbCount += result.records[0].get('created').toNumber();
      process.stdout.write(`\r  Progress: ${dbCount}/${dbEdges.length}`);
    }
    console.log(`\n  ✓ ${dbCount} USES_DB edges merged`);

    // 3. Load + batch USES_TOOL edges
    console.log('[3/4] Ingesting USES_TOOL edges (batched)...');
    const toolEdges = readFileSync('scripts/atlas/out/tool-usage-edges.ndjson', 'utf-8')
      .trim().split('\n').filter(l => l).map(l => JSON.parse(l));

    let toolCount = 0;
    for (let i = 0; i < toolEdges.length; i += BATCH_SIZE) {
      const batch = toolEdges.slice(i, i + BATCH_SIZE);
      const result = await session.run(
        `
        UNWIND $batch AS e
        MERGE (f:CodebaseFile {filePath: e.source_file})
        MERGE (t:Tool {name: e.tool})
        SET t.toolType = e.type
        MERGE (f)-[r:USES_TOOL]->(t)
        SET r.type = e.type, r.endpoint = e.endpoint, r.line_num = e.line_num
        RETURN count(r) AS created
        `,
        { batch }
      );
      toolCount += result.records[0].get('created').toNumber();
      process.stdout.write(`\r  Progress: ${toolCount}/${toolEdges.length}`);
    }
    console.log(`\n  ✓ ${toolCount} USES_TOOL edges merged`);

    // 4. Verify with a sample multi-hop query
    console.log('[4/4] Verifying with multi-hop query...');
    const verify = await session.run(
      `
      MATCH (f:CodebaseFile)-[:USES_DB]->(t:DBTable)
      WITH t, count(DISTINCT f) AS file_count
      ORDER BY file_count DESC LIMIT 5
      RETURN t.name AS table, file_count
      `
    );
    console.log('  Top 5 tables by file consumers:');
    verify.records.forEach(r => {
      console.log(`    ${r.get('table')}: ${r.get('file_count').toNumber()} files`);
    });

    // Total graph size
    const stats = await session.run(`
      MATCH (n) WITH labels(n) AS lbls
      RETURN lbls[0] AS label, count(*) AS cnt ORDER BY cnt DESC
    `);
    console.log('\n  Graph node counts:');
    stats.records.forEach(r => {
      console.log(`    ${r.get('label')}: ${r.get('cnt').toNumber()}`);
    });

    await session.close();

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Phase 3 Neo4j Ingestion Complete:`);
    console.log(`  USES_DB:   ${dbCount} edges`);
    console.log(`  USES_TOOL: ${toolCount} edges`);
    console.log(`  Total:     ${dbCount + toolCount} topology edges`);
    console.log();
    console.log('Next: build-intent-graph.mjs → Neo4j RESOLVES_INTENT edges');
    console.log('═══════════════════════════════════════════════════════════════');
  } finally {
    await driver.close();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
