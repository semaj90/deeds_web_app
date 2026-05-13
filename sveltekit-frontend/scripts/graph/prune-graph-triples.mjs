#!/usr/bin/env node
/**
 * scripts/graph/prune-graph-triples.mjs
 *
 * Maintenance tool for real-time relational triple pruning.
 * 1. Scans Postgres code_relations table.
 * 2. Checks if source_file exists on disk.
 * 3. Removes stale triples from Postgres and Neo4j.
 *
 * Usage:
 *   node scripts/graph/prune-graph-triples.mjs
 *   node scripts/graph/prune-graph-triples.mjs --dry-run
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'src');

dotenv.config({ path: resolve(ROOT, '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('\n🗑️ [Graph-Pruner] Starting relational triple pruning...\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('  [ERROR] DATABASE_URL not set.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  
  try {
    // 1. Fetch all unique source files from code_relations
    console.log('🔍 Fetching triples from Postgres...');
    const { rows: triples } = await pool.query('SELECT id, source_file, target_key, relation_type FROM code_relations');
    console.log(`  Found ${triples.length} total triples.`);

    const staleIds = [];
    const staleFiles = new Set();

    for (const triple of triples) {
      // source_file is relative to SRC or ROOT?
      // extract-code-relations.mjs uses path.relative(srcRoot, absPath)
      // so it's relative to SRC.
      const absPath = resolve(SRC, triple.source_file);
      
      if (!existsSync(absPath)) {
        staleIds.push(triple.id);
        staleFiles.add(triple.source_file);
      }
    }

    if (staleIds.length === 0) {
      console.log('✅ No stale triples found. Everything is in sync.');
      return;
    }

    console.log(`🚨 Found ${staleIds.length} stale triples across ${staleFiles.size} missing files.`);
    
    if (DRY_RUN) {
      console.log('\n[dry-run] Stale files that would be pruned:');
      Array.from(staleFiles).slice(0, 10).forEach(f => console.log(`  - ${f}`));
      if (staleFiles.size > 10) console.log(`  ... and ${staleFiles.size - 10} more.`);
      return;
    }

    // 2. Prune from Postgres
    console.log(`\n🧹 Pruning ${staleIds.length} rows from Postgres...`);
    const BATCH = 500;
    for (let i = 0; i < staleIds.length; i += BATCH) {
      const batch = staleIds.slice(i, i + BATCH);
      await pool.query('DELETE FROM code_relations WHERE id = ANY($1)', [batch]);
    }
    console.log('  ✓ Postgres cleanup complete.');

    // 3. Prune from Neo4j
    console.log('🧹 Pruning corresponding edges from Neo4j...');
    const NEO4J_URI      = process.env.NEO4J_URI      ?? 'bolt://localhost:7687';
    const NEO4J_USER     = process.env.NEO4J_USER     ?? 'neo4j';
    const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'neo4j123';

    try {
      const { default: neo4j } = await import('neo4j-driver');
      const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
      const session = driver.session();
      try {
        const fileList = Array.from(staleFiles);
        for (let i = 0; i < fileList.length; i += BATCH) {
          const batch = fileList.slice(i, i + BATCH);
          // Delete CodebaseFile nodes if they have no other relations, or just the edges?
          // The user asked for "relational triple pruning", so we should remove the edges.
          // If the file is gone, the node should probably go too if it's a CodebaseFile.
          await session.run(`
            UNWIND $files AS fp
            MATCH (n:CodebaseFile {filePath: fp})
            DETACH DELETE n
          `, { files: batch });
        }
        console.log('  ✓ Neo4j cleanup complete.');
      } finally {
        await session.close();
        await driver.close();
      }
    } catch (err) {
      console.warn(`  [warn] Neo4j cleanup skipped: ${err.message}`);
    }

    console.log('\n✅ Pruning completed successfully.');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
