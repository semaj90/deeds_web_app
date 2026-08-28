#!/usr/bin/env node
/** Read-only latent representation audit for the exact semantic canary. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const MAP = path.join(REPO_ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const REPORT = path.join(REPO_ROOT, 'docs/reports/lineage-latent-cohort-v1.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
const clean = (value) => { const text = String(value ?? '').trim(); return text || null; };

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const packetKeys = (map.candidates ?? []).map((candidate) => candidate.packetKey).filter(Boolean);
  if (!packetKeys.length) throw new Error('LATENT_COHORT_CANDIDATE_MAP_EMPTY');
  const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_packets'`);
  const available = new Set(columns.rows.map((row) => row.column_name));
  const optional = ['latent_64', 'latent_128', 'latent64_model', 'latent64_meta', 'latent64_msgpack', 'source_representation_id', 'projection_representation_id', 'representation_revision', 'workspace_revision', 'source_revision'];
  const select = optional.map((name) => available.has(name) ? `ap.${name}` : `NULL AS ${name}`).join(', ');
  const result = await pool.query(`SELECT ap.packet_key, ap.source_ref, ${select} FROM public.atlas_packets ap WHERE ap.packet_key = ANY($1::text[]) ORDER BY ap.packet_key`, [packetKeys]);
  const rows = result.rows.map((row) => {
    const has64 = row.latent_64 !== null && row.latent_64 !== undefined;
    const has128 = row.latent_128 !== null && row.latent_128 !== undefined;
    const hasProducer = Boolean(clean(row.latent64_model) || clean(row.latent64_meta));
    const hasInput = clean(row.source_representation_id) === 'semantic_768';
    const hasRevision = Boolean(clean(row.representation_revision) && String(row.representation_revision) !== '0');
    const classification = !has64 && !has128
      ? 'NO_LATENT_ARTIFACT'
      : !hasProducer || !hasInput || !hasRevision
        ? 'LEGACY_LATENT_IDENTITY_UNPROVEN'
        : 'CURRENT_LATENT_COHORT_CANDIDATE';
    return { packetKey: row.packet_key, sourceRef: row.source_ref, hasLatent64: has64, hasLatent128: has128, latent64Model: clean(row.latent64_model), sourceRepresentationId: clean(row.source_representation_id), representationRevision: clean(row.representation_revision), classification };
  });
  const counts = rows.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] ?? 0) + 1; return acc; }, {});
  const report = {
    schema: 'atlas.lineage-latent-cohort.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    candidateCount: packetKeys.length,
    rowsFound: rows.length,
    counts,
    promotionEligible: counts.CURRENT_LATENT_COHORT_CANDIDATE === packetKeys.length,
    latentAuthority: 'atlas_packets fields are inspected only; no latent producer or representation ledger is inferred',
    nextGate: counts.CURRENT_LATENT_COHORT_CANDIDATE === packetKeys.length ? 'SOM_IDENTITY_PARITY_CANARY' : 'LATENT_PRODUCER_AND_REPRESENTATION_LEDGER_REQUIRED',
    rows,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, candidateCount: report.candidateCount, rowsFound: report.rowsFound, counts, promotionEligible: report.promotionEligible, nextGate: report.nextGate, report: REPORT }, null, 2));
}

main().catch((error) => { console.error(`[lineage-latent-cohort] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }).finally(() => pool.end().catch(() => {}));
