#!/usr/bin/env node
/**
 * build-topology-taxonomy.mjs
 *
 * Builds an ontological taxonomy over the topological data store.
 *
 * Hierarchy (5 levels):
 *   L0  ROOT          codebase
 *   L1  topo_class    api-route, database-schema, ui-component, ...
 *   L2  topo_byte     numeric variant within a class (bit-flags)
 *   L3  cluster       gpu:N or dir:path
 *   L4  file          stable_key
 *
 * Ontological relations (taxonomy_edges):
 *   IS_A          — file IS_A topo_class instance         (L4 → L1)
 *   PART_OF       — file PART_OF cluster                  (L4 → L3)
 *   SHARES_TOPO   — file SHARES_TOPO with topo_byte peers (L4 ↔ L4)
 *   SIBLING_OF    — same parent in hierarchy              (level-N ↔ level-N)
 *   INHERITS_FROM — topo_byte INHERITS_FROM topo_class    (L2 → L1)
 *
 * Reads:
 *   - code_retrieval_chunks  (topo_class, topo_byte, file_path, stable_key)
 *   - qdrant_cluster_members (cluster_key, stable_key, file_path)
 *
 * Writes:
 *   - taxonomy_nodes
 *   - taxonomy_edges
 *   - Redis  taxonomy:level:{N}:{parent}  → JSON list of children (24h TTL)
 *
 * Usage:
 *   node scripts/build-topology-taxonomy.mjs
 *   node scripts/build-topology-taxonomy.mjs --dry-run
 *   node scripts/build-topology-taxonomy.mjs --reset    # truncate before build
 */

import pg     from 'pg';
import Redis  from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const RESET   = process.argv.includes('--reset');

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const TTL       = 24 * 3600;

const pool  = new pg.Pool({ connectionString: DB_URL, max: 4 });
const redis = new Redis(REDIS_URL, { lazyConnect: true });

let nodes  = [];   // { node_key, level, parent_key, display_name, metadata, member_count }
let edges  = [];   // { source_key, target_key, relation, weight, evidence }

function addNode(n) { nodes.push(n); }
function addEdge(e) { edges.push(e); }

