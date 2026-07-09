#!/usr/bin/env node
/**
 * phase4-neo4j-tool-sync.mjs
 *
 * Phase 4: Sync USES_TOOL edges into Neo4j.
 *
 * Input: scripts/atlas/out/tool-usage-edges.ndjson (1,166 edges)
 * Output: Neo4j USES_TOOL relationships + Tool/Endpoint nodes
 *
 * Schema:
 *   (File) -[USES_TOOL]-> (Tool)
 *   (File) -[USES_ENDPOINT]-> (ApiRoute)
 *   Properties: endpoint, type
 *
 * Usage:
 *   node scripts/atlas/phase4-neo4j-tool-sync.mjs [--dry-run]
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

    // Unique tools/endpoints
    const tools = new Set(edges.map((e) => e.tool).filter((t) => t));
    const endpoints = new Set(edges.map((e) => e.endpoint).filter((e) => e));
    console.log(`[TOOLS] ${tools.size} unique tools`);
    console.log(`[ENDPOINTS] ${endpoints.size} unique API endpoints`);
    console.log();

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would sync to Neo4j. Run without --dry-run to proceed.');
      console.log(`[PREVIEW] First 5 edges:`);
      edges.slice(0, 5).forEach((e) => {
        console.log(`  ${e.source_file}:${e.line_num} -[${e.type}]-> ${e.endpoint}`);
      });
      return;
    }

    // Sync to Neo4j
    console.log('[SYNC] Creating USES_TOOL edges in Neo4j...');

    // 1. Create Tool/Endpoint nodes
    const toolList = Array.from(tools);
    const endpointList = Array.from(endpoints);

    console.log(`  ├─ Creating ${toolList.length} Tool nodes...`);
    const toolChunks = [];
    for (let i = 0; i < toolList.length; i += 100) {
      toolChunks.push(toolList.slice(i, i + 100));
    }

    for (const chunk of toolChunks) {
      await session.run(
        `
          UNWIND $tools AS toolName
          MERGE (t:Tool { name: toolName })
          SET t.updated_at = datetime()
        `,
        { tools: chunk }
      );
    }

    console.log(`  ├─ Creating ${endpointList.length} ApiRoute nodes...`);
    const endpointChunks = [];
    for (let i = 0; i < endpointList.length; i += 100) {
      endpointChunks.push(endpointList.slice(i, i + 100));
    }

    for (const chunk of endpointChunks) {
      await session.run(
        `
          UNWIND $endpoints AS endpoint
          MERGE (a:ApiRoute { path: endpoint })
          SET a.updated_at = datetime()
        `,
        { endpoints: chunk }
      );
    }

    // 2. Create USES_TOOL edges
    console.log(`  ├─ Creating ${edges.length} USES_TOOL relationships...`);
    const edgeChunks = [];
    for (let i = 0; i < edges.length; i += 100) {
      edgeChunks.push(edges.slice(i, i + 100));
    }

    // Normalize paths
    const normalizedEdges = edges.map((e) => ({
      ...e,
      filePath: e.source_file.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '')
    }));

    let edgesCreated = 0;
    for (let idx = 0; idx < edgeChunks.length; idx++) {
      const chunk = edgeChunks[idx];
      const normalizedChunk = chunk.map((e) => {
        const fullPath = path.resolve(projectRoot, e.source_file);
        return {
          ...e,
          filePath: fullPath.replace(/\\/g, '/')
        };
      });

      // Separate by type: api_route vs mcp_tool, tool_ref, tool_call
      const apiEdges = normalizedChunk.filter((e) => e.type === 'api_route');
      const toolEdges = normalizedChunk.filter((e) => e.type !== 'api_route');

      if (apiEdges.length > 0) {
        await session.run(
          `
            UNWIND $edges AS edge
            MATCH (f:CodebaseFile { filePath: edge.filePath })
            MATCH (a:ApiRoute { path: edge.endpoint })
            MERGE (f)-[r:USES_ENDPOINT]->(a)
            SET r.line_num = edge.line_num,
                r.type = edge.type,
                r.updated_at = datetime()
          `,
          { edges: apiEdges }
        );
      }

      if (toolEdges.length > 0) {
        await session.run(
          `
            UNWIND $edges AS edge
            MATCH (f:CodebaseFile { filePath: edge.filePath })
            MATCH (t:Tool { name: edge.tool })
            MERGE (f)-[r:USES_TOOL]->(t)
            SET r.line_num = edge.line_num,
                r.type = edge.type,
                r.updated_at = datetime()
          `,
          { edges: toolEdges }
        );
      }

      edgesCreated += chunk.length;
      if (edgesCreated % 200 === 0) {
        console.log(`    ├─ Synced ${edgesCreated}/${edges.length}`);
      }
    }

    console.log(`    └─ Synced ${edgesCreated}/${edges.length}`);

    // 3. Validation
    console.log(`  └─ Validating sync...`);
    const toolValidation = await session.run(`
      MATCH ()-[r:USES_TOOL]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesUsingTools,
             count(DISTINCT endNode(r)) AS toolsUsed
    `);

    const toolResult = toolValidation.records[0].toObject();

    const endpointValidation = await session.run(`
      MATCH ()-[r:USES_ENDPOINT]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesUsingApis,
             count(DISTINCT endNode(r)) AS endpointsUsed
    `);

    const endpointResult = endpointValidation.records[0].toObject();

    console.log(`    ├─ Total USES_TOOL edges: ${toolResult.totalEdges}`);
    console.log(`    ├─ Files using tools: ${toolResult.filesUsingTools}`);
    console.log(`    ├─ Tools referenced: ${toolResult.toolsUsed}`);
    console.log(`    ├─ Total USES_ENDPOINT edges: ${endpointResult.totalEdges}`);
    console.log(`    ├─ Files using endpoints: ${endpointResult.filesUsingApis}`);
    console.log(`    └─ Endpoints mapped: ${endpointResult.endpointsUsed}`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SUCCESS] Phase 4 Neo4j sync complete');
    console.log(`  - ${toolResult.totalEdges} USES_TOOL edges created`);
    console.log(`  - ${endpointResult.totalEdges} USES_ENDPOINT edges created`);
    console.log(`  - ${toolResult.filesUsingTools} files connected to tools`);
    console.log(`  - ${endpointResult.filesUsingApis} files connected to endpoints`);
    console.log();
    console.log('Phases 2-4 complete: CALLS + USES_DB + USES_TOOL edges synced');
    console.log('Next: Phase 5 (Neo4j index optimization) or Phase 6 (Feature Graph)');
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
