/**
 * Live atlas_packets DB audit — read-only
 * Answers: column count, identity violations, packet_id format, live-vs-drizzle diff
 */
import pg from 'pg';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('c:/Users/james/Videos/deeds-web-app/.env', 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"(.*)"$/, '$1')];
    })
);

const connStr = env.DATABASE_URL || 'postgresql://postgres:password@127.0.0.1:5434/legal_ai_db';
const client = new pg.Client({ connectionString: connStr });
await client.connect();

// 1. All live columns
const colsRes = await client.query(`
  SELECT column_name, ordinal_position, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name='atlas_packets' AND table_schema='public'
  ORDER BY ordinal_position
`);
console.log('\n=== LIVE COLUMN COUNT:', colsRes.rows.length, '===');

// 2. Identity violations
const vio = await client.query(`
  SELECT
    COUNT(*)                                                         AS total_rows,
    COUNT(packet_key)                                                AS non_null_packet_key,
    COUNT(*) FILTER(WHERE packet_key IS NULL OR btrim(packet_key,'')='') AS missing_packet_key,
    COUNT(workspace_id)                                              AS non_null_workspace_id,
    COUNT(*) FILTER(WHERE workspace_id IS NULL)                     AS missing_workspace_id,
    COUNT(source_ref)                                                AS non_null_source_ref,
    COUNT(*) FILTER(WHERE source_ref IS NULL OR btrim(source_ref,'')='') AS missing_source_ref,
    COUNT(qdrant_point_id)                                           AS non_null_qdrant_point_id,
    COUNT(artifact_id)                                               AS non_null_artifact_id,
    COUNT(feature_id)                                                AS non_null_feature_id,
    COUNT(packet_id)                                                 AS non_null_packet_id
  FROM public.atlas_packets
`);
console.log('\n=== IDENTITY VIOLATIONS ===');
console.log(JSON.stringify(vio.rows[0], null, 2));

// 3. packet_id format distribution
const fmt = await client.query(`
  SELECT
    CASE
      WHEN packet_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'UUID'
      WHEN packet_id ~ '^[0-9A-Z]{26}$'                                                    THEN 'ULID'
      WHEN packet_id LIKE '%:%'                                                             THEN 'PREFIXED'
      WHEN length(packet_id) = 64                                                           THEN 'SHA256'
      ELSE 'OTHER'
    END AS fmt,
    COUNT(*) AS cnt
  FROM public.atlas_packets
  GROUP BY 1 ORDER BY cnt DESC
`);
console.log('\n=== PACKET_ID FORMAT DISTRIBUTION ===');
fmt.rows.forEach(r => console.log(` ${r.fmt}: ${r.cnt}`));

// 4. Live-vs-Drizzle diff
const DRIZZLE_COLS = new Set([
  'packet_id','packet_ulid','packet_key','source_ref','canonical_source_ref',
  'directory_path','file_path','function_symbol','feature_id','feature_label',
  'title_id','community_id','community_source','community_confidence','concept_ids',
  'cluster_id','embedding','permissions','payload','metadata','topology','vectors',
  'summary','byte_start','byte_end','sha256','source_kind','source_path',
  'source_ref_key','reward_prior','pagerank','betweenness','eigenvector',
  'neo4j_node_id','tree_node_id','redis_centroid_key','domain_class','tags',
  'lineage_version','ledger_type','canonical','payload_backfilled_at',
  'som_row','som_col','som_index','kmeans_cluster','latent_64',
  'workspace_id','workspace_revision','representation_revision','embedding_digest',
  'identity_lane','qdrant_point_id','qdrant_collection','qdrant_vector_dim',
  'identity_confidence','created_at','updated_at'
]);

const liveCols = colsRes.rows.map(r => r.column_name);
const liveOnly  = liveCols.filter(c => !DRIZZLE_COLS.has(c));
const drizzleOnly = [...DRIZZLE_COLS].filter(c => !liveCols.includes(c));

console.log('\n=== LIVE-ONLY (not in Drizzle) ===');
liveOnly.forEach(c => {
  const meta = colsRes.rows.find(r => r.column_name === c);
  console.log(`  col ${meta.ordinal_position}: ${c} (${meta.data_type}, nullable=${meta.is_nullable})`);
});
console.log('\n=== DRIZZLE-ONLY (not in live DB) ===');
drizzleOnly.forEach(c => console.log(`  ${c}`));

// 5. Type mismatches for known cols
const TYPE_MAP = {
  'packet_id': 'text', 'packet_key': 'text', 'source_ref': 'text',
  'workspace_revision': 'integer', 'representation_revision': 'integer',
  'workspace_id': 'text', 'qdrant_point_id': 'text', 'artifact_id': 'text',
};
console.log('\n=== TYPE MISMATCHES ===');
for (const [col, expected] of Object.entries(TYPE_MAP)) {
  const live = colsRes.rows.find(r => r.column_name === col);
  if (live && live.data_type !== expected) {
    console.log(`  ${col}: live=${live.data_type}, drizzle expects=${expected} ← MISMATCH`);
  }
}

await client.end();
console.log('\nDone.');
