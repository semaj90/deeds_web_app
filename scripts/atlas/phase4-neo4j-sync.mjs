#!/usr/bin/env node
/**
 * phase4-neo4j-sync.mjs
 *
 * Phase 4: Sync USES_TOOL edges (MCP and API tool operations) into Neo4j.
 *
 * Input: scripts/atlas/out/tool-usage-edges.ndjson
 * Output: Neo4j USES_TOOL relationships
 *
 * Schema:
 *   (File) -[USES_TOOL]-> (Tool)
 *   Properties: type, caller, line_num, endpoint
 *
 * Usage:
 *   node scripts/atlas/phase4-neo4j-sync.mjs [--dry-run]
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
  console.log('🚀 Phase 4 Atlas: USES_TOOL Neo4j Sync');
  console.log();

  // Neo4j connection
  const URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const USER = process.env.NEO4J_USER || 'neo4j';
  const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    // Read edges
    console.log('[LOAD] Reading tool-usage-edges.ndjson...');
    const edgesPath = path.join(projectRoot, 'scripts/atlas/out/tool-usage-edges.ndjson');
    if (!existsSync(edgesPath)) {
      throw new Error(`Edges file not found: ${edgesPath}. Run node scripts/atlas/extract-tool-usage.mjs --write first.`);
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

    console.log(`  ✓ Loaded ${edges.length} tool usage edges`);
    console.log();

    // Unique tool targets
    const tools = new Set(edges.map((e) => e.tool).filter(Boolean));
    console.log(`[TOOLS] ${tools.size} unique tools referenced`);
    console.log(`  Top 10: ${Array.from(tools).sort().slice(0, 10).join(', ')}`);
    console.log();

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would sync to Neo4j. Run without --dry-run to proceed.');
      console.log(`[PREVIEW] First 5 edges:`);
      edges.slice(0, 5).forEach((e) => {
        console.log(`  ${e.source_file}:${e.line_num} -[USES_TOOL]-> ${e.tool} (${e.type})`);
      });
      return;
    }

    // Sync to Neo4j
    console.log('[SYNC] Creating USES_TOOL edges in Neo4j...');

    // 1. Create Tool nodes (if not exist)
    const toolList = Array.from(tools);
    console.log(`  ├─ Creating ${toolList.length} Tool nodes...`);
    await session.run(
      `
        UNWIND $tools AS toolName
        MERGE (t:Tool { name: toolName })
        SET t.updated_at = datetime()
      `,
      { tools: toolList }
    );

    // 2. Create USES_TOOL edges
    console.log(`  ├─ Creating ${edges.length} USES_TOOL relationships...`);
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
          MATCH (t:Tool { name: edge.tool })
          MERGE (f)-[r:USES_TOOL]->(t)
          SET r.caller = edge.caller,
              r.endpoint = edge.endpoint,
              r.type = edge.type,
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
      MATCH ()-[r:USES_TOOL]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesUsing,
             count(DISTINCT endNode(r)) AS toolsUsed
    `);

    const result = validation.records[0].toObject();
    console.log(`    ├─ Total USES_TOOL edges: ${result.totalEdges}`);
    console.log(`    ├─ Files using tools: ${result.filesUsing}`);
    console.log(`    └─ Tools referenced in DB: ${result.toolsUsed}`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SUCCESS] Phase 4 Neo4j sync complete');
    console.log(`  - ${result.totalEdges} USES_TOOL edges created`);
    console.log(`  - ${result.filesUsing} files connected to tools`);
    console.log(`  - ${result.toolsUsed} tools mapped`);
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
