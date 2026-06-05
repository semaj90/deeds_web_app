#!/usr/bin/env node
/**
 * sync-graph-truth-neo4j.mjs
 *
 * Connects the three layers of codebase representation:
 *   1. File Truth (parent_atlas_documents)
 *   2. Feature Mapping (atlas_feature_map)
 *   3. Graph Truth (Neo4j)
 *
 * Reads files, features, deep imports, and topology clusters,
 * then projects them into Neo4j using fast, batched Cypher writes.
 *
 * Usage:
 *   node scripts/atlas/sync-graph-truth-neo4j.mjs --dry-run
 *   node scripts/atlas/sync-graph-truth-neo4j.mjs --apply
 *   node scripts/atlas/sync-graph-truth-neo4j.mjs --apply --limit=500
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Arg Parsing ──────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DRY_RUN = !APPLY;
const LIMIT_ARG = [...argv].find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

// ── Environment Loading ──────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

async function main() {
  console.log(`\n🕸️  sync-graph-truth-neo4j.mjs [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  console.log(`   Database URL : ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`   Neo4j URI    : ${NEO4J_URI} (user: ${NEO4J_USER})`);
  if (LIMIT) console.log(`   Limit        : ${LIMIT} rows`);
  console.log();

  // ── 1. Query Database ──────────────────────────────────────────────────────
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let padRows = [];
  let afmRows = [];

  try {
    const limitClause = LIMIT ? `LIMIT ${LIMIT}` : '';
    console.log('⏳ Querying parent_atlas_documents...');
    const padRes = await pool.query(
      `SELECT source_ref, rel_path, feature_id, summary, tags FROM parent_atlas_documents WHERE source_ref IS NOT NULL ${limitClause}`
    );
    padRows = padRes.rows;
    console.log(`  ✓ Loaded ${padRows.length} files from parent_atlas_documents`);

    console.log('⏳ Querying atlas_feature_map...');
    const afmRes = await pool.query(
      `SELECT source_ref, feature_id, som_cluster, centroid_id, cluster_id FROM atlas_feature_map`
    );
    afmRows = afmRes.rows;
    console.log(`  ✓ Loaded ${afmRows.length} mappings from atlas_feature_map`);
  } catch (err) {
    console.error('❌ Database query failed:', err.message);
    await pool.end();
    process.exit(1);
  }

  // Normalize source_ref to short path form (strip 'sveltekit-frontend/' prefix)
  // Neo4j graphify convention uses short paths: 'src/routes/...' not 'sveltekit-frontend/src/routes/...'
  function normalizeNeo4jPath(sourceRef) {
    return sourceRef.replace(/^sveltekit-frontend\//, '');
  }

  // Set of valid codebase file paths (normalized)
  const codebaseFilesSet = new Set(padRows.map((r) => normalizeNeo4jPath(r.source_ref)));

  // Map of file mappings by normalized source_ref
  const afmMap = new Map();
  for (const row of afmRows) {
    afmMap.set(normalizeNeo4jPath(row.source_ref), row);
  }

  // ── 2. Read Deep Import Edges ──────────────────────────────────────────────
  const importEdgesPath = path.join(ROOT, 'sveltekit-frontend', 'memory', 'graphify', 'deep', 'deep-import-edges.jsonl');
  let rawEdges = [];
  if (fs.existsSync(importEdgesPath)) {
    console.log(`⏳ Reading deep import edges from ${importEdgesPath}...`);
    const lines = fs.readFileSync(importEdgesPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        rawEdges.push(JSON.parse(line));
      } catch (err) {
        // Skip malformed lines
      }
    }
    console.log(`  ✓ Loaded ${rawEdges.length} raw import edges`);
  } else {
    console.warn(`⚠️  deep-import-edges.jsonl not found at ${importEdgesPath}. Skipping imports sync.`);
  }

  // Filter edges to only connect codebase files that exist in parent_atlas_documents
  const importsToSync = [];
  const coversToSync = [];

  for (const e of rawEdges) {
    const normFrom = e.from ? normalizeNeo4jPath(e.from) : null;
    const normTo = e.to ? normalizeNeo4jPath(e.to) : null;
    if (normFrom && normTo && codebaseFilesSet.has(normFrom) && codebaseFilesSet.has(normTo)) {
      if (e.type === 'test_covers_file') {
        coversToSync.push({ from: normFrom, to: normTo });
      } else if (e.type === 'imports_static' || e.type === 'imports_dynamic') {
        importsToSync.push({ from: normFrom, to: normTo, isDyn: e.isDyn, type: e.type });
      }
    }
  }
  console.log(`  ✓ Filtered codebase imports: ${importsToSync.length}`);
  console.log(`  ✓ Filtered codebase test covers: ${coversToSync.length}`);

  // ── 3. Build Similar Topology Edges ────────────────────────────────────────
  // Group files by cluster
  const filesByCluster = new Map();
  for (const file of afmRows) {
    const normPath = normalizeNeo4jPath(file.source_ref);
    if (!codebaseFilesSet.has(normPath)) continue;
    const cluster = file.som_cluster || file.centroid_id || file.cluster_id;
    if (!cluster) continue;
    if (!filesByCluster.has(cluster)) {
      filesByCluster.set(cluster, []);
    }
    filesByCluster.get(cluster).push(normPath);
  }

  const similarToSync = [];
  for (const [cluster, filePaths] of filesByCluster.entries()) {
    filePaths.sort();
    for (let i = 0; i < filePaths.length; i++) {
      const src = filePaths[i];
      for (let j = 1; j <= 2; j++) {
        if (filePaths.length > j) {
          const tgt = filePaths[(i + j) % filePaths.length];
          if (src !== tgt) {
            similarToSync.push({ from: src, to: tgt, cluster });
          }
        }
      }
    }
  }
  console.log(`  ✓ Similar topology edges (bounded): ${similarToSync.length}`);

  // ── 4. Neo4j Write Operations ──────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n📝 [DRY-RUN] Graph projection summary:');
    console.log(`   Nodes to merge (CodebaseFile):       ${padRows.length}`);
    const uniqueFeatures = new Set(padRows.map((r) => r.feature_id).filter(Boolean));
    console.log(`   Nodes to merge (ParentAtlasFeature): ${uniqueFeatures.size}`);
    console.log(`   Relationships (BELONGS_TO_FEATURE):  ${padRows.filter((r) => r.feature_id).length}`);
    console.log(`   Relationships (IMPORTS):             ${importsToSync.length}`);
    console.log(`   Relationships (TEST_COVERS_FILE):     ${coversToSync.length}`);
    console.log(`   Relationships (SIMILAR_TOPOLOGY):    ${similarToSync.length}`);
    console.log('\nRun with --apply to project changes to Neo4j.');
    await pool.end();
    process.exit(0);
  }

  console.log('\n⚡ Connecting to Neo4j...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });

  try {
    const batchSize = 250;

    // A. Sync CodebaseFile Nodes — use 'path' property (graphify convention, short paths)
    console.log(`⏳ Projecting ${padRows.length} CodebaseFile nodes...`);
    for (let i = 0; i < padRows.length; i += batchSize) {
      const chunk = padRows.slice(i, i + batchSize).map((r) => ({
        path: normalizeNeo4jPath(r.source_ref),
        sourceRef: r.source_ref,
        summary: r.summary || '',
        tags: r.tags || [],
        featureId: r.feature_id || '',
      }));
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $nodes AS row
            MERGE (c:CodebaseFile {path: row.path})
            SET c.sourceRef = row.sourceRef,
                c.summary = row.summary,
                c.tags = row.tags,
                c.featureId = row.featureId,
                c:ParentAtlasSource,
                c.updatedAt = datetime()
          `,
          { nodes: chunk }
        )
      );
    }

    // B. Sync ParentAtlasFeature Nodes
    const uniqueFeatures = Array.from(new Set(padRows.map((r) => r.feature_id).filter(Boolean))).map((fid) => ({
      featureId: fid,
    }));
    console.log(`⏳ Projecting ${uniqueFeatures.length} ParentAtlasFeature nodes...`);
    for (let i = 0; i < uniqueFeatures.length; i += batchSize) {
      const chunk = uniqueFeatures.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $features AS row
            MERGE (f:ParentAtlasFeature {featureId: row.featureId})
            SET f.updatedAt = datetime()
          `,
          { features: chunk }
        )
      );
    }

    // C. Sync BELONGS_TO_FEATURE relationships
    const belongsTo = padRows
      .filter((r) => r.feature_id)
      .map((r) => ({ path: normalizeNeo4jPath(r.source_ref), featureId: r.feature_id }));
    console.log(`⏳ Projecting ${belongsTo.length} BELONGS_TO_FEATURE relationships...`);
    for (let i = 0; i < belongsTo.length; i += batchSize) {
      const chunk = belongsTo.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $belongsTo AS row
            MATCH (c:CodebaseFile {path: row.path})
            MATCH (f:ParentAtlasFeature {featureId: row.featureId})
            MERGE (c)-[r:BELONGS_TO_FEATURE]->(f)
            SET r.updatedAt = datetime()
          `,
          { belongsTo: chunk }
        )
      );
    }

    // D. Sync IMPORTS relationships
    console.log(`⏳ Projecting ${importsToSync.length} IMPORTS relationships...`);
    for (let i = 0; i < importsToSync.length; i += batchSize) {
      const chunk = importsToSync.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $imports AS row
            MATCH (c1:CodebaseFile {path: row.from})
            MATCH (c2:CodebaseFile {path: row.to})
            MERGE (c1)-[r:IMPORTS]->(c2)
            SET r.isDyn = row.isDyn,
                r.type = row.type,
                r.updatedAt = datetime()
          `,
          { imports: chunk }
        )
      );
    }

    // E. Sync TEST_COVERS_FILE relationships
    console.log(`⏳ Projecting ${coversToSync.length} TEST_COVERS_FILE relationships...`);
    for (let i = 0; i < coversToSync.length; i += batchSize) {
      const chunk = coversToSync.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $covers AS row
            MATCH (c1:CodebaseFile {path: row.from})
            MATCH (c2:CodebaseFile {path: row.to})
            MERGE (c1)-[r:TEST_COVERS_FILE]->(c2)
            SET r.updatedAt = datetime()
          `,
          { covers: chunk }
        )
      );
    }

    // F. Sync SIMILAR_TOPOLOGY relationships
    console.log(`⏳ Projecting ${similarToSync.length} SIMILAR_TOPOLOGY relationships...`);
    for (let i = 0; i < similarToSync.length; i += batchSize) {
      const chunk = similarToSync.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `
            UNWIND $similar AS row
            MATCH (c1:CodebaseFile {path: row.from})
            MATCH (c2:CodebaseFile {path: row.to})
            MERGE (c1)-[r:SIMILAR_TOPOLOGY]->(c2)
            SET r.cluster = row.cluster,
                r.updatedAt = datetime()
          `,
          { similar: chunk }
        )
      );
    }

    console.log('\n🎉 Graph projection sync successfully committed to Neo4j!');
  } catch (err) {
    console.error('❌ Neo4j projection failed:', err.message);
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[sync-graph-truth-neo4j] Fatal error:', err);
  process.exit(1);
});
