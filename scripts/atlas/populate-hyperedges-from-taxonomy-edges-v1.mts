import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

// See kag-persist-hyperedges-live-proof-v1.mts for why DATABASE_URL must be
// set explicitly before importing anything that transitively imports
// db/client.ts under a bare `tsx` invocation outside SvelteKit's runtime.
process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createConceptBroaderThanV1, createConceptPartOfV1 } = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts'
);
const { persistHyperedges } = await import('../../sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts');

/**
 * Populates real KAG_TAXONOMY HyperedgeV1 rows into atlas_hyperedges /
 * atlas_hyperedge_members from the REAL, pre-existing taxonomy_edges table
 * (62,802 rows: IS_A 5,008 / INHERITS_FROM 43 / PART_OF 57,751, seeded
 * 2026-05-08 via drizzle/manual/20260508_agent_context_relations.sql from a
 * real file->cluster->topo-class->root SOM/kmeans topology pass).
 *
 * This is a BRIDGE, not a new extraction pipeline: taxonomy_edges is real
 * data that already existed, sitting in a table the new RelationshipKernelV1
 * domain-ownership model (built earlier this session) never read from.
 * Before writing this, audited every relationship/ontology/taxonomy-shaped
 * table in the live DB (26 total) rather than assuming atlas_hyperedges'
 * 0-row count meant no real relationship data existed anywhere — it meant
 * only that nothing had bridged the existing real data into the new
 * canonical contract yet.
 *
 * Relation mapping (deliberately NOT collapsed into one predicate):
 *   IS_A, INHERITS_FROM -> CONCEPT_BROADER_THAN (hyponymy: target is broader,
 *     source is narrower -- matches the real sample "topo:api-route IS_A root")
 *   PART_OF             -> CONCEPT_PART_OF (meronymy: target is the whole,
 *     source is the part -- matches the real sample
 *     "file:173561965 PART_OF cluster:ui-component:21")
 * taxonomy_nodes.node_key IS taxonomy_edges.source_key/target_key (confirmed
 * live via FK-shaped join, not assumed) so the raw node_key strings are used
 * directly as HyperedgeV1 canonicalIds -- no synthetic concept-id hashing,
 * since these are already the real, unique, stable identifiers.
 */

const { Pool } = pg;

const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx >= 0 ? Number(process.argv[idx + 1]) : null;
})();
const BATCH_SIZE = 500;

function requiredRevision(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`TAXONOMY_BRIDGE_${name.toUpperCase()}_REQUIRED`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (!hasFlag('historical-bridge')) throw new Error('TAXONOMY_BRIDGE_HISTORICAL_MODE_REQUIRED');
  // This bridge is intentionally historical. Revisions must be supplied by
  // the operator from evidence; never derive source/workspace identity from
  // Git HEAD and never reuse a fixed graph revision as current authority.
  const workspaceRevision = requiredRevision('workspace-revision');
  const sourceRevision = requiredRevision('source-revision');
  const graphRevision = requiredRevision('graph-revision');
  const producerRevision = 'taxonomy-edges-bridge.v1';

  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2 });

  const report: Record<string, unknown> = {
    schema: 'atlas.populate-hyperedges-from-taxonomy-edges.v1',
    mode: 'HISTORICAL_BRIDGE',
    canonicalAuthority: false,
    limit: LIMIT,
  };

  try {
    const countRes = await pool.query<{ count: string }>('SELECT count(*) FROM taxonomy_edges');
    const totalRows = Number(countRes.rows[0].count);
    report.totalTaxonomyEdgeRows = totalRows;

    const rowsRes = await pool.query<{
      id: string;
      source_key: string;
      target_key: string;
      relation: string;
    }>(
      `SELECT id, source_key, target_key, relation FROM taxonomy_edges ORDER BY id${LIMIT ? ' LIMIT $1' : ''}`,
      LIMIT ? [LIMIT] : [],
    );

    let attempted = 0;
    let written = 0;
    let skippedUnknownRelation = 0;
    const errors: Array<{ id: string; message: string }> = [];
    const byRelation: Record<string, number> = {};

    for (let i = 0; i < rowsRes.rows.length; i += BATCH_SIZE) {
      const batch = rowsRes.rows.slice(i, i + BATCH_SIZE);
      const edges: any[] = [];
      for (const row of batch) {
        byRelation[row.relation] = (byRelation[row.relation] ?? 0) + 1;
        const evidenceRefs = [`taxonomy_edges:${row.id}`];
        try {
          if (row.relation === 'IS_A' || row.relation === 'INHERITS_FROM') {
            edges.push(
              createConceptBroaderThanV1({
                parentConceptId: row.target_key,
                childConceptId: row.source_key,
                workspaceRevision,
                graphRevision,
                sourceRevision,
                evidenceRefs,
                producerRevision,
              }),
            );
          } else if (row.relation === 'PART_OF') {
            edges.push(
              createConceptPartOfV1({
                wholeConceptId: row.target_key,
                partConceptId: row.source_key,
                workspaceRevision,
                graphRevision,
                sourceRevision,
                evidenceRefs,
                producerRevision,
              }),
            );
          } else {
            skippedUnknownRelation += 1;
          }
        } catch (err) {
          errors.push({ id: row.id, message: (err as Error)?.message ?? String(err) });
        }
      }

      const result = await persistHyperedges(edges);
      attempted += result.attempted;
      written += result.written;
      for (const e of result.errors) errors.push({ id: e.hyperedgeId, message: e.message });

      if ((i / BATCH_SIZE) % 10 === 0) {
        console.error(`[progress] ${Math.min(i + BATCH_SIZE, rowsRes.rows.length)}/${rowsRes.rows.length} rows processed, ${written} written`);
      }
    }

    report.sourceRowsRead = rowsRes.rows.length;
    report.byRelation = byRelation;
    report.attempted = attempted;
    report.written = written;
    report.skippedUnknownRelation = skippedUnknownRelation;
    report.errorCount = errors.length;
    report.firstErrors = errors.slice(0, 10);

    const finalCount = await pool.query<{ count: string }>('SELECT count(*) FROM atlas_hyperedges');
    report.atlasHyperedgesRowCountAfter = Number(finalCount.rows[0].count);
    const finalMembers = await pool.query<{ count: string }>('SELECT count(*) FROM atlas_hyperedge_members');
    report.atlasHyperedgeMembersRowCountAfter = Number(finalMembers.rows[0].count);

    report.status = errors.length === 0 ? 'APPLY_PROVEN' : 'APPLY_PROVEN_WITH_ERRORS';
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
