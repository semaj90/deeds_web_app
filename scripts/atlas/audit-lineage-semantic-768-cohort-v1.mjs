#!/usr/bin/env node

/** Read-only exact semantic_768 audit for the lineage-qualified candidate map. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_COHORT_REPORT ?? path.join(ROOT, 'docs/reports/lineage-semantic-768-cohort-v1.json'));
const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));

function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').pop()).toLowerCase() : null;
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length) throw new Error('SEMANTIC_COHORT_CANDIDATE_MAP_EMPTY');
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-lineage-semantic-768-cohort-audit' });
  const report = {
    schema: 'atlas.lineage-semantic-768-cohort.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_EXACT_CHUNK_AUDIT',
    candidateMap: { path: path.relative(REPO_ROOT, mapPath), candidateSnapshotRevision: map.candidateSnapshotRevision ?? null, ordinalMapChecksum: map.ordinalMapChecksum ?? null, workspaceRevision: map.workspaceRevision ?? null, candidateCount: candidates.length },
    contract: { representationId: 'semantic_768', dimensions: 768, projectionKind: 'NONE', canonicalVectorColumn: 'content_embedding_768', qdrantVectorName: 'content', canonicalAuthority: 'postgres' },
    counts: { candidates: candidates.length, exactChunkRows: 0, missingChunkRows: 0, ambiguousChunkRows: 0, vectorsPresent: 0, producerMetadataPresent: 0, semanticQualified: 0 },
    candidates: [],
    writes: { postgresWrites: false, qdrantWrites: false, vectorGeneration: false },
    status: 'FAIL',
    nextGate: 'SEMANTIC_768_CURRENT_COHORT_RECONCILIATION',
  };
  try {
    const schema = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
    const names = new Set(schema.rows.map((row) => row.column_name));
    for (const required of ['source_ref', 'content_hash', 'content_embedding_768']) if (!names.has(required)) throw new Error(`SEMANTIC_COHORT_REQUIRED_COLUMN_MISSING:${required}`);
    const optional = ['id', 'embedding_model', 'embedding_version', 'encoder_id', 'embedding_dimension', 'embedding_dtype', 'embedding_normalized', 'qdrant_id'];
    for (const candidate of candidates) {
      const sourceRef = clean(candidate.sourceRef);
      const hash = chunkHash(candidate);
      const result = hash ? await pool.query(`SELECT ${['source_ref', 'content_hash', 'content_embedding_768', ...optional.filter((name) => names.has(name)).map((name) => name === 'id' ? 'id::text AS id' : `"${name}"`)].join(', ')} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2) ORDER BY ${names.has('id') ? 'id' : 'source_ref'}`, [sourceRef, hash]) : { rows: [] };
      const row = result.rows.length === 1 ? result.rows[0] : null;
      if (result.rows.length === 0) report.counts.missingChunkRows += 1;
      else if (result.rows.length !== 1) report.counts.ambiguousChunkRows += 1;
      else {
        report.counts.exactChunkRows += 1;
        if (row.content_embedding_768 !== null && row.content_embedding_768 !== undefined) report.counts.vectorsPresent += 1;
        if (clean(row.embedding_model) && clean(row.embedding_version) && clean(row.embedding_dimension) === '768') report.counts.producerMetadataPresent += 1;
      }
      const vectorPresent = Boolean(row && row.content_embedding_768 !== null && row.content_embedding_768 !== undefined);
      const metadataPresent = Boolean(row && clean(row.embedding_model) && clean(row.embedding_version) && clean(row.embedding_dimension) === '768');
      report.candidates.push({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef, sourceRevision: candidate.sourceRevision ?? null, workspaceRevision: candidate.workspaceRevision ?? null, chunkContentHash: hash, codebaseChunkId: row?.id ?? null, vectorPresent, producerMetadataPresent: metadataPresent, semanticRevision: vectorPresent && metadataPresent ? `semantic_768:${row.embedding_model}:${row.embedding_version}:${row.encoder_id ?? 'encoder-unspecified'}` : null, classification: result.rows.length === 0 ? 'EXACT_CHUNK_ROW_MISSING' : result.rows.length !== 1 ? 'EXACT_CHUNK_ROW_AMBIGUOUS' : !vectorPresent ? 'SEMANTIC_VECTOR_MISSING' : !metadataPresent ? 'SEMANTIC_PRODUCER_METADATA_MISSING' : 'SEMANTIC_768_EXACT_READY' });
    }
    report.counts.semanticQualified = report.candidates.filter((row) => row.classification === 'SEMANTIC_768_EXACT_READY' && validRevision(row.workspaceRevision) && validRevision(row.sourceRevision)).length;
    report.status = report.counts.semanticQualified === candidates.length ? 'SEMANTIC_768_COHORT_PROVEN' : 'SEMANTIC_768_COHORT_BLOCKED';
    report.nextGate = report.status === 'SEMANTIC_768_COHORT_PROVEN' ? 'GOLDEN_RETRIEVAL_READ_ONLY_REPLAY' : 'EXACT_SEMANTIC_768_BACKFILL_PLAN_REVIEW';
  } finally { await pool.end(); }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
