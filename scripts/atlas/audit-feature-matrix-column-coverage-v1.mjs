#!/usr/bin/env node

/**
 * Read-only column-coverage census over the REVISION_QUALIFIED enriched-index rows.
 * Decides which candidate feature columns are populated enough to enter a first
 * CandidateFeatureMatrix. No writes; exact source_ref joins; not identity authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const dir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const manifest = JSON.parse(fs.readFileSync(path.join(shardRoot, dir, 'manifest.json'), 'utf8'));
const qualified = [];
for (const s of manifest.shards) {
  for (const line of fs.readFileSync(path.join(shardRoot, dir, s.path), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.lineageState === 'REVISION_QUALIFIED') qualified.push(r.sourceRef);
  }
}

const cols = {
  semantic_embedding_present: 'ap.embedding IS NOT NULL',
  latent_64_present: 'ap.latent_64 IS NOT NULL',
  som_cell: 'ap.som_cell_x IS NOT NULL AND ap.som_cell_y IS NOT NULL',
  som_revision_present: 'ap.som_revision IS NOT NULL',
  kmeans_cluster: 'coalesce(ap.kmeans_cluster, ap.kmeans_cluster_id) IS NOT NULL',
  community_id: 'ap.community_id IS NOT NULL',
  community_confidence: 'ap.community_confidence IS NOT NULL',
  pagerank: 'coalesce(ap.pagerank_raw, ap.pagerank_score, ap.page_rank_score) IS NOT NULL',
  betweenness: 'ap.betweenness IS NOT NULL',
  eigenvector: 'ap.eigenvector IS NOT NULL',
  k_core: 'ap.k_core IS NOT NULL',
  authority_score: 'ap.authority_score IS NOT NULL',
  domain_class: 'ap.domain_class IS NOT NULL',
  primary_domain: 'ap.primary_domain IS NOT NULL',
  domain_confidence: 'ap.domain_confidence IS NOT NULL',
  concept_ids_nonempty: 'coalesce(cardinality(ap.concept_ids),0) > 0',
  extracted_entities_nonempty: "ap.extracted_entities IS NOT NULL AND ap.extracted_entities::text NOT IN ('[]','{}','null')",
  keywords_nonempty: 'coalesce(cardinality(ap.keywords),0) > 0',
  ast_score: 'ap.ast_score IS NOT NULL',
  reward_prior: 'ap.reward_prior IS NOT NULL',
  summary_nonempty: "ap.summary IS NOT NULL AND btrim(ap.summary) <> ''",
  representation_revision_present: 'ap.representation_revision IS NOT NULL',
  embedding_digest_present: 'ap.embedding_digest IS NOT NULL',
  embedding_version_present: 'ap.embedding_version IS NOT NULL',
  lineage_binding_checksum_present: 'ap.lineage_binding_checksum IS NOT NULL',
  qdrant_point_id_present: "ap.qdrant_point_id IS NOT NULL AND ap.qdrant_point_id <> ''",
};
const selectList = Object.entries(cols).map(([k, expr]) => `count(*) FILTER (WHERE ${expr})::int AS ${k}`).join(',\n  ');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
let coverage; let dims; let vers;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  coverage = (await client.query(`SELECT count(*)::int AS rows, count(DISTINCT ap.packet_key)::int AS distinct_packet_keys, ${selectList}
    FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[])`, [qualified])).rows[0];
  dims = (await client.query(`SELECT vector_dims(ap.embedding::vector)::int AS dim, count(*)::int AS n FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[]) AND ap.embedding IS NOT NULL GROUP BY 1`, [qualified])).rows;
  vers = (await client.query(`SELECT coalesce(ap.embedding_version,'(null)') AS embedding_version, coalesce(ap.representation_revision::text,'(null)') AS representation_revision, coalesce(ap.source_representation_id,'(null)') AS source_representation_id, count(*)::int AS n
    FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[]) GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 10`, [qualified])).rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* closed */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}

const total = coverage.rows;
const columnCoverage = Object.fromEntries(Object.keys(cols).map((k) => [k, { count: coverage[k], fraction: Number((coverage[k] / total).toFixed(4)) }]));
const report = {
  schema: 'atlas.feature-matrix-column-coverage.v1', mode: 'READ_ONLY', writesPerformed: false,
  shardManifest: path.relative(REPO_ROOT, path.join(shardRoot, dir, 'manifest.json')), shardRootSha256: manifest.rootSha256,
  qualifiedRowsInput: qualified.length, packetRowsMatched: total, distinctPacketKeys: coverage.distinct_packet_keys,
  columnCoverage, embeddingDimensions: dims, representationVersions: vers,
  candidateTiers: {
    dense_ge_0_95: Object.entries(columnCoverage).filter(([, v]) => v.fraction >= 0.95).map(([k]) => k),
    partial_0_05_to_0_95: Object.entries(columnCoverage).filter(([, v]) => v.fraction >= 0.05 && v.fraction < 0.95).map(([k]) => k),
    sparse_lt_0_05: Object.entries(columnCoverage).filter(([, v]) => v.fraction < 0.05).map(([k]) => k),
  },
  rules: ['coverage != quality', 'cluster/SOM/community are projections, never identity', 'a column below 0.95 needs an explicit missing-value mask, not imputation'],
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/feature-matrix-column-coverage-v1.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ qualifiedRowsInput: report.qualifiedRowsInput, packetRowsMatched: total, embeddingDimensions: dims, representationVersions: vers, candidateTiers: report.candidateTiers, columnCoverage: Object.fromEntries(Object.entries(columnCoverage).map(([k, v]) => [k, v.fraction])) }, null, 2));
