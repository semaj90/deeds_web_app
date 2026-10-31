import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const OUT_TOPOLOGY = path.resolve('docs/reports/atlas-schema-topology-qualified-2026-10-13.json');

function sha256(data) {
  return 'sha256:' + createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1, statement_timeout: 10000 });
  const client = await pool.connect();
  let transactionOpen = false;
  let rels;
  let foreignKeys;
  let viewDependencies;
  let databaseIdentity;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    const readOnlyResult = await client.query('SHOW transaction_read_only');
    if (readOnlyResult.rows[0]?.transaction_read_only !== 'on') throw new Error('POSTGRES_TRANSACTION_NOT_READ_ONLY');
    const identityResult = await client.query(`
      SELECT current_database() AS database,
        current_setting('server_version') AS server_version,
        current_setting('server_version_num')::int AS server_version_num,
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port
    `);
    databaseIdentity = identityResult.rows[0];
    if (databaseIdentity.server_version_num < 180000 || databaseIdentity.server_version_num >= 190000) {
      throw new Error('POSTGRES_18_REQUIRED');
    }

    console.log('Querying PostgreSQL catalog for all relations in public schema...');
    const relsRes = await client.query(`
      SELECT
        c.relname,
        c.relkind,
        pg_get_userbyid(c.relowner) AS owner,
        c.reltuples::bigint AS estimated_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      ORDER BY c.relname;
    `);
    rels = relsRes.rows;

    console.log('Querying foreign keys from information_schema and pg_constraint...');
    const fkRes = await client.query(`
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
    foreignKeys = fkRes.rows;

    console.log('Querying view dependencies from information_schema.view_table_usage...');
    const viewRes = await client.query(`
      SELECT
        view_name,
        table_name
      FROM information_schema.view_table_usage
      WHERE view_schema = 'public' AND table_schema = 'public'
      ORDER BY view_name, table_name;
    `);
    viewDependencies = viewRes.rows;
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  }

  const relkindMap = {
    'r': 'TABLE',
    'v': 'VIEW',
    'm': 'MATERIALIZED_VIEW',
    'p': 'PARTITIONED_TABLE',
    'f': 'FOREIGN_TABLE',
  };

  console.log(`Found ${rels.length} public relations across catalog.`);

  const nodes = [];
  const relMap = new Map();
  for (const r of rels) {
    const kind = relkindMap[r.relkind] || 'OTHER';
    const estimatedRows = Number(r.estimated_rows);
    const hasEstimate = Number.isFinite(estimatedRows) && estimatedRows >= 0;
    const rowCount = hasEstimate ? estimatedRows : null;
    const node = {
      id: `postgres:public.${r.relname}`,
      relationName: r.relname,
      schema: 'public',
      kind,
      relkind: r.relkind,
      owner: r.owner,
      rowCount,
      rowCountStatus: !hasEstimate ? 'UNKNOWN_UNANALYZED' : estimatedRows === 0 ? 'ZERO_ESTIMATE' : 'POSITIVE_ESTIMATE',
      rowCountMethod: 'CATALOG_ESTIMATE_RELTUPLES',
    };
    nodes.push(node);
    relMap.set(r.relname, node);
  }

  const edges = [];
  const edgeSet = new Set();

  for (const fk of foreignKeys) {
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

  for (const vd of viewDependencies) {
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
    database: `PostgreSQL ${databaseIdentity.server_version} ${databaseIdentity.database} at ${databaseIdentity.server_address ?? 'local'}:${databaseIdentity.server_port ?? 'unknown'} (public schema)`,
    countsByKind: relkindCounts,
    totalRelations: nodes.length,
    populatedRelations: populatedNodes.length,
    zeroEstimatedRowRelations: nodes.filter(node => node.rowCountStatus === 'ZERO_ESTIMATE').length,
    unknownRowEstimateRelations: nodes.filter(node => node.rowCountStatus === 'UNKNOWN_UNANALYZED').length,
    rowEstimateCaveat: 'pg_class.reltuples is approximate; negative values mean unknown/un-analyzed and zero does not prove current emptiness.',
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
