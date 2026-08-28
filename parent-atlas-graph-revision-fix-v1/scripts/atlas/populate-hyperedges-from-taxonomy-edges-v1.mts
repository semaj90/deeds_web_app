import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

/**
 * REL-REV-01 quarantine.
 *
 * taxonomy_edges is a real historical relationship corpus, but this bridge
 * previously manufactured current revision coordinates by substituting:
 *
 *   workspaceRevision = git HEAD
 *   sourceRevision    = workspaceRevision
 *   graphRevision     = historical constant
 *
 * Those substitutions are prohibited. This file is intentionally read-only
 * until a new producer can bind each promoted relationship through real
 * SourceRefBindingV1 / workspaceRevision / sourceRevision evidence and mint a
 * relationshipRevision from the relationship owner.
 *
 * Do not restamp historical rows with today's source/workspace revisions.
 */

const { Pool } = pg;

const applyRequested =
  process.argv.includes('--apply') ||
  process.env.ATLAS_TAXONOMY_BRIDGE_APPLY === '1';

if (applyRequested) {
  throw new Error(
    'HISTORICAL_TAXONOMY_BRIDGE_APPLY_DISABLED_REQUIRES_REVISION_QUALIFIED_SOURCE_BINDING',
  );
}

async function main() {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
    max: 2,
  });
  try {
    const countRes = await pool.query<{ count: string }>(
      'SELECT count(*) FROM taxonomy_edges',
    );

    const relationRes = await pool.query<{ relation: string; count: string }>(
      `SELECT relation, count(*)::text AS count
         FROM taxonomy_edges
        GROUP BY relation
        ORDER BY relation`,
    );

    const report = {
      schema: 'atlas.historical-taxonomy-relationship-corpus.v1',
      status: 'HISTORICAL_RELATIONSHIP_CORPUS',
      readOnly: true,
      currentPromotionEligible: false,
      reason:
        'Historical taxonomy edges lack revision-qualified source/workspace relationship ownership under the current contract.',
      prohibitedSubstitutions: [
        'git_head_as_workspace_revision',
        'workspace_revision_as_source_revision',
        'historical_constant_as_graph_revision',
      ],
      sourceRows: Number(countRes.rows[0]?.count ?? 0),
      byRelation: Object.fromEntries(
        relationRes.rows.map((row) => [row.relation, Number(row.count)]),
      ),
      nextGate:
        'REL_REV_02_CURRENT_PRODUCER_REQUIRES_REAL_SOURCE_BINDING_AND_RELATIONSHIP_REVISION',
      writes: {
        postgres: false,
        qdrant: false,
        neo4j: false,
        valkey: false,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
