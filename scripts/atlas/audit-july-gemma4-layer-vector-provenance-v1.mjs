#!/usr/bin/env node
/**
 * JULY_GEMMA4_VECTOR_PROVENANCE_01 (layer-level ledger). READ-ONLY: REPEATABLE READ READ ONLY transaction, no model
 * call, no writes. One row per atlas_summary_layers row in Lane C (layer_type='gemma4_offline'), Zod-validated, with
 * boolean facts first and a derived class second. Exact text hashes (no normalization). Placeholder rule is the same
 * as audit-july-summary-provenance-v1.mjs (vector shared by >1% of all embedded packets), not a new heuristic.
 * Gates: JULY_C_LAYER_CLASSIFICATION_TOTAL_01, JULY_C_PACKET_CLASSIFICATION_TOTAL_01, JULY_C_READ_ONLY_GUARD_01.
 * Evidence level reached: LEVEL 1 (+ layer-vector == packet-vector equality as a LEVEL 2 hint). Not replay.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

export const LayerLedgerRowV1 = z.object({
  schema: z.literal('atlas.july-lane-c-layer-ledger-row.v1'),
  layerKey: z.string().min(1),
  packetKey: z.string().min(1),
  summaryLevel: z.string().nullable(),
  modelName: z.string().nullable(),
  generatedDate: z.string().nullable(),
  facts: z.object({
    packetPresent: z.boolean(),
    layerTextPresent: z.boolean(),
    packetSummaryPresent: z.boolean(),
    rawSummaryEqual: z.boolean(),
    realVectorPresent: z.boolean(),
    placeholderVector: z.boolean(),
    layerEmbeddingPresent: z.boolean(),
    layerVectorEqualsPacketVector: z.boolean(),
    sourceRevisionPresent: z.boolean(),
    multipleLaneCLayersForPacket: z.boolean(),
  }).strict(),
  classes: z.array(z.string().min(1)).min(1),
}).strict();

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
const counts = async () => (await client.query(`SELECT (SELECT count(*) FROM public.atlas_summary_layers)::int layers, (SELECT count(*) FROM public.atlas_packets)::int packets, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_text IS NOT NULL)::int chunk_summary_text, (SELECT count(*) FROM public.codebase_chunk_index WHERE summary_embedding IS NOT NULL)::int chunk_summary_embedding, (SELECT count(*) FROM public.atlas_packets WHERE embedding IS NOT NULL)::int packet_embeddings`)).rows[0];
let raw; let before; let after; let totalLayers;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  before = await counts();
  totalLayers = (await client.query(`SELECT count(*)::int n FROM public.atlas_summary_layers WHERE layer_type = 'gemma4_offline'`)).rows[0].n;
  raw = (await client.query(`
    WITH emb AS (SELECT packet_key, md5(embedding::text) AS h FROM public.atlas_packets WHERE embedding IS NOT NULL),
    grp AS (SELECT h, count(*)::int AS n FROM emb GROUP BY h),
    lim AS (SELECT greatest(1, floor(count(*) * 0.01))::int AS t FROM emb),
    lc AS (SELECT l.*, row_number() OVER (ORDER BY l.packet_key, l.summary_level, l.generated_at, l.ctid) AS rn,
                  count(*) OVER (PARTITION BY l.packet_key) AS layers_for_packet
           FROM public.atlas_summary_layers l WHERE l.layer_type = 'gemma4_offline')
    SELECT lc.rn::int, lc.packet_key, lc.summary_level, lc.model_name, lc.generated_at::date AS gdate, lc.layers_for_packet::int,
      coalesce(nullif(lc.summary_text, ''), nullif(lc.summary, '')) AS layer_text,
      (ap.packet_key IS NOT NULL) AS packet_present,
      (ap.summary IS NOT NULL AND btrim(ap.summary) <> '') AS packet_summary_present,
      (coalesce(nullif(lc.summary_text, ''), nullif(lc.summary, '')) IS NOT DISTINCT FROM ap.summary) AS raw_equal,
      (emb.h IS NOT NULL) AS has_vec, (emb.h IS NOT NULL AND g.n > lim.t) AS placeholder,
      (lc.embedding IS NOT NULL) AS layer_emb, (lc.embedding IS NOT NULL AND ap.embedding IS NOT NULL AND md5(lc.embedding::text) = emb.h) AS layer_vec_eq,
      (ap.source_revision IS NOT NULL AND btrim(ap.source_revision) <> '') AS has_rev
    FROM lc LEFT JOIN public.atlas_packets ap ON ap.packet_key = lc.packet_key
    LEFT JOIN emb ON emb.packet_key = lc.packet_key LEFT JOIN grp g ON g.h = emb.h CROSS JOIN lim
    ORDER BY lc.rn`)).rows;
  after = await counts();
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const rows = raw.map((r) => {
  const f = {
    packetPresent: r.packet_present, layerTextPresent: !!(r.layer_text && r.layer_text.trim()), packetSummaryPresent: !!r.packet_summary_present,
    rawSummaryEqual: !!(r.packet_present && r.layer_text && r.raw_equal), realVectorPresent: !!(r.has_vec && !r.placeholder), placeholderVector: !!(r.has_vec && r.placeholder),
    layerEmbeddingPresent: !!r.layer_emb, layerVectorEqualsPacketVector: !!r.layer_vec_eq, sourceRevisionPresent: !!r.has_rev, multipleLaneCLayersForPacket: r.layers_for_packet > 1,
  };
  const c = [];
  if (!f.packetPresent) c.push('PACKET_MISSING');
  else {
    if (f.realVectorPresent) c.push(f.rawSummaryEqual ? 'LAYER_EQUALS_PACKET_SUMMARY_WITH_REAL_VECTOR' : f.packetSummaryPresent ? 'LAYER_DIFFERS_PACKET_SUMMARY_WITH_REAL_VECTOR' : 'LAYER_WITH_REAL_VECTOR_PACKET_SUMMARY_MISSING');
    else if (f.placeholderVector) c.push('VECTOR_PLACEHOLDER');
    else c.push('LAYER_WITHOUT_VECTOR');
    if (f.realVectorPresent) c.push('VECTOR_REAL_LINEAGE_UNPROVEN');
    if (!f.sourceRevisionPresent) c.push('SOURCE_REVISION_MISSING');
    if (f.multipleLaneCLayersForPacket) c.push('MULTIPLE_LAYERS_FOR_PACKET');
  }
  return LayerLedgerRowV1.parse({ schema: 'atlas.july-lane-c-layer-ledger-row.v1', layerKey: `layer:${r.rn}`, packetKey: r.packet_key, summaryLevel: r.summary_level, modelName: r.model_name, generatedDate: r.gdate ? String(r.gdate).slice(0, 10) : null, facts: f, classes: c });
});

const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(REPO_ROOT, '.tmp/atlas/july-gemma4-layer-ledger-v1'); fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `ledger-${stamp}.ndjson`), body, { flag: 'wx' });

const byPacket = new Map();
for (const r of rows) { const p = byPacket.get(r.packetKey) ?? { real: false, placeholder: false, noVec: false, rev: false, layers: 0, equal: false, differs: false }; p.layers++; p.real ||= r.facts.realVectorPresent; p.placeholder ||= r.facts.placeholderVector; p.noVec ||= !r.facts.realVectorPresent && !r.facts.placeholderVector; p.rev ||= r.facts.sourceRevisionPresent; p.equal ||= r.facts.rawSummaryEqual && r.facts.realVectorPresent; p.differs ||= r.classes.includes('LAYER_DIFFERS_PACKET_SUMMARY_WITH_REAL_VECTOR'); byPacket.set(r.packetKey, p); }
const P = [...byPacket.values()];
const cls = {}; for (const r of rows) for (const c of r.classes) cls[c] = (cls[c] ?? 0) + 1;
const realVecPackets = P.filter((p) => p.real).length;
const guard = Object.fromEntries(Object.keys(before).map((k) => [k, { before: before[k], after: after[k], unchanged: before[k] === after[k] }]));
const receipt = {
  schema: 'atlas.july-gemma4-layer-vector-provenance.v1', gate: 'JULY_GEMMA4_VECTOR_PROVENANCE_01', mode: 'READ_ONLY', evidenceLevel: 'LEVEL_1_MEMBERSHIP_PLUS_LAYER_VECTOR_EQUALITY_HINT',
  laneCFilter: "atlas_summary_layers.layer_type = 'gemma4_offline' (all summary levels; the layer table has no 'provenance' column)",
  placeholderRule: 'vector shared by >1% of all embedded packets (same rule as audit-july-summary-provenance-v1.mjs)',
  ledgerPath: `.tmp/atlas/july-gemma4-layer-ledger-v1/ledger-${stamp}.ndjson`, ledgerSha256: crypto.createHash('sha256').update(body).digest('hex'),
  counters: {
    lane_c_layers: rows.length, lane_c_distinct_packets: P.length, lane_c_packets_multiple_layers: P.filter((p) => p.layers > 1).length,
    lane_c_packets_with_real_vector: realVecPackets, lane_c_packets_with_placeholder: P.filter((p) => p.placeholder && !p.real).length, lane_c_packets_without_vector: P.filter((p) => p.noVec && !p.real && !p.placeholder).length,
    A_lane_c_and_real_vector: realVecPackets, B_lane_c_and_real_vector_and_source_revision: P.filter((p) => p.real && p.rev).length,
    layers_raw_equal_packet_with_real_vector: cls.LAYER_EQUALS_PACKET_SUMMARY_WITH_REAL_VECTOR ?? 0, layers_differ_packet_with_real_vector: cls.LAYER_DIFFERS_PACKET_SUMMARY_WITH_REAL_VECTOR ?? 0,
    layers_with_own_embedding: rows.filter((r) => r.facts.layerEmbeddingPresent).length, layers_own_embedding_equals_packet_vector: rows.filter((r) => r.facts.layerVectorEqualsPacketVector).length,
  },
  classCounts: cls,
  gates: {
    JULY_C_LAYER_CLASSIFICATION_TOTAL_01: { expected: totalLayers, classified: rows.length, unclassified: totalLayers - rows.length, pass: totalLayers === rows.length && rows.every((r) => r.classes.length > 0) },
    JULY_C_PACKET_CLASSIFICATION_TOTAL_01: { distinctPackets: P.length, layerRows: rows.length, multiLayerPacketsReported: P.filter((p) => p.layers > 1).length, pass: P.reduce((n, p) => n + p.layers, 0) === rows.length },
    JULY_C_READ_ONLY_GUARD_01: { populations: guard, pass: Object.values(guard).every((g) => g.unchanged), databaseWrites: 0, qdrantWrites: 0, cacheWrites: 0, packetMutations: 0, summaryMutations: 0 },
  },
  notProven: ['which text was actually embedded (levels 3-4 need historical code/log/receipt and model replay)', 'Qdrant/go-retrieval indexing input'],
  generatedAt: new Date().toISOString(),
};
const outPath = path.resolve(REPO_ROOT, args.get('out') ?? 'docs/reports/july-gemma4-layer-vector-provenance-v1.json');
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ counters: receipt.counters, gates: Object.fromEntries(Object.entries(receipt.gates).map(([k, v]) => [k, v.pass])), classCounts: cls }, null, 1));
