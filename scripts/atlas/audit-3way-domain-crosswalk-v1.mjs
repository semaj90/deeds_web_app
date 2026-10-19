import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

const query = `
WITH chunk_domains AS (
    SELECT DISTINCT domain AS chunk_domain
    FROM codebase_chunk_index
),
feature_domains AS (
    SELECT DISTINCT domain_class AS feat_domain_class
    FROM feature_domain
),
canonical_tax AS (
    SELECT id AS canonical_uuid, domain_id AS taxonomy_slug
    FROM domain_taxonomy_v1
)
SELECT
    c.chunk_domain,
    f.feat_domain_class,
    t.canonical_uuid,
    t.taxonomy_slug,
    COALESCE(t.taxonomy_slug, 'UNRESOLVED') AS resolved_status
FROM chunk_domains c
FULL OUTER JOIN canonical_tax t
    ON LOWER(c.chunk_domain) = LOWER(t.taxonomy_slug)
FULL OUTER JOIN feature_domains f
    ON LOWER(f.feat_domain_class) = LOWER(t.taxonomy_slug)
ORDER BY canonical_uuid NULLS LAST, chunk_domain, feat_domain_class;
`;

try {
  const result = await pool.query(query);
  console.log(JSON.stringify({
    schema: 'atlas.domain-3way-crosswalk.v1',
    rowCount: result.rows.length,
    rows: result.rows,
  }, null, 2));
} catch (err) {
  console.error(err);
} finally {
  await pool.end();
}
