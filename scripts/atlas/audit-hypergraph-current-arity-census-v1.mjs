import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { loadRepoEnv, REPO_ROOT, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const reportPath = process.env.ATLAS_HYPERGRAPH_CENSUS_REPORT ??
  path.join(REPO_ROOT, 'docs/reports/atlas-hypergraph-current-arity-census-v1.json');
const env = loadRepoEnv(process.env);
const expectedGraphRevision = process.env.ATLAS_EXPECTED_GRAPH_REVISION?.trim() || null;
const expectedWorkspaceRevision = process.env.ATLAS_EXPECTED_WORKSPACE_REVISION?.trim() || null;
const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

const required = {
  atlas_hyperedges: ['hyperedge_id', 'contract_hyperedge_id', 'relation_type', 'workspace_revision', 'source_revision', 'graph_revision', 'checksum'],
  atlas_hyperedge_members: ['hyperedge_id', 'member_id', 'member_type', 'member_role', 'ordinal'],
  atlas_ontology_tuples: ['tuple_id'],
};

const rows = (result) => result.rows.map((row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]),
));

try {
  const tableResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [Object.keys(required)]);
  const present = new Set(tableResult.rows.map((row) => row.table_name));
  const columnResult = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [Object.keys(required)]);
  const columnSet = new Set(columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = Object.fromEntries(Object.entries(required).map(([table, columns]) => [
    table, columns.filter((column) => !columnSet.has(`${table}.${column}`)),
  ]));
  const complete = present.has('atlas_hyperedges') && present.has('atlas_hyperedge_members') &&
    Object.values(missingColumns).every((missing) => missing.length === 0);

  const report = {
    schema: 'atlas.hypergraph-current-arity-census.v1',
    mode: 'READ_ONLY',
    status: complete ? 'CENSUS_COMPLETE_CURRENTNESS_UNPROVEN' : 'SCHEMA_INCOMPLETE',
    population: { hyperedges: 0, members: 0, ontologyTuples: 0 },
    revisions: {
      graphRevisionCounts: [], workspaceRevisionCounts: [], sourceRevisionPresent: 0,
      expectedGraphRevision, expectedWorkspaceRevision, currentBindingProven: false,
    },
    arity: { zero: 0, one: 0, two: 0, three: 0, fourPlus: 0, max: 0, avg: 0 },
    roles: [], relationTypes: [],
    integrity: { orphanMembers: 0, duplicateRoleMembers: 0, missingContractHyperedgeId: 0, missingChecksum: 0 },
    tablesPresent: [...present].sort(), missingColumns,
    writesPerformed: false,
  };

  if (complete) {
    const [population, arity, revisions, shapes, orphan, duplicateRoles, missingContract, missingChecksum] = await Promise.all([
      pool.query(`
        SELECT (SELECT count(*)::bigint FROM atlas_hyperedges) AS hyperedges,
               (SELECT count(*)::bigint FROM atlas_hyperedge_members) AS members,
               (SELECT count(*)::bigint FROM atlas_ontology_tuples) AS ontology_tuples
      `),
      pool.query(`
        WITH arities AS (
          SELECT h.hyperedge_id, count(m.member_id)::int AS arity
          FROM atlas_hyperedges h
          LEFT JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
          GROUP BY h.hyperedge_id
        )
        SELECT count(*) FILTER (WHERE arity = 0)::bigint AS arity_0,
               count(*) FILTER (WHERE arity = 1)::bigint AS arity_1,
               count(*) FILTER (WHERE arity = 2)::bigint AS arity_2,
               count(*) FILTER (WHERE arity = 3)::bigint AS arity_3,
               count(*) FILTER (WHERE arity >= 4)::bigint AS arity_4_plus,
               coalesce(max(arity), 0)::int AS max_arity,
               coalesce(avg(arity), 0)::double precision AS avg_arity
        FROM arities
      `),
      pool.query(`
        SELECT graph_revision, workspace_revision, count(*)::bigint AS hyperedge_count,
               count(*) FILTER (WHERE source_revision IS NOT NULL)::bigint AS source_revision_present
        FROM atlas_hyperedges
        GROUP BY graph_revision, workspace_revision
        ORDER BY hyperedge_count DESC, graph_revision, workspace_revision
      `),
      pool.query(`
        SELECT h.relation_type, m.member_role, m.member_type, count(*)::bigint AS occurrences
        FROM atlas_hyperedges h JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
        GROUP BY h.relation_type, m.member_role, m.member_type
        ORDER BY occurrences DESC, h.relation_type, m.member_role, m.member_type
      `),
      pool.query(`SELECT count(*)::bigint AS count FROM atlas_hyperedge_members m LEFT JOIN atlas_hyperedges h ON h.hyperedge_id = m.hyperedge_id WHERE h.hyperedge_id IS NULL`),
      pool.query(`SELECT count(*)::bigint AS count FROM (SELECT hyperedge_id, member_id, member_role FROM atlas_hyperedge_members GROUP BY hyperedge_id, member_id, member_role HAVING count(*) > 1) duplicates`),
      pool.query(`SELECT count(*)::bigint AS count FROM atlas_hyperedges WHERE contract_hyperedge_id IS NULL OR btrim(contract_hyperedge_id) = ''`),
      pool.query(`SELECT count(*)::bigint AS count FROM atlas_hyperedges WHERE checksum IS NULL OR btrim(checksum) = ''`),
    ]);
    const p = population.rows[0];
    const a = arity.rows[0];
    report.population = { hyperedges: Number(p.hyperedges), members: Number(p.members), ontologyTuples: Number(p.ontology_tuples) };
    report.arity = {
      zero: Number(a.arity_0), one: Number(a.arity_1), two: Number(a.arity_2), three: Number(a.arity_3),
      fourPlus: Number(a.arity_4_plus), max: Number(a.max_arity), avg: Number(a.avg_arity),
    };
    report.revisions.graphRevisionCounts = rows(revisions);
    report.revisions.workspaceRevisionCounts = [...new Set(revisions.rows.map((row) => row.workspace_revision))].map((workspaceRevision) => ({ workspaceRevision }));
    report.revisions.sourceRevisionPresent = revisions.rows.reduce((sum, row) => sum + Number(row.source_revision_present), 0);
    report.roles = rows(shapes);
    report.relationTypes = [...new Set(shapes.rows.map((row) => row.relation_type))].sort();
    report.integrity = {
      orphanMembers: Number(orphan.rows[0].count), duplicateRoleMembers: Number(duplicateRoles.rows[0].count),
      missingContractHyperedgeId: Number(missingContract.rows[0].count), missingChecksum: Number(missingChecksum.rows[0].count),
    };
    const current = revisions.rows.length === 1 &&
      (!expectedGraphRevision || revisions.rows[0].graph_revision === expectedGraphRevision) &&
      (!expectedWorkspaceRevision || revisions.rows[0].workspace_revision === expectedWorkspaceRevision) &&
      Number(revisions.rows[0].source_revision_present) === report.population.hyperedges &&
      report.integrity.orphanMembers === 0 && report.integrity.missingContractHyperedgeId === 0 && report.integrity.missingChecksum === 0;
    report.revisions.currentBindingProven = Boolean(expectedGraphRevision && expectedWorkspaceRevision && current);
    if (report.revisions.currentBindingProven) report.status = 'CURRENT_BINDING_PROVEN';
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
