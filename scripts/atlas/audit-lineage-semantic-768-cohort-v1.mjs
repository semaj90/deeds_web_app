#!/usr/bin/env node

/** Read-only, row-bound semantic_768 audit for a candidate map. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
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

function semantic768VectorDigest(value) {
  let values;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    values = Array.from(value, Number);
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (!text.startsWith('[') || !text.endsWith(']')) return null;
    const body = text.slice(1, -1).trim();
    values = body ? body.split(',').map((part) => Number(part.trim())) : [];
  } else {
    return null;
  }
  if (values.length !== 768 || values.some((item) => !Number.isFinite(item) || !Number.isFinite(Math.fround(item)))) return null;
  const bytes = Buffer.allocUnsafe(768 * 4);
  for (let index = 0; index < values.length; index += 1) bytes.writeFloatLE(Math.fround(values[index]), index * 4);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

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
      identitySemantics: 'CandidateOrdinalMap identityAuthority=false is by contract. Canonical packet/source identity is checked through exact chunk row, PROVEN packet lineage, and workspace source binding readback.',
      producerRevision: map.producerRevision ?? null,
      candidateCount: candidates.length,
    },
    contract: {
      representationId: 'semantic_768', dimensions: 768, projectionKind: 'NONE',
      canonicalVectorColumn: 'content_embedding_768', qdrantVectorName: 'content', canonicalAuthority: 'postgres',
      vectorDigest: 'sha256 over 768 canonical little-endian float32 values read from the PostgreSQL vector',
    },
    counts: {
      candidates: candidates.length,
      exactChunkRows: 0,
      missingChunkRows: 0,
      ambiguousChunkRows: 0,
      vectorsPresent: 0,
      exactChunkSourceHashMatches: 0,
      candidateIdentityBound: 0,
      packetLineageRows: 0,
      packetLineageSourceRefMatches: 0,
      packetLineageSourceRevisionMatches: 0,
      workspaceSourceBindingRows: 0,
      candidateWorkspaceBindingMatches: 0,
      producerMetadataPresent: 0,
      sourceRevisionMatches: 0,
      workspaceRevisionMatches: 0,
      representationRevisionPresent: 0,
      vectorDigestPresent: 0,
      semanticQualified: 0,
    },
    missingRequiredColumns: [],
    missingAuthorityTables: [],
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
    const authorityTables = await client.query(`
      SELECT tables.name, to_regclass('public.' || tables.name) IS NOT NULL AS present
        FROM unnest(ARRAY['atlas_packet_chunk_lineage', 'atlas_workspace_source_bindings']::text[]) AS tables(name)
    `);
    report.missingAuthorityTables = authorityTables.rows.filter((row) => !row.present).map((row) => row.name);
    const required = [
      'id', 'source_ref', 'content_hash', 'content_embedding_768', 'source_revision', 'workspace_revision',
      'representation_revision', 'embedding_model', 'embedding_version', 'encoder_id', 'embedding_dimension',
    ];
    report.missingRequiredColumns = required.filter((name) => !names.has(name));
    if (report.missingRequiredColumns.length === 0 && report.missingAuthorityTables.length === 0 && report.database.transactionReadOnly) {
      const selected = [...required, ...(names.has('id') ? ['id::text AS id'] : [])];
      for (const candidate of candidates) {
        const sourceRef = clean(candidate.sourceRef);
        const hash = chunkHash(candidate);
        const result = hash
          ? await client.query(
            `SELECT ${selected.join(', ')} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2) ORDER BY ${names.has('id') ? 'codebase_chunk_index.id' : 'source_ref'}`,
            [sourceRef, hash],
          )
          : { rows: [] };
        const row = result.rows.length === 1 ? result.rows[0] : null;
        if (result.rows.length === 0) report.counts.missingChunkRows += 1;
        else if (result.rows.length !== 1) report.counts.ambiguousChunkRows += 1;
        else {
          report.counts.exactChunkRows += 1;
          report.counts.exactChunkSourceHashMatches += 1;
          if (row.content_embedding_768 !== null && row.content_embedding_768 !== undefined) report.counts.vectorsPresent += 1;
          if (clean(row.embedding_model) && clean(row.embedding_version) && clean(row.encoder_id) && clean(row.embedding_dimension) === '768') report.counts.producerMetadataPresent += 1;
          if (validRevision(row.source_revision) && row.source_revision === candidate.sourceRevision) report.counts.sourceRevisionMatches += 1;
          if (validRevision(row.workspace_revision) && row.workspace_revision === candidate.workspaceRevision) report.counts.workspaceRevisionMatches += 1;
          if (clean(row.representation_revision)) report.counts.representationRevisionPresent += 1;
        }
        const vectorDigest = row ? semantic768VectorDigest(row.content_embedding_768) : null;
        if (validDigest(vectorDigest)) report.counts.vectorDigestPresent += 1;
        const lineageResult = row ? await client.query(`
          SELECT l.packet_key::text, l.canonical_chunk_id::text, l.chunk_row_id::text,
                 l.source_ref::text, l.source_revision::text, l.revision_status::text,
                 l.lineage_producer_revision::text, l.evidence_refs,
                 b.repo_id::text, b.workspace_revision::text AS binding_workspace_revision,
                 b.source_revision::text AS binding_source_revision,
                 b.binding_checksum::text, b.producer_revision::text AS binding_producer_revision
            FROM public.atlas_packet_chunk_lineage l
            LEFT JOIN public.atlas_workspace_source_bindings b
              ON b.repo_id = 'deeds-web-app'
             AND b.canonical_source_ref = l.source_ref
             AND b.source_revision = l.source_revision
           WHERE l.chunk_row_id = $1::uuid
             AND l.packet_key = $2
             AND l.revision_status = 'PROVEN'
           ORDER BY l.source_revision, b.binding_checksum
        `, [row.id, candidate.packetKey]) : { rows: [] };
        const lineageIdentities = new Map();
        for (const item of lineageResult.rows) {
          const key = [item.packet_key, item.canonical_chunk_id, item.chunk_row_id, item.source_ref, item.source_revision, item.revision_status].map(clean).join('\0');
          if (!lineageIdentities.has(key)) lineageIdentities.set(key, item);
        }
        const lineages = [...lineageIdentities.values()];
        const lineage = lineages.length === 1 ? lineages[0] : null;
        const bindings = lineageResult.rows.filter((item) => clean(item.binding_workspace_revision));
        if (lineages.length > 0) report.counts.packetLineageRows += lineages.length;
        report.counts.workspaceSourceBindingRows += bindings.length;
        if (lineage && clean(candidate.sourceRef) === clean(lineage.source_ref)) report.counts.packetLineageSourceRefMatches += 1;
        if (lineage && clean(candidate.sourceRevision) === clean(lineage.source_revision)) report.counts.packetLineageSourceRevisionMatches += 1;
        const candidateBinding = bindings.find((item) => clean(item.binding_workspace_revision) === clean(candidate.workspaceRevision)
          && clean(item.binding_source_revision) === clean(candidate.sourceRevision));
        if (candidateBinding) report.counts.candidateWorkspaceBindingMatches += 1;
        const hasAnyWorkspaceBinding = bindings.length > 0;
        const candidateIdentityBound = Boolean(row && lineage
          && candidate.degradedIdentity !== true
          && clean(candidate.canonicalId) === clean(candidate.packetKey)
          && clean(candidate.packetKey) === clean(lineage.packet_key)
          && clean(candidate.sourceRef) === clean(row.source_ref)
          && clean(candidate.sourceRef) === clean(lineage.source_ref)
          && clean(row.content_hash).toLowerCase() === clean(hash).toLowerCase()
          && clean(candidate.sourceRevision) === clean(lineage.source_revision)
          && clean(candidate.sourceRevision) === clean(row.source_revision)
          && clean(candidate.sourceRevision) === clean(lineage.binding_source_revision)
          && Boolean(candidateBinding)
          && clean(lineage.revision_status) === 'PROVEN'
          && clean(lineage.lineage_producer_revision)
          && clean(candidateBinding.binding_checksum)
          && clean(candidateBinding.binding_producer_revision));
        if (candidateIdentityBound) report.counts.candidateIdentityBound += 1;
        const qualification = row
          ? evaluateSemantic768Candidate(candidate, { ...row, embedding_digest: vectorDigest }, candidateIdentityBound)
          : null;
        const vectorPresent = Boolean(row && row.content_embedding_768 !== null && row.content_embedding_768 !== undefined);
        const metadataPresent = Boolean(row && clean(row.embedding_model) && clean(row.embedding_version) && clean(row.encoder_id) && clean(row.embedding_dimension) === '768');
        const classification = !hash ? 'CHUNK_HASH_MISSING'
          : result.rows.length === 0 ? 'EXACT_CHUNK_ROW_MISSING'
            : result.rows.length !== 1 ? 'EXACT_CHUNK_ROW_AMBIGUOUS'
              : lineages.length === 0 ? 'CANONICAL_PACKET_LINEAGE_MISSING'
                : lineages.length !== 1 ? 'CANONICAL_PACKET_LINEAGE_AMBIGUOUS'
                  : !hasAnyWorkspaceBinding ? 'WORKSPACE_SOURCE_BINDING_MISSING'
                    : !candidateBinding ? 'CANDIDATE_WORKSPACE_REVISION_MISMATCH'
              : !qualification.checks.candidateIdentityBound ? 'CANDIDATE_ROW_IDENTITY_BINDING_MISMATCH'
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
          packetLineage: lineage ? {
            packetKey: lineage.packet_key,
            canonicalChunkId: lineage.canonical_chunk_id,
            sourceRevision: lineage.source_revision,
            revisionStatus: lineage.revision_status,
            producerRevision: lineage.lineage_producer_revision,
            bindingWorkspaceRevisions: [...new Set(bindings.map((item) => clean(item.binding_workspace_revision)))],
            candidateBinding: candidateBinding ? {
              workspaceRevision: candidateBinding.binding_workspace_revision,
              bindingChecksum: candidateBinding.binding_checksum,
              producerRevision: candidateBinding.binding_producer_revision,
            } : null,
          } : null,
          candidateIdentityBound,
          vectorPresent,
          vectorDigest,
          vectorDigestSource: vectorDigest ? 'POSTGRES_VECTOR_FLOAT32_LE_READBACK' : null,
          producerMetadataPresent: metadataPresent,
          expectedModelRevision: candidate.representationBindings?.find((item) => item.representationId === 'semantic_768')?.modelRevision ?? candidate.semanticRevision ?? null,
          observedModelRevision: qualification?.actualModelRevision ?? null,
          classification,
        });
      }
      report.counts.semanticQualified = report.candidates.filter((candidate) => candidate.classification === 'SEMANTIC_768_ROW_BOUND_READY').length;
      report.status = report.counts.semanticQualified === candidates.length ? 'SEMANTIC_768_COHORT_PROVEN' : 'SEMANTIC_768_COHORT_BLOCKED';
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
