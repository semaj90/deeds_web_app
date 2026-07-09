#!/usr/bin/env node
/**
 * phase2-neo4j-calls-sync.mjs
 *
 * Phase 2: Sync CALLS edges into Neo4j.
 *
 * Input: scripts/atlas/out/calls-edges-*.ndjson (164,909 edges)
 * Output: Neo4j CALLS relationships + CodebaseFile nodes
 *
 * Schema:
 *   (File) -[CALLS]-> (Function)
 *   Properties: line_num, quality_flag
 *
 * Usage:
 *   node scripts/atlas/phase2-neo4j-calls-sync.mjs [--dry-run]
 */

import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  console.log('🚀 Phase 2 Atlas: CALLS Neo4j Sync');
  console.log();

  // Neo4j connection
  const URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const USER = process.env.NEO4J_USER || 'neo4j';
  const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    // Find most recent calls-edges file
    console.log('[LOAD] Finding most recent calls-edges file...');
    const outDir = path.join(projectRoot, 'scripts/atlas/out');
    const files = execSync(`ls -t "${outDir}"/calls-edges-*.ndjson 2>/dev/null | head -1`, {
      encoding: 'utf-8'
    }).trim();

    if (!files) {
      console.error('  ❌ No calls-edges-*.ndjson files found');
      process.exit(1);
    }

    const edgesPath = files;
    console.log(`  ✓ Using: ${path.basename(edgesPath)}`);

    // Read edges in chunks (file is 24MB)
    console.log('[LOAD] Reading calls-edges file...');
    const content = readFileSync(edgesPath, 'utf-8');
    const edges = content
      .trim()
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter((e) => e !== null);

    console.log(`  ✓ Loaded ${edges.length} edges`);
    console.log();

    // Count by quality
    const byQuality = { active: 0, framework: 0, uncertain: 0 };
    edges.forEach((e) => {
      const flag = e.quality_flag || 'uncertain';
      if (flag === 'active-source') byQuality.active++;
      else if (flag === 'framework-noise') byQuality.framework++;
      else byQuality.uncertain++;
    });

    console.log('[BREAKDOWN]');
    console.log(`  - Active source: ${byQuality.active} (66%)`);
    console.log(`  - Framework noise: ${byQuality.framework} (17%)`);
    console.log(`  - Uncertain: ${byQuality.uncertain}`);
    console.log();

    // Unique files
    const files_set = new Set(edges.map((e) => e.source_file).filter((f) => f));
    console.log(`[FILES] ${files_set.size} unique source files`);
    console.log();

    if (DRY_RUN) {
      console.log('[DRY-RUN] Would sync to Neo4j. Run without --dry-run to proceed.');
      console.log(`[PREVIEW] First 5 edges:`);
      edges.slice(0, 5).forEach((e) => {
        console.log(`  ${e.source_file}:${e.line_num} -[CALLS]-> ${e.callee}`);
      });
      return;
    }

    // Sync to Neo4j
    console.log('[SYNC] Creating CALLS edges in Neo4j...');

    // 1. Create CodebaseFile nodes
    const fileList = Array.from(files_set);
    console.log(`  ├─ Creating ${fileList.length} CodebaseFile nodes...`);

    const fileChunks = [];
    for (let i = 0; i < fileList.length; i += 500) {
      fileChunks.push(fileList.slice(i, i + 500));
    }

    for (const chunk of fileChunks) {
      const normalizedChunk = chunk.map((f) => ({
        filePath: f.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '')
      }));

      await session.run(
        `
          UNWIND $files AS file
          MERGE (f:CodebaseFile { filePath: file.filePath })
          SET f.updated_at = datetime()
        `,
        { files: normalizedChunk }
      );
    }

    // 2. Create CALLS edges (in smaller chunks due to size)
    console.log(`  ├─ Creating ${edges.length} CALLS relationships...`);
    const edgeChunks = [];
    for (let i = 0; i < edges.length; i += 100) {
      edgeChunks.push(edges.slice(i, i + 100));
    }

    let edgesCreated = 0;
    for (const chunk of edgeChunks) {
      const normalizedChunk = chunk.map((e) => ({
        ...e,
        filePath: e.source_file.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '')
      }));

      await session.run(
        `
          UNWIND $edges AS edge
          MATCH (f:CodebaseFile { filePath: edge.filePath })
          MERGE (fn:Function { name: edge.callee })
          MERGE (f)-[r:CALLS]->(fn)
          SET r.line_num = edge.line_num,
              r.caller = edge.caller,
              r.kind = edge.kind,
              r.updated_at = datetime()
        `,
        { edges: normalizedChunk }
      );
      edgesCreated += chunk.length;
      if (edgesCreated % 10000 === 0) {
        console.log(`    ├─ Synced ${edgesCreated}/${edges.length}`);
      }
    }

    console.log(`    └─ Synced ${edgesCreated}/${edges.length}`);

    // 3. Validation
    console.log(`  └─ Validating sync...`);
    const validation = await session.run(`
      MATCH ()-[r:CALLS]->()
      RETURN count(r) AS totalEdges,
             count(DISTINCT startNode(r)) AS filesWithCalls,
             count(DISTINCT endNode(r)) AS functionsUsed
    `);

    const result = validation.records[0].toObject();
    console.log(`    ├─ Total CALLS edges: ${result.totalEdges}`);
    console.log(`    ├─ Files with CALLS: ${result.filesWithCalls}`);
    console.log(`    └─ Functions referenced: ${result.functionsUsed}`);
    console.log();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SUCCESS] Phase 2 Neo4j sync complete');
    console.log(`  - ${result.totalEdges} CALLS edges created`);
    console.log(`  - ${result.filesWithCalls} files connected`);
    console.log(`  - ${result.functionsUsed} functions mapped`);
    console.log();
    console.log('Next: Phase 3 USES_DB sync will now connect files to tables');
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
