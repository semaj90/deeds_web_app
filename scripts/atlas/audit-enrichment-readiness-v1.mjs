#!/usr/bin/env node

/**
 * Enrichment readiness census across ALL indexed packets — read-only, no writes.
 * Defines the field contract a file must satisfy before EmbeddingGemma fan-out / graph creation,
 * and classifies every packet by the first unmet level. Doubles as the spec for a pre-embedding gate.
 *
 * Levels (each requires the previous):
 *  L1_LINEAGE   packet_key + source_ref + source_revision (sha256 must agree when present)
 *  L2_TEXT      non-empty summary (FTS-indexed via idx_atlas_packets_summary_fts) + keywords
 *  L3_CLASSIFY  domain_class + concept_ids
 *  L4_EMBED_OK  real (non-shared) embedding + embedding_version + qualified representation_revision  [needs L1+L2]
 *  L5_PROJECT   community + kmeans + SOM cell + pagerank (projection metadata, never identity)
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ENRICHMENT_READINESS_CTE_V1 } from './lib/enrichment-readiness-sql-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
let res;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  res = (await client.query(`${ENRICHMENT_READINESS_CTE_V1}
    SELECT count(*)::int AS packets,
      count(*) FILTER (WHERE ident)::int AS ident, count(*) FILTER (WHERE has_rev)::int AS has_rev, count(*) FILTER (WHERE has_sha)::int AS has_sha, count(*) FILTER (WHERE has_ws_key)::int AS has_ws_key,
      count(*) FILTER (WHERE has_summary)::int AS has_summary, count(*) FILTER (WHERE has_keywords)::int AS has_keywords,
      count(*) FILTER (WHERE has_domain)::int AS has_domain, count(*) FILTER (WHERE has_concepts)::int AS has_concepts, count(*) FILTER (WHERE has_used_concepts)::int AS has_used_concepts, count(*) FILTER (WHERE has_entities)::int AS has_entities,
      count(*) FILTER (WHERE emb_real)::int AS emb_real, count(*) FILTER (WHERE emb_placeholder)::int AS emb_placeholder,
      count(*) FILTER (WHERE has_emb_version)::int AS has_emb_version, count(*) FILTER (WHERE has_repr_rev)::int AS has_repr_rev,
      count(*) FILTER (WHERE has_comm)::int AS has_comm, count(*) FILTER (WHERE has_km)::int AS has_km, count(*) FILTER (WHERE has_som)::int AS has_som, count(*) FILTER (WHERE has_pr)::int AS has_pr,
      count(*) FILTER (WHERE l1)::int AS l1, count(*) FILTER (WHERE l1 AND l2)::int AS l1_l2, count(*) FILTER (WHERE l1 AND l2 AND l3)::int AS l1_l3,
      count(*) FILTER (WHERE l1 AND l2 AND l3 AND l4)::int AS l1_l4, count(*) FILTER (WHERE l1 AND l2 AND l3 AND l4 AND l5)::int AS l1_l5,
      count(*) FILTER (WHERE NOT l1)::int AS first_gap_l1,
      count(*) FILTER (WHERE l1 AND NOT l2)::int AS first_gap_l2,
      count(*) FILTER (WHERE l1 AND l2 AND NOT l3)::int AS first_gap_l3,
      count(*) FILTER (WHERE l1 AND l2 AND l3 AND NOT l4)::int AS first_gap_l4,
      count(*) FILTER (WHERE l1 AND l2 AND l3 AND l4 AND NOT l5)::int AS first_gap_l5,
      count(*) FILTER (WHERE emb_placeholder AND NOT has_summary)::int AS placeholder_without_summary,
      count(*) FILTER (WHERE emb_placeholder AND has_summary)::int AS placeholder_with_summary,
      count(*) FILTER (WHERE has_summary AND NOT has_rev)::int AS summary_without_revision, count(*) FILTER (WHERE sha_conflict)::int AS sha_conflicts, count(*) FILTER (WHERE embed_allowed)::int AS embed_allowed
    FROM lv`)).rows[0];
  res.legacyRefForm = (await client.query(`SELECT count(*) FILTER (WHERE source_ref LIKE 'sveltekit-frontend/%')::int AS repo_root_form, count(*) FILTER (WHERE source_ref NOT LIKE 'sveltekit-frontend/%' AND source_ref ~ '^(src|scripts|static|drizzle)/')::int AS frontend_relative_form, count(*) FILTER (WHERE source_ref IS NULL OR source_ref = '')::int AS blank FROM public.atlas_packets`)).rows[0];
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const n = res.packets;
const pct = (x) => Number((x / n).toFixed(4));
const receipt = {
  schema: 'atlas.enrichment-readiness-census.v1', mode: 'READ_ONLY', writesPerformed: false, scope: 'ALL atlas_packets (not only the current admitted cohort)',
  packets: n, fieldCoverage: Object.fromEntries(['ident', 'has_rev', 'has_sha', 'has_ws_key', 'has_summary', 'has_keywords', 'has_domain', 'has_concepts', 'has_used_concepts', 'has_entities', 'emb_real', 'emb_placeholder', 'has_emb_version', 'has_repr_rev', 'has_comm', 'has_km', 'has_som', 'has_pr'].map((k) => [k, { count: res[k], fraction: pct(res[k]) }])),
  levelsCumulative: { L1_LINEAGE: res.l1, 'L1+L2_TEXT': res.l1_l2, 'L1..L3_CLASSIFY': res.l1_l3, 'L1..L4_EMBED_OK': res.l1_l4, 'L1..L5_PROJECT': res.l1_l5 },
  firstUnmetLevel: { L1: res.first_gap_l1, L2: res.first_gap_l2, L3: res.first_gap_l3, L4: res.first_gap_l4, L5: res.first_gap_l5, allMet: res.l1_l5 },
  placeholderEmbedding: { withoutSummary: res.placeholder_without_summary, withSummary: res.placeholder_with_summary },
  embedAllowedPackets: res.embed_allowed, summaryWithoutRevision: res.summary_without_revision, shaRevisionConflicts: res.sha_conflicts,
  sourceRefForms: res.legacyRefForm,
  contract: {
    L1_LINEAGE: 'packet_key, source_ref, source_revision (whole-file hash by construction); packet.sha256, when present, must agree with it (sha256 alone is not required: it is populated on only 7.6% of packets)',
    L2_TEXT: 'non-empty summary (FTS GIN idx_atlas_packets_summary_fts) + keywords',
    L3_CLASSIFY: 'domain_class + concept_ids',
    L4_EMBED_OK: 'real non-shared embedding + embedding_version + non-legacy representation_revision; only reachable after L1+L2',
    L5_PROJECT: 'community_id + kmeans + SOM cell + pagerank (projection metadata, never identity)',
  },
  preEmbeddingGate: {
    rule: 'EmbeddingGemma fan-out and graph creation consume only packets with L1+L2(+L3) met; others are recorded as embedding_blocked with the first unmet level, never given a default/shared vector',
    existingFailure: 'a shared placeholder vector was stored for packets with no summary (July 20-21 run), making embedding presence meaningless',
    wiring: 'not yet wired; graphify-langgraph-pipeline.mjs has uncommitted edits by another session, so the gate is specified as a task, not patched here',
  },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/enrichment-readiness-census-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ packets: n, cov: Object.fromEntries(Object.entries(receipt.fieldCoverage).map(([k, v]) => [k, v.fraction])), levels: receipt.levelsCumulative, firstUnmet: receipt.firstUnmetLevel, placeholder: receipt.placeholderEmbedding, summaryWithoutRevision: res.summary_without_revision, refForms: res.legacyRefForm }, null, 2));
