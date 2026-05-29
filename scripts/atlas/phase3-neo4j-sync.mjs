#!/usr/bin/env node
/**
 * phase3-neo4j-sync.mjs
 *
 * Phase 3: Sync USES_DB edges (database operations) into Neo4j.
 *
 * Input: scripts/atlas/out/db-usage-edges.ndjson (468 edges)
 * Output: Neo4j USES_DB relationships
 *
 * Schema:
 *   (File) -[USES_DB]-> (Table)
 *   Properties: operation, line_num, type
 *
 * Usage:
 *   node scripts/atlas/phase3-neo4j-sync.mjs [--dry-run]
 */

import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  console.log('🚀 Phase 3 Atlas: USES_DB Neo4j Sync');
  console.log();

  // Neo4j connection
  const URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const USER = process.env.NEO4J_USER || 'neo4j';
  const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    // Read edges
    console.log('[LOAD] Reading db-usage-edges.ndjson...');
    const edgesPath = path.join(projectRoot, 'scripts/atlas/out/db-usage-edges.ndjson');
    const content = readFileSync(edgesPath, 'utf-8');
    const edges = content
      .trim()
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.warn(`  ⚠ Skipped invalid JSON: ${line.substring(0, 50)}...`);
          return null;
        }
      })
      .filter((e) => e !== null);

    console.log(`  ✓ Loaded ${edges.length} edges`);
    console.log();

    // Count by type
    const byType = {};
    edges.forEach((e) => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    console.log('[BREAKDOWN]');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    console.log();

    // Unique tables
    const tables = new Set(edges.map((e) => e.table).filter((t) => t !== 'unknown'));
    console.log(`[TABLES] ${tables.size} unique tables referenced`);
    console.log(`  Top 10: ${Array.from(tables).sort().slice(0, 10).join(', ')}`);
    console.log();

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would sync to Neo4j. Run without --dry-run to proceed.');
      console.log(`[PREVIEW] First 5 edges:`);
      edges.slice(0, 5).forEach((e) => {
        console.log(`  ${e.source_file}:${e.line_num} -[USES_DB]-> ${e.table}`);
      });
      return;
    }

    // Sync to Neo4j
    console.log('[SYNC] Creating USES_DB edges in Neo4j...');

    // 1. Create Table nodes (if not exist)
    const tableList = Array.from(tables).filter((t) => t !== 'unknown');
    console.log(`  ├─ Creating ${tableList.length} Table nodes...`);
    await session.run(
      `
        UNWIND $tables AS tableName
        MERGE (t:Table { name: tableName })
        SET t.updated_at = datetime()
      `,
      { tables: tableList }
    );

    // 2. Create USES_DB edges
    console.log(`  ├─ Creating ${edges.length} USES_DB relationships...`);
    const edgeChunks = [];
    for (let i = 0; i < edges.length; i += 100) {
      edgeChunks.push(edges.slice(i, i + 100));
    }

    // Normalize paths (convert Windows backslashes to forward slashes, strip sveltekit-frontend prefix)
    const normalizedEdges = edges.map((e) => {
      let filePath = e.source_file
        .replace(/\\/g, '/') // Windows backslash → forward slash
        .replace(/^sveltekit-frontend\//, ''); // Strip sveltekit-frontend/ prefix
      return { ...e, filePath };
    });

    let edgesCreated = 0;
    for (const chunk of edgeChunks) {
      const normalizedChunk = chunk.map((e, idx) => ({
        ...e,
        filePath: e.source_file
          .replace(/\\/g, '/')
          .replace(/^sveltekit-frontend\//, '')
      }));

      await session.run(
        `
          UNWIND $edges AS edge
          MATCH (f:CodebaseFile { filePath: edge.filePath })
          MATCH (t:Table { name: edge.table })
          MERGE (f)-[r:USES_DB]->(t)
          SET r.operation = edge.operation,
              r.line_num = edge.line_num,
              r.type = edge.type,
              r.updated_at = datetime()
        `,
        { edges: normalizedChunk }
      );
      edgesCreated += chunk.length;
      console.log(`    ├─ Synced ${edgesCreated}/${edges.length}`);
    }

    // 3. Validation
    console.log(`  └─ Validating sync...`);
    const validation = await session.run(`
      MATCH ()-[r:USES_DB]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesUsing,
             count(DISTINCT endNode(r)) AS tablesUsed
    `);

    const result = validation.records[0].toObject();
    console.log(`    ├─ Total USES_DB edges: ${result.totalEdges}`);
    console.log(`    ├─ Files using DB: ${result.filesUsing}`);
    console.log(`    └─ Tables referenced: ${result.tablesUsed}`);
    console.log();

    // 4. Coverage check
    console.log('[COVERAGE]');
    const orphanTables = await session.run(`
      MATCH (t:Table)
      WHERE NOT (()-[:USES_DB]->(t))
      RETURN count(t) AS orphans
    `);
    const orphanCount = orphanTables.records[0].get('orphans');
    console.log(`  ├─ Orphaned tables (0 callers): ${orphanCount}`);

    const orphanFiles = await session.run(`
      MATCH (f:CodebaseFile)
      WHERE NOT ((f)-[:USES_DB]->())
      RETURN count(f) AS orphans
    `);
    const orphanFileCount = orphanFiles.records[0].get('orphans').toNumber();
    console.log(`  ├─ Files with no DB usage: ${orphanFileCount}`);

    const totalFiles = result.filesUsing.toNumber() + orphanFileCount;
    const coverage = ((result.filesUsing.toNumber() / totalFiles) * 100).toFixed(1);
    console.log(`  └─ File coverage: ${coverage}% (${result.filesUsing}/${totalFiles})`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SUCCESS] Phase 3 Neo4j sync complete');
    console.log(`  - ${result.totalEdges} USES_DB edges created`);
    console.log(`  - ${result.filesUsing} files connected to DB`);
    console.log(`  - ${result.tablesUsed} tables mapped`);
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
