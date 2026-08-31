#!/usr/bin/env node
/** Read-only latent_256 representation audit for the exact semantic canary. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const MAP = path.join(REPO_ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const REPORT = path.join(REPO_ROOT, 'docs/reports/lineage-latent256-cohort-v2.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
const clean = (value) => { const text = String(value ?? '').trim(); return text || null; };

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const packetKeys = (map.candidates ?? []).map((candidate) => candidate.packetKey).filter(Boolean);
  if (!packetKeys.length) throw new Error('LATENT_COHORT_CANDIDATE_MAP_EMPTY');
  const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
  const available = new Set(columns.rows.map((row) => row.column_name));
  for (const required of ['source_ref', 'content_hash', 'latent_256']) if (!available.has(required)) throw new Error(`LATENT256_REQUIRED_COLUMN_MISSING:${required}`);
  const optional = ['id', 'latent_256_checkpoint_revision', 'latent_256_representation_revision', 'embedding_model', 'embedding_version'];
  const select = ['source_ref', 'content_hash', 'latent_256', ...optional.filter((name) => available.has(name)).map((name) => name === 'id' ? 'id::text AS id' : `"${name}"`)].join(', ');
  const rows = [];
  for (const candidate of map.candidates ?? []) {
    const sourceRef = clean(candidate.sourceRef);
    const hashRef = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
    const contentHash = hashRef ? clean(String(hashRef).split(':').pop()) : null;
    const result = sourceRef && contentHash
      ? await pool.query(`SELECT ${select} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2) ORDER BY ${available.has('id') ? 'id' : 'source_ref'}`, [sourceRef, contentHash])
      : { rows: [] };
    const row = result.rows.length === 1 ? result.rows[0] : null;
    const hasVector = Boolean(row && row.latent_256 !== null && row.latent_256 !== undefined);
    const checkpointRevision = clean(row?.latent_256_checkpoint_revision);
    const representationRevision = clean(row?.latent_256_representation_revision);
    const classification = result.rows.length === 0
      ? 'LATENT256_CHUNK_ROW_MISSING'
      : result.rows.length !== 1
        ? 'LATENT256_CHUNK_ROW_AMBIGUOUS'
        : !hasVector
          ? 'LATENT256_VECTOR_MISSING'
          : !checkpointRevision
            ? 'LATENT256_CHECKPOINT_REVISION_MISSING'
            : 'LATENT256_CURRENT_COHORT_CANDIDATE';
    rows.push({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef, contentHash, codebaseChunkId: row?.id ?? null, hasLatent256: hasVector, checkpointRevision, representationRevision, classification });
  }
  const counts = rows.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] ?? 0) + 1; return acc; }, {});
  const report = {
    schema: 'atlas.lineage-latent256-cohort.v2',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    candidateCount: packetKeys.length,
    rowsFound: rows.length,
    counts,
    promotionEligible: counts.LATENT256_CURRENT_COHORT_CANDIDATE === packetKeys.length,
    latentAuthority: 'codebase_chunk_index.latent_256 is inspected as the physical learned representation; derived latent_128/64 are not backfilled',
    nextGate: counts.LATENT256_CURRENT_COHORT_CANDIDATE === packetKeys.length ? 'LATENT256_F32_DERIVATION_PARITY' : 'LATENT256_PRODUCER_AND_LINEAGE_REVIEW_REQUIRED',
    rows,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, candidateCount: report.candidateCount, rowsFound: report.rowsFound, counts, promotionEligible: report.promotionEligible, nextGate: report.nextGate, report: REPORT }, null, 2));
}

main().catch((error) => { console.error(`[lineage-latent-cohort] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }).finally(() => pool.end().catch(() => {}));
