import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OUT_TOPOLOGY = path.resolve('docs/reports/atlas-schema-topology-qualified-2026-10-13.json');

function sha256(data) {
  return 'sha256:' + createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('Querying PostgreSQL catalog for all relations in public schema...');
  const relsRes = await pool.query(`
    SELECT
      c.relname,
      c.relkind,
      pg_get_userbyid(c.relowner) AS owner,
      GREATEST(0, c.reltuples)::bigint AS estimated_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
    ORDER BY c.relname;
  `);

  const relkindMap = {
    'r': 'TABLE',
    'v': 'VIEW',
    'm': 'MATERIALIZED_VIEW',
    'p': 'PARTITIONED_TABLE',
    'f': 'FOREIGN_TABLE',
  };

  const rels = relsRes.rows;
  console.log(`Found ${rels.length} public relations across catalog.`);

  const nodes = [];
  const relMap = new Map();
  for (const r of rels) {
    const kind = relkindMap[r.relkind] || 'OTHER';
    const rowCount = Number(r.estimated_rows ?? 0);
    const node = {
      id: `postgres:public.${r.relname}`,
      relationName: r.relname,
      schema: 'public',
      kind,
      relkind: r.relkind,
      owner: r.owner,
      rowCount,
      rowCountMethod: 'CATALOG_ESTIMATE_RELTUPLES',
    };
    nodes.push(node);
    relMap.set(r.relname, node);
  }

  // Foreign keys
  console.log('Querying foreign keys from information_schema and pg_constraint...');
  const fkRes = await pool.query(`
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);

  const edges = [];
  const edgeSet = new Set();

  for (const fk of fkRes.rows) {
    const sourceNode = `postgres:public.${fk.source_table}`;
    const targetNode = `postgres:public.${fk.target_table}`;
    const edgeKey = `${sourceNode}->${targetNode}:FOREIGN_KEY`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({
        edgeId: `fk:${fk.constraint_name}`,
        source: sourceNode,
        target: targetNode,
        relation: 'FOREIGN_KEY',
        evidenceKind: 'POSTGRES_CATALOG_FK',
        sourceColumn: fk.source_column,
        targetColumn: fk.target_column,
        constraintName: fk.constraint_name,
        qualified: true,
      });
    }
  }

  // View dependencies (views querying underlying tables/views)
  console.log('Querying view dependencies from information_schema.view_table_usage...');
  const viewRes = await pool.query(`
    SELECT
      view_name,
      table_name
    FROM information_schema.view_table_usage
    WHERE view_schema = 'public' AND table_schema = 'public'
    ORDER BY view_name, table_name;
  `);

  for (const vd of viewRes.rows) {
    const sourceNode = `postgres:public.${vd.view_name}`;
    const targetNode = `postgres:public.${vd.table_name}`;
    const edgeKey = `${sourceNode}->${targetNode}:VIEW_DEPENDENCY`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({
        edgeId: `view_dep:${vd.view_name}->${vd.table_name}`,
        source: sourceNode,
        target: targetNode,
        relation: 'VIEW_DEPENDENCY',
        evidenceKind: 'POSTGRES_VIEW_DEPENDENCY',
        qualified: true,
      });
    }
  }

  await pool.end();

  // Summary counts by relkind
  const relkindCounts = {};
  for (const n of nodes) {
    relkindCounts[n.kind] = (relkindCounts[n.kind] || 0) + 1;
  }

  // Populated vs empty
  const populatedNodes = nodes.filter(n => n.rowCount > 0);

  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  const topology = {
    schema: 'atlas.schema-topology.v1',
    snapshotId: `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    generatedAt: new Date().toISOString(),
    database: 'PostgreSQL 18.4 legal_ai_db (public schema)',
    countsByKind: relkindCounts,
    totalRelations: nodes.length,
    populatedRelations: populatedNodes.length,
    qualifiedEdgesCount: edges.length,
    checksums: {
      nodesChecksum: sha256(sortedNodes.map(n => n.id)),
      edgesChecksum: sha256(sortedEdges.map(e => e.edgeId)),
    },
    nodes: sortedNodes,
    edges: sortedEdges,
    admission: 'PROPOSAL_ONLY',
  };

  await fs.mkdir(path.dirname(OUT_TOPOLOGY), { recursive: true });
  await fs.writeFile(OUT_TOPOLOGY, JSON.stringify(topology, null, 2), 'utf8');
  console.log(`Wrote qualified schema topology to ${OUT_TOPOLOGY}`);
  console.log(`Relations: ${nodes.length} (${JSON.stringify(relkindCounts)})`);
  console.log(`Qualified edges: ${edges.length} (Foreign keys + View dependencies)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
