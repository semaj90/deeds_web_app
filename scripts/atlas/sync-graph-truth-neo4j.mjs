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
      `SELECT source_ref, feature_id, som_cluster, centroid_id, cluster_id, som_bmu_row, som_bmu_col FROM atlas_feature_map`
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

  // ── 2a. Build the graph seed set from all canonical paths we can resolve ───
  const graphFilesSet = new Set();
  const padRowsByPath = new Map();
  for (const row of padRows) {
    const norm = normalizeNeo4jPath(row.source_ref);
    graphFilesSet.add(norm);
    padRowsByPath.set(norm, row);
  }

  for (const e of rawEdges) {
    const normFrom = e.from ? normalizeNeo4jPath(e.from) : null;
    const normTo = e.to && !String(e.to).startsWith('EXTERNAL:') && !String(e.to).startsWith('UNRESOLVED:')
      ? normalizeNeo4jPath(e.to)
      : null;
    if (normFrom) graphFilesSet.add(normFrom);
    if (normTo) graphFilesSet.add(normTo);
  }

  // Filter edges to only connect codebase files that exist in parent_atlas_documents
  const importsToSync = [];
  const coversToSync = [];

  for (const e of rawEdges) {
    const normFrom = e.from ? normalizeNeo4jPath(e.from) : null;
    const normTo = e.to ? normalizeNeo4jPath(e.to) : null;
    if (normFrom && normTo && graphFilesSet.has(normFrom) && graphFilesSet.has(normTo)) {
      if (e.type === 'test_covers_file') {
        coversToSync.push({ from: normFrom, to: normTo });
      } else if (e.type === 'imports_static' || e.type === 'imports_dynamic') {
        importsToSync.push({ from: normFrom, to: normTo, isDyn: e.isDyn, type: e.type });
      }
    }
  }
  console.log(`  ✓ Filtered codebase imports: ${importsToSync.length}`);
  console.log(`  ✓ Filtered codebase test covers: ${coversToSync.length}`);

  // Helper for AST Import path resolution
  const EXTS = [
    '', '.ts', '.svelte', '.js', '.mjs',
    '/index.ts', '/index.js',
    '/+server.ts', '/+page.ts', '/+page.svelte', '/+layout.svelte',
  ];

  function resolveWithExts(base) {
    for (const ext of EXTS) {
      const c = base + ext;
      if (graphFilesSet.has(c)) return c;
      if (c.endsWith('.js')) {
        const ts = c.slice(0, -3) + '.ts';
        if (graphFilesSet.has(ts)) return ts;
      }
    }
    return null;
  }

  function resolveImport(spec, fromRel) {
    if (!spec) return null;
    const s = spec.split('?')[0].split('#')[0];
    if (s.startsWith('$lib/')) {
      return resolveWithExts('src/lib/' + s.slice(5));
    }
    if (s.startsWith('$app/') || s.startsWith('$env/') || s.startsWith('$service-worker')) {
      return null;
    }
    if (s.startsWith('.')) {
      const parts = [];
      const fromDirParts = fromRel.split('/').slice(0, -1);
      for (const p of [...fromDirParts, ...s.split('/')]) {
        if (p === '..') parts.pop();
        else if (p !== '.' && p !== '') parts.push(p);
      }
      return resolveWithExts(parts.join('/'));
    }
    if (/^(src|tests|scripts)\//.test(s)) {
      return resolveWithExts(s);
    }
    return null;
  }

  // ── 2b. Read AST-Grep Import Relations ─────────────────────────────────────
  const astRelationsPath = path.join(ROOT, 'sveltekit-frontend', 'memory', 'index', 'ast-relations.jsonl');
  let astEdgesCount = 0;
  if (fs.existsSync(astRelationsPath)) {
    console.log(`⏳ Reading AST relations from ${astRelationsPath}...`);
    const lines = fs.readFileSync(astRelationsPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const edge = JSON.parse(line);
        if (edge.kind === 'route-handler') continue;
        
        const normFrom = normalizeNeo4jPath(edge.from);
        const resolvedTo = resolveImport(edge.to, normFrom);
        if (resolvedTo && graphFilesSet.has(normFrom) && graphFilesSet.has(resolvedTo)) {
          const isDyn = (edge.kind === 'import-dynamic');
          const edgeType = isDyn ? 'imports_dynamic' : 'imports_static';
          
          const alreadyExists = importsToSync.some(
            existing => existing.from === normFrom && existing.to === resolvedTo
          );
          
          if (!alreadyExists) {
            importsToSync.push({
              from: normFrom,
              to: resolvedTo,
              isDyn,
              type: edgeType
            });
            astEdgesCount++;
          }
        }
      } catch (err) {
        // Skip malformed lines
      }
    }
    console.log(`  ✓ Loaded and merged ${astEdgesCount} unique AST import edges`);
  } else {
    console.warn(`⚠️  ast-relations.jsonl not found at ${astRelationsPath}. Skipping AST imports.`);
  }

  // Graph files can come from deep import edges or AST relations even when they
  // are not yet present in parent_atlas_documents. Keep the graph seed broad so
  // GDS has a real import topology to work with.
  const afmByPath = new Map();
  for (const row of afmRows) {
    afmByPath.set(normalizeNeo4jPath(row.source_ref), row);
  }

  const graphNodeRows = Array.from(graphFilesSet).map((normPath) => {
    const docRow = padRowsByPath.get(normPath);
    const afmRow = afmByPath.get(normPath);
    return {
      path: normPath,
      sourceRef: docRow?.source_ref ?? normPath,
      summary: docRow?.summary || '',
      tags: docRow?.tags || [],
      featureId: docRow?.feature_id || '',
      communityId: afmRow?.community_id ?? null,
      centroidId: afmRow?.centroid_id ?? null,
      clusterId: afmRow?.cluster_id ?? null,
      somRow: afmRow?.som_bmu_row ?? null,
      somCol: afmRow?.som_bmu_col ?? null,
    };
  });

  // ── 3. Build Similar Topology Edges ────────────────────────────────────────
  // Canonical edge costs (used in GDS projection + Dijkstra)
  const COSTS = {
    HAS_CENTROID:       0.10,
    IMPORTS:            0.15,
    CALLS:              0.15,
    CONTAINS:           0.25,
    HAS_CHUNK:          0.20,
    BELONGS_TO_CLUSTER: 0.30,
    REFERENCES:         0.35,
    SIMILAR_TOPOLOGY:   0.40, // overridden per-edge by SOM grid distance below
  };

  // Group files by cluster — track SOM coords for cost calculation
  const SOM_GRID = 20; // 20×20 SOM grid

  const filesByCluster = new Map();
  const somCoordsByPath = new Map(); // normPath → { row, col }
  for (const file of afmRows) {
    const normPath = normalizeNeo4jPath(file.source_ref);
    if (!graphFilesSet.has(normPath)) continue;
    const cluster = file.som_cluster || file.centroid_id || file.cluster_id;
    if (file.som_bmu_row != null && file.som_bmu_col != null) {
      somCoordsByPath.set(normPath, { row: Number(file.som_bmu_row), col: Number(file.som_bmu_col) });
    }
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
            // Topology cost: SOM grid distance capped at grid size
            // formula: Math.min(1, somGridDistance / SOM_GRID) per spec
            const sc = somCoordsByPath.get(src);
            const tc = somCoordsByPath.get(tgt);
            let topologyCost = COSTS.SIMILAR_TOPOLOGY; // static fallback when SOM coords unavailable
            if (sc && tc) {
              const dist = Math.sqrt(Math.pow(sc.row - tc.row, 2) + Math.pow(sc.col - tc.col, 2));
              topologyCost = Math.min(1, dist / SOM_GRID);
            }
            similarToSync.push({ from: src, to: tgt, cluster, cost: topologyCost });
          }
        }
      }
    }
  }
  console.log(`  ✓ Similar topology edges (bounded): ${similarToSync.length}`);

  // ── 4. Neo4j Write Operations ──────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n📝 [DRY-RUN] Graph projection summary:');
    console.log(`   Nodes to merge (CodebaseFile):       ${graphNodeRows.length}`);
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
    console.log(`⏳ Projecting ${graphNodeRows.length} CodebaseFile nodes...`);
    for (let i = 0; i < graphNodeRows.length; i += batchSize) {
      const chunk = graphNodeRows.slice(i, i + batchSize).map((r) => ({
        path: r.path,
        sourceRef: r.sourceRef,
        summary: r.summary || '',
        tags: r.tags || [],
        featureId: r.featureId || '',
        communityId: r.communityId,
        centroidId: r.centroidId,
        clusterId: r.clusterId,
        somRow: r.somRow,
        somCol: r.somCol,
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
                c.communityId = row.communityId,
                c.centroidId = row.centroidId,
                c.clusterId = row.clusterId,
                c.somRow = row.somRow,
                c.somCol = row.somCol,
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
    const belongsTo = graphNodeRows
      .filter((r) => r.featureId)
      .map((r) => ({ path: r.path, featureId: r.featureId }));
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
            SET r.cost = $cost,
                r.updatedAt = datetime()
          `,
          { belongsTo: chunk, cost: COSTS.BELONGS_TO_CLUSTER }
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
                r.cost = $cost,
                r.updatedAt = datetime()
          `,
          { imports: chunk, cost: COSTS.IMPORTS }
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
            SET r.cost = $cost,
                r.updatedAt = datetime()
          `,
          { covers: chunk, cost: COSTS.REFERENCES }
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
                r.cost = row.cost,
                r.updatedAt = datetime()
          `,
          { similar: chunk }
        )
      );
    }

    // G. Sync HAS_CENTROID relationships (centroid cluster membership)
    const hasCentroid = afmRows
      .filter(r => r.centroid_id)
      .map(r => ({ path: normalizeNeo4jPath(r.source_ref), centroidId: r.centroid_id }));
    console.log(`⏳ Projecting ${hasCentroid.length} HAS_CENTROID relationships...`);
    for (let i = 0; i < hasCentroid.length; i += batchSize) {
      const chunk = hasCentroid.slice(i, i + batchSize);
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $edges AS row
           MERGE (c:CodebaseFile {path: row.path})
           MERGE (cent:Centroid {id: row.centroidId})
           MERGE (c)-[r:HAS_CENTROID]->(cent)
           SET r.cost = $cost,
               r.updatedAt = datetime()`,
          { edges: chunk, cost: COSTS.HAS_CENTROID }
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
