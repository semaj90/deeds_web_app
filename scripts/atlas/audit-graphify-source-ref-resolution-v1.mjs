#!/usr/bin/env node
/**
 * Read-only diagnostic for atlas_packets.source_ref -> graphify_files.source_ref.
 * Non-exact matches are evidence for resolver design only; none are promotable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { canonicalSourceRef } from './lib/lineage-field-aliases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(ROOT, 'docs/reports/graphify-source-ref-resolution-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const basenameOf = (value) => value.split('/').filter(Boolean).at(-1) ?? value;
const normalize = (value) => canonicalSourceRef({ source_ref: value });

async function main() {
  const packetResult = await pool.query(`
    SELECT source_ref, count(*)::integer AS packet_count
    FROM public.atlas_packets
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
    GROUP BY source_ref
    ORDER BY source_ref
  `);
  const graphifyResult = await pool.query(`
    SELECT source_ref, count(*)::integer AS graphify_count
    FROM public.graphify_files
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
    GROUP BY source_ref
    ORDER BY source_ref
  `);
  const bridgeResult = await pool.query(`
    WITH exact_chunk AS (
      SELECT ap.packet_key,
             ap.source_ref AS packet_ref,
             c.source_ref AS chunk_ref,
             count(*) OVER (PARTITION BY ap.packet_key) AS chunk_match_count
      FROM public.atlas_packets ap
      JOIN public.codebase_chunk_index c
        ON lower(trim(ap.content_hash)) = lower(trim(c.content_hash))
      WHERE ap.content_hash IS NOT NULL
        AND c.source_ref IS NOT NULL
    ), graphify_bridge AS (
      SELECT e.packet_key, e.packet_ref, e.chunk_ref, e.chunk_match_count,
             count(g.source_ref) OVER (PARTITION BY e.packet_key) AS graphify_match_count
      FROM exact_chunk e
      JOIN public.graphify_files g ON g.source_ref = e.chunk_ref
    )
    SELECT DISTINCT packet_key, packet_ref, chunk_ref
    FROM graphify_bridge
    WHERE chunk_match_count = 1 AND graphify_match_count = 1
    ORDER BY packet_key
  `);
  const graphifyByRaw = new Map(graphifyResult.rows.map((row) => [String(row.source_ref), row]));
  const graphifyByNormalized = new Map();
  const graphifyByBasename = new Map();
  for (const row of graphifyResult.rows) {
    const raw = String(row.source_ref);
    const normalized = normalize(raw);
    if (!graphifyByNormalized.has(normalized)) graphifyByNormalized.set(normalized, []);
    graphifyByNormalized.get(normalized).push(raw);
    const basename = basenameOf(normalized);
    if (!graphifyByBasename.has(basename)) graphifyByBasename.set(basename, []);
    graphifyByBasename.get(basename).push(raw);
  }

  const counts = {
    packetSourceRefs: packetResult.rows.length,
    graphifySourceRefs: graphifyResult.rows.length,
    exactPacketChunkGraphifyBridges: bridgeResult.rows.length,
    RAW_EXACT: 0,
    NORMALIZED_EXACT: 0,
    BASENAME_UNIQUE: 0,
    BASENAME_AMBIGUOUS: 0,
    UNRESOLVED: 0,
  };
  const samples = {
    NORMALIZED_EXACT: [],
    BASENAME_UNIQUE: [],
    BASENAME_AMBIGUOUS: [],
    UNRESOLVED: [],
  };
  const sampleLimit = 25;
  for (const row of packetResult.rows) {
    const raw = String(row.source_ref);
    if (graphifyByRaw.has(raw)) {
      counts.RAW_EXACT += 1;
      continue;
    }
    const normalized = normalize(raw);
    const normalizedMatches = [...new Set(graphifyByNormalized.get(normalized) ?? [])];
    if (normalizedMatches.length === 1) {
      counts.NORMALIZED_EXACT += 1;
      if (samples.NORMALIZED_EXACT.length < sampleLimit) samples.NORMALIZED_EXACT.push({ sourceRef: raw, normalizedSourceRef: normalized, graphifySourceRef: normalizedMatches[0], packetCount: Number(row.packet_count) });
      continue;
    }
    const basename = basenameOf(normalized);
    const basenameMatches = [...new Set(graphifyByBasename.get(basename) ?? [])];
    if (basenameMatches.length === 1) {
      counts.BASENAME_UNIQUE += 1;
      if (samples.BASENAME_UNIQUE.length < sampleLimit) samples.BASENAME_UNIQUE.push({ sourceRef: raw, basename, graphifySourceRef: basenameMatches[0], packetCount: Number(row.packet_count) });
    } else if (basenameMatches.length > 1) {
      counts.BASENAME_AMBIGUOUS += 1;
      if (samples.BASENAME_AMBIGUOUS.length < sampleLimit) samples.BASENAME_AMBIGUOUS.push({ sourceRef: raw, basename, graphifySourceRefs: basenameMatches.slice(0, 10), candidateCount: basenameMatches.length, packetCount: Number(row.packet_count) });
    } else {
      counts.UNRESOLVED += 1;
      if (samples.UNRESOLVED.length < sampleLimit) samples.UNRESOLVED.push({ sourceRef: raw, normalizedSourceRef: normalized, packetCount: Number(row.packet_count) });
    }
  }

  const report = {
    schema: 'atlas.graphify-source-ref-resolution-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    matchingPolicy: {
      rawExact: 'promotion_eligible_only_with_independent_content_and_revision_proof',
      normalizedExact: 'diagnostic_only_until_canonical_normalizer_is_approved',
      basenameUnique: 'diagnostic_only_requires_content_hash_or_explicit_bridge',
      basenameAmbiguous: 'rejected',
      unresolved: 'rejected',
      crossDomainHashEqualityUsed: false,
    },
    counts,
    samples,
    packetChunkGraphifyBridgeSamples: bridgeResult.rows.slice(0, 25),
    nextGate: counts.BASENAME_UNIQUE || counts.NORMALIZED_EXACT ? 'DESIGN_CANONICAL_SOURCE_REF_BRIDGE' : 'EXPAND_WORKSPACE_OBSERVATION',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