async function main() {
  console.log(`\n[taxonomy] ${DRY_RUN ? 'DRY-RUN' : 'BUILD'} starting…`);
  await redis.connect().catch(() => {});

  if (RESET && !DRY_RUN) {
    await pool.query('TRUNCATE taxonomy_nodes RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE taxonomy_edges RESTART IDENTITY CASCADE');
    console.log('  ✓ tables truncated');
  }

  // ── L0: ROOT ──
  addNode({
    node_key: 'root', level: 0, parent_key: null,
    display_name: 'Codebase', metadata: {}, member_count: 0,
  });

  // ── L1: topo_class ──
  const { rows: classes } = await pool.query(`
    SELECT topo_class, COUNT(*) AS files
    FROM code_retrieval_chunks
    WHERE topo_class IS NOT NULL
    GROUP BY topo_class
  `);
  for (const c of classes) {
    const key = `topo:${c.topo_class}`;
    addNode({
      node_key: key, level: 1, parent_key: 'root',
      display_name: c.topo_class, metadata: { kind: 'topo_class' },
      member_count: parseInt(c.files, 10),
    });
    addEdge({ source_key: key, target_key: 'root', relation: 'IS_A', weight: 1, evidence: {} });
  }
  console.log(`  ✓ L1: ${classes.length} topo_class nodes`);

  // ── L2: topo_byte (per topo_class) ──
  const { rows: bytes } = await pool.query(`
    SELECT topo_class, topo_byte, COUNT(*) AS files
    FROM code_retrieval_chunks
    WHERE topo_class IS NOT NULL AND topo_byte IS NOT NULL
    GROUP BY topo_class, topo_byte
  `);
  for (const b of bytes) {
    const parent = `topo:${b.topo_class}`;
    const key    = `byte:${b.topo_class}:${b.topo_byte}`;
    addNode({
      node_key: key, level: 2, parent_key: parent,
      display_name: `${b.topo_class}/0x${b.topo_byte.toString(16).padStart(2, '0')}`,
      metadata: { topo_byte: b.topo_byte, topo_class: b.topo_class },
      member_count: parseInt(b.files, 10),
    });
    addEdge({ source_key: key, target_key: parent, relation: 'INHERITS_FROM', weight: 1, evidence: {} });
  }
  console.log(`  ✓ L2: ${bytes.length} topo_byte nodes`);

  // ── L3: cluster (from qdrant_cluster_members) ──
  const { rows: clusters } = await pool.query(`
    SELECT cluster_key, COUNT(DISTINCT stable_key) AS members
    FROM qdrant_cluster_members
    GROUP BY cluster_key
  `).catch(() => ({ rows: [] }));
  for (const c of clusters) {
    addNode({
      node_key: `cluster:${c.cluster_key}`, level: 3, parent_key: 'root',
      display_name: c.cluster_key,
      metadata: { kind: c.cluster_key.split(':')[0] || 'unknown' },
      member_count: parseInt(c.members, 10),
    });
  }
  console.log(`  ✓ L3: ${clusters.length} cluster nodes`);

  // ── L4: file + IS_A/PART_OF edges (sample top fanIn for demo, cap at 5000) ──
  const { rows: files } = await pool.query(`
    SELECT DISTINCT ON (stable_key)
      stable_key, file_path, topo_class, topo_byte
    FROM code_retrieval_chunks
    WHERE stable_key IS NOT NULL AND topo_class IS NOT NULL
    ORDER BY stable_key, graph_authority_score DESC NULLS LAST
    LIMIT 5000
  `);
  for (const f of files) {
    const fileKey = `file:${f.stable_key}`;
    addNode({
      node_key: fileKey, level: 4, parent_key: `byte:${f.topo_class}:${f.topo_byte}`,
      display_name: f.file_path,
      metadata: { topo_class: f.topo_class, topo_byte: f.topo_byte },
      member_count: 0,
    });
    addEdge({ source_key: fileKey, target_key: `topo:${f.topo_class}`, relation: 'IS_A', weight: 1, evidence: { topo_byte: f.topo_byte } });
  }
  console.log(`  ✓ L4: ${files.length} file nodes (top by authority)`);

  // ── PART_OF edges from qdrant_cluster_members ──
  const { rows: members } = await pool.query(`
    SELECT cluster_key, stable_key
    FROM qdrant_cluster_members
    WHERE stable_key IS NOT NULL
  `).catch(() => ({ rows: [] }));
  let partOfCount = 0;
  for (const m of members) {
    addEdge({
      source_key: `file:${m.stable_key}`,
      target_key: `cluster:${m.cluster_key}`,
      relation:   'PART_OF', weight: 1, evidence: {},
    });
    partOfCount++;
  }
  console.log(`  ✓ ${partOfCount} PART_OF edges`);

  // ── Persist ──
  if (DRY_RUN) {
    console.log(`\n  [dry-run] would write ${nodes.length} nodes, ${edges.length} edges`);
    await redis.quit().catch(() => {});
    await pool.end();
    return;
  }

  const nodeBatchSize = 500;
  for (let i = 0; i < nodes.length; i += nodeBatchSize) {
    const batch = nodes.slice(i, i + nodeBatchSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const n of batch) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++})`);
      params.push(n.node_key, n.level, n.parent_key, n.display_name, JSON.stringify(n.metadata), n.member_count);
    }
    await pool.query(
      `INSERT INTO taxonomy_nodes (node_key, level, parent_key, display_name, metadata, member_count)
       VALUES ${values.join(',')}
       ON CONFLICT (node_key) DO UPDATE SET
         level = EXCLUDED.level, parent_key = EXCLUDED.parent_key,
         display_name = EXCLUDED.display_name, metadata = EXCLUDED.metadata,
         member_count = EXCLUDED.member_count`,
      params,
    );
  }
  console.log(`  ✓ wrote ${nodes.length} nodes`);

  const edgeBatchSize = 500;
  for (let i = 0; i < edges.length; i += edgeBatchSize) {
    const batch = edges.slice(i, i + edgeBatchSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const e of batch) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb)`);
      params.push(e.source_key, e.target_key, e.relation, e.weight, JSON.stringify(e.evidence));
    }
    await pool.query(
      `INSERT INTO taxonomy_edges (source_key, target_key, relation, weight, evidence)
       VALUES ${values.join(',')}
       ON CONFLICT (source_key, target_key, relation) DO UPDATE SET
         weight = EXCLUDED.weight, evidence = EXCLUDED.evidence`,
      params,
    );
  }
  console.log(`  ✓ wrote ${edges.length} edges`);

  // ── Redis: per-parent children index ──
  const childrenByParent = new Map();
  for (const n of nodes) {
    if (!n.parent_key) continue;
    const list = childrenByParent.get(n.parent_key) ?? [];
    list.push({ node_key: n.node_key, level: n.level, display_name: n.display_name, member_count: n.member_count });
    childrenByParent.set(n.parent_key, list);
  }
  let redisCount = 0;
  const pipe = redis.pipeline();
  for (const [parent, children] of childrenByParent) {
    pipe.setex(`taxonomy:children:${parent}`, TTL, JSON.stringify(children));
    redisCount++;
  }
  pipe.setex('taxonomy:meta', TTL, JSON.stringify({
    builtAt: new Date().toISOString(),
    nodes: nodes.length,
    edges: edges.length,
    levels: { 0: 1, 1: classes.length, 2: bytes.length, 3: clusters.length, 4: files.length },
  }));
  await pipe.exec().catch(() => {});
  console.log(`  ✓ wrote ${redisCount} Redis taxonomy:children:* keys`);

  await redis.quit().catch(() => {});
  await pool.end();

  console.log(`\n  ✓ Taxonomy build complete:`);
  console.log(`    L0 root        1`);
  console.log(`    L1 topo_class  ${classes.length}`);
  console.log(`    L2 topo_byte   ${bytes.length}`);
  console.log(`    L3 cluster     ${clusters.length}`);
  console.log(`    L4 file        ${files.length}`);
  console.log(`    Total nodes    ${nodes.length}`);
  console.log(`    Total edges    ${edges.length}`);
}

main().catch(err => {
  console.error('✗ taxonomy build failed:', err.message);
  process.exit(1);
});
