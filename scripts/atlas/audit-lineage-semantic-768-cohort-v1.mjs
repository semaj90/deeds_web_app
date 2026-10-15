#!/usr/bin/env node

/** Read-only, row-bound semantic_768 audit for a candidate map. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { evaluateSemantic768Candidate } from './lib/semantic-768-cohort-qualification-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadRepoEnv(process.env);
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
const scratchRoot = path.resolve(ROOT, '.tmp/atlas');
const defaultReportPath = path.join(scratchRoot, `lineage-semantic-768-cohort-${timestamp}.json`);
const reportPath = path.resolve(process.env.ATLAS_SEMANTIC_COHORT_REPORT ?? defaultReportPath);
const relativeReportPath = path.relative(scratchRoot, reportPath);
const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));
const validDigest = (value) => /^(?:sha256:)?[0-9a-f]{64}$/i.test(clean(value));

function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').pop()).toLowerCase() : null;
}

async function main() {
  if (relativeReportPath === '' || relativeReportPath === '..' || relativeReportPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReportPath)) {
    throw new Error('SEMANTIC_COHORT_REPORT_MUST_BE_UNDER_TMP_ATLAS');
  }
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length) throw new Error('SEMANTIC_COHORT_CANDIDATE_MAP_EMPTY');
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    application_name: 'atlas-lineage-semantic-768-cohort-audit',
    options: '-c default_transaction_read_only=on',
  });
  const report = {
    schema: 'atlas.lineage-semantic-768-cohort.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_ROW_BOUND_EXACT_CHUNK_AUDIT',
    database: { transactionReadOnly: false, databaseWrites: false },
    candidateMap: {
      path: path.relative(REPO_ROOT, mapPath),
      candidateSnapshotRevision: map.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: map.ordinalMapChecksum ?? null,
      workspaceRevision: map.workspaceRevision ?? null,
      identityAuthority: map.identityAuthority === true,
      producerRevision: map.producerRevision ?? null,
      candidateCount: candidates.length,
    },
    contract: { representationId: 'semantic_768', dimensions: 768, projectionKind: 'NONE', canonicalVectorColumn: 'content_embedding_768', qdrantVectorName: 'content', canonicalAuthority: 'postgres' },
    counts: {
      candidates: candidates.length,
      exactChunkRows: 0,
      missingChunkRows: 0,
      ambiguousChunkRows: 0,
      vectorsPresent: 0,
      producerMetadataPresent: 0,
      sourceRevisionMatches: 0,
      workspaceRevisionMatches: 0,
      representationRevisionPresent: 0,
      vectorDigestPresent: 0,
      semanticQualified: 0,
    },
    missingRequiredColumns: [],
    candidates: [],
    writes: { postgresWrites: false, qdrantWrites: false, vectorGeneration: false },
    status: 'SEMANTIC_768_COHORT_BLOCKED',
    nextGate: 'SEMANTIC_768_ROW_LINEAGE_RECONCILIATION',
  };
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '20s'");
    report.database.transactionReadOnly = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only === 'on';
    const schema = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
    const names = new Set(schema.rows.map((row) => row.column_name));
    const required = [
      'source_ref', 'content_hash', 'content_embedding_768', 'source_revision', 'workspace_revision',
      'representation_revision', 'embedding_digest', 'embedding_model', 'embedding_version', 'encoder_id', 'embedding_dimension',
    ];
    report.missingRequiredColumns = required.filter((name) => !names.has(name));
    if (report.missingRequiredColumns.length === 0 && report.database.transactionReadOnly) {
      const selected = [...required, ...(names.has('id') ? ['id::text AS id'] : [])];
      for (const candidate of candidates) {
        const sourceRef = clean(candidate.sourceRef);
        const hash = chunkHash(candidate);
        const result = hash
          ? await client.query(
            `SELECT ${selected.join(', ')} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2) ORDER BY ${names.has('id') ? 'id' : 'source_ref'}`,
            [sourceRef, hash],
          )
          : { rows: [] };
        const row = result.rows.length === 1 ? result.rows[0] : null;
        if (result.rows.length === 0) report.counts.missingChunkRows += 1;
        else if (result.rows.length !== 1) report.counts.ambiguousChunkRows += 1;
        else {
          report.counts.exactChunkRows += 1;
          if (row.content_embedding_768 !== null && row.content_embedding_768 !== undefined) report.counts.vectorsPresent += 1;
          if (clean(row.embedding_model) && clean(row.embedding_version) && clean(row.encoder_id) && clean(row.embedding_dimension) === '768') report.counts.producerMetadataPresent += 1;
          if (validRevision(row.source_revision) && row.source_revision === candidate.sourceRevision) report.counts.sourceRevisionMatches += 1;
          if (validRevision(row.workspace_revision) && row.workspace_revision === candidate.workspaceRevision) report.counts.workspaceRevisionMatches += 1;
          if (clean(row.representation_revision)) report.counts.representationRevisionPresent += 1;
          if (validDigest(row.embedding_digest)) report.counts.vectorDigestPresent += 1;
        }
        const qualification = row ? evaluateSemantic768Candidate(candidate, row, map.identityAuthority === true) : null;
        const vectorPresent = Boolean(row && row.content_embedding_768 !== null && row.content_embedding_768 !== undefined);
        const metadataPresent = Boolean(row && clean(row.embedding_model) && clean(row.embedding_version) && clean(row.encoder_id) && clean(row.embedding_dimension) === '768');
        const classification = !hash ? 'CHUNK_HASH_MISSING'
          : result.rows.length === 0 ? 'EXACT_CHUNK_ROW_MISSING'
            : result.rows.length !== 1 ? 'EXACT_CHUNK_ROW_AMBIGUOUS'
              : !qualification.checks.identityAuthority ? 'CANDIDATE_IDENTITY_NOT_AUTHORITATIVE'
                : !qualification.checks.sourceRevision ? 'SOURCE_REVISION_MISMATCH'
                  : !qualification.checks.workspaceRevision ? 'WORKSPACE_REVISION_MISMATCH'
                    : !qualification.checks.representationRevision ? 'REPRESENTATION_REVISION_MISSING'
                      : !qualification.checks.vectorDigest ? 'VECTOR_DIGEST_MISSING_OR_INVALID'
                        : !qualification.checks.vectorPresent ? 'SEMANTIC_VECTOR_MISSING'
                          : !qualification.checks.producerMetadata ? 'SEMANTIC_PRODUCER_METADATA_MISSING'
                            : !qualification.checks.modelRevision ? 'MODEL_REVISION_MISMATCH' : 'SEMANTIC_768_ROW_BOUND_READY';
        report.candidates.push({
          candidateOrdinal: candidate.candidateOrdinal,
          canonicalId: candidate.canonicalId ?? null,
          packetKey: candidate.packetKey,
          sourceRef,
          sourceRevisionExpected: candidate.sourceRevision ?? null,
          sourceRevisionObserved: row?.source_revision ?? null,
          workspaceRevisionExpected: candidate.workspaceRevision ?? null,
          workspaceRevisionObserved: row?.workspace_revision ?? null,
          representationRevisionObserved: row?.representation_revision ?? null,
          chunkContentHash: hash,
          codebaseChunkId: row?.id ?? null,
          vectorPresent,
          vectorDigest: row?.embedding_digest ?? null,
          producerMetadataPresent: metadataPresent,
          expectedModelRevision: candidate.representationBindings?.find((item) => item.representationId === 'semantic_768')?.modelRevision ?? candidate.semanticRevision ?? null,
          observedModelRevision: qualification?.actualModelRevision ?? null,
          classification,
        });
      }
      report.counts.semanticQualified = report.candidates.filter((candidate) => candidate.classification === 'SEMANTIC_768_ROW_BOUND_READY').length;
      report.status = map.identityAuthority === true && report.counts.semanticQualified === candidates.length ? 'SEMANTIC_768_COHORT_PROVEN' : 'SEMANTIC_768_COHORT_BLOCKED';
      report.nextGate = report.status === 'SEMANTIC_768_COHORT_PROVEN' ? 'GOLDEN_RETRIEVAL_READ_ONLY_REPLAY' : 'SEMANTIC_768_ROW_LINEAGE_RECONCILIATION';
    }
  } finally {
    if (transactionOpen) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, missingRequiredColumns: report.missingRequiredColumns, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
