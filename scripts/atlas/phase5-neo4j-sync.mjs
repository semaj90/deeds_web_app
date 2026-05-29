#!/usr/bin/env node
/**
 * phase5-neo4j-sync.mjs
 *
 * Phase 5: Sync USES_CACHE edges (transient memory/cache usage) into Neo4j.
 *
 * Input: scripts/atlas/out/cache-usage-edges.ndjson
 * Output: Neo4j USES_CACHE relationships
 *
 * Schema:
 *   (File) -[USES_CACHE]-> (CacheSystem)
 *   Properties: cache_type, operation, line_num, endpoint
 *
 * Usage:
 *   node scripts/atlas/phase5-neo4j-sync.mjs [--dry-run]
 */

import neo4j from 'neo4j-driver';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  console.log('🚀 Phase 5 Atlas: USES_CACHE Neo4j Sync');
  console.log();

  // Neo4j connection
  const URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const USER = process.env.NEO4J_USER || 'neo4j';
  const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    // Read edges
    console.log('[LOAD] Reading cache-usage-edges.ndjson...');
    const edgesPath = path.join(projectRoot, 'scripts/atlas/out/cache-usage-edges.ndjson');
    if (!existsSync(edgesPath)) {
      throw new Error(`Edges file not found: ${edgesPath}. Run node scripts/atlas/extract-cache-usage.mjs --write first.`);
    }

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

    console.log(`  ✓ Loaded ${edges.length} cache usage edges`);
    console.log();

    // Unique cache targets
    const cacheSystems = new Set(edges.map((e) => e.cache_type).filter(Boolean));
    console.log(`[CACHES] ${cacheSystems.size} unique cache systems referenced`);
    console.log(`  Systems: ${Array.from(cacheSystems).join(', ')}`);
    console.log();

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would sync to Neo4j. Run without --dry-run to proceed.');
      console.log(`[PREVIEW] First 5 edges:`);
      edges.slice(0, 5).forEach((e) => {
        console.log(`  ${e.source_file}:${e.line_num} -[USES_CACHE]-> ${e.cache_type} (${e.operation})`);
      });
      return;
    }

    // Sync to Neo4j
    console.log('[SYNC] Creating USES_CACHE edges in Neo4j...');

    // 1. Create CacheSystem nodes (if not exist)
    const systemsList = Array.from(cacheSystems);
    console.log(`  ├─ Creating ${systemsList.length} CacheSystem nodes...`);
    await session.run(
      `
        UNWIND $systems AS systemName
        MERGE (c:CacheSystem { name: systemName })
        SET c.updated_at = datetime()
      `,
      { systems: systemsList }
    );

    // 2. Create USES_CACHE edges
    console.log(`  ├─ Creating ${edges.length} USES_CACHE relationships...`);
    const edgeChunks = [];
    for (let i = 0; i < edges.length; i += 100) {
      edgeChunks.push(edges.slice(i, i + 100));
    }

    let edgesCreated = 0;
    for (const chunk of edgeChunks) {
      const normalizedChunk = chunk.map((e) => ({
        ...e,
        filePath: e.source_file
          .replace(/\\/g, '/')
          .replace(/^sveltekit-frontend\//, '')
      }));

      await session.run(
        `
          UNWIND $edges AS edge
          MATCH (f:CodebaseFile { filePath: edge.filePath })
          MATCH (c:CacheSystem { name: edge.cache_type })
          MERGE (f)-[r:USES_CACHE]->(c)
          SET r.operation = edge.operation,
              r.endpoint = edge.endpoint,
              r.line_num = edge.line_num,
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
      MATCH ()-[r:USES_CACHE]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesUsing,
             count(DISTINCT endNode(r)) AS systemsUsed
    `);

    const result = validation.records[0].toObject();
    console.log(`    ├─ Total USES_CACHE edges: ${result.totalEdges}`);
    console.log(`    ├─ Files using caches: ${result.filesUsing}`);
    console.log(`    └─ Cache systems in DB: ${result.systemsUsed}`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SUCCESS] Phase 5 Neo4j sync complete');
    console.log(`  - ${result.totalEdges} USES_CACHE edges created`);
    console.log(`  - ${result.filesUsing} files connected to caches`);
    console.log(`  - ${result.systemsUsed} systems mapped`);
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
