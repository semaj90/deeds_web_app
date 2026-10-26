#!/usr/bin/env node

/** Read-only diagnostic crosswalk for the frozen semantic canary. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const reportDir = path.join(ROOT, '.tmp/atlas');
const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
const reportPath = path.join(reportDir, `semantic-packet-chunk-crosswalk-${timestamp}.json`);

function vectorValues(value) {
  if (typeof value !== 'string') return [];
  const body = value.trim().replace(/^\[|\]$/g, '');
  return body ? body.split(',').map(Number) : [];
}

function vectorDigest(value) {
  const values = vectorValues(value);
  if (values.length !== 768 || values.some((value) => !Number.isFinite(value))) return null;
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function equalVectors(left, right) {
  const a = vectorValues(left);
  const b = vectorValues(right);
  return a.length === 768 && b.length === 768 && a.every((value, index) => Object.is(value, b[index]));
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates.map((candidate) => ({
    packet_key: candidate.packetKey,
    source_ref: candidate.sourceRef,
    source_revision: candidate.sourceRevision,
    workspace_revision: candidate.workspaceRevision,
    chunk_hash: (candidate.evidenceRefs ?? []).find((ref) => String(ref).startsWith('chunk:'))?.split(':').at(-1)?.toLowerCase() ?? null,
  })) : [];
  if (candidates.length === 0) throw new Error('SEMANTIC_CROSSWALK_CANDIDATE_MAP_EMPTY');

  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    application_name: 'atlas-semantic-packet-chunk-crosswalk-v1',
    options: '-c default_transaction_read_only=on',
  });
  const client = await pool.connect();
  let transactionOpen = false;
  let rows;
  let transactionReadOnly = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    transactionReadOnly = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only === 'on';
    if (!transactionReadOnly) throw new Error('SEMANTIC_CROSSWALK_READ_ONLY_NOT_CONFIRMED');
    const result = await client.query(`
      WITH candidates AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          packet_key text, source_ref text, source_revision text,
          workspace_revision text, chunk_hash text
        )
      )
      SELECT x.packet_key, x.source_ref, x.source_revision AS expected_source_revision,
             x.workspace_revision AS expected_workspace_revision, x.chunk_hash,
             pcl.id::text AS lineage_id, pcl.canonical_chunk_id,
             pcl.chunk_row_id::text AS chunk_row_id,
             pcl.source_revision AS lineage_source_revision,
             pcl.membership_status, pcl.revision_status,
             ap.packet_id::text AS packet_id, ap.source_ref AS packet_source_ref,
             ap.source_revision AS packet_source_revision,
             ap.workspace_revision_key, ap.embedding_digest,
             ap.embedding::text AS packet_vector,
             cci.content_hash, cci.source_revision AS chunk_source_revision,
             cci.workspace_revision AS chunk_workspace_revision,
             cci.representation_revision, cci.embedding_model,
             cci.embedding_version, cci.embedding_dimension,
             cci.content_embedding_768::text AS chunk_vector
      FROM candidates x
      LEFT JOIN public.atlas_packet_chunk_lineage pcl
        ON pcl.packet_key = x.packet_key AND pcl.source_ref = x.source_ref
      LEFT JOIN public.codebase_chunk_index cci
        ON cci.id = pcl.chunk_row_id AND cci.source_ref = x.source_ref
       AND lower(cci.content_hash) = x.chunk_hash
      LEFT JOIN public.atlas_packets ap ON ap.packet_key = x.packet_key
      ORDER BY x.packet_key, pcl.id
    `, [JSON.stringify(candidates)]);
    rows = result.rows;
  } finally {
    if (transactionOpen) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }

  const grouped = new Map(candidates.map((candidate) => [candidate.packet_key, []]));
  for (const row of rows) grouped.get(row.packet_key)?.push(row);
  const results = candidates.map((candidate) => {
    const matches = grouped.get(candidate.packet_key) ?? [];
    const row = matches.length === 1 ? matches[0] : null;
    const packetDigest = row ? vectorDigest(row.packet_vector) : null;
    const chunkDigest = row ? vectorDigest(row.chunk_vector) : null;
    return {
      packetKey: candidate.packet_key,
      sourceRef: candidate.source_ref,
      joinRows: matches.length,
      lineageStatus: row?.membership_status ?? null,
      lineageRevisionStatus: row?.revision_status ?? null,
      lineageSourceRevisionMatches: Boolean(row && row.lineage_source_revision === candidate.source_revision),
      chunkRowResolved: Boolean(row?.chunk_row_id && row.content_hash),
      packetRowResolved: Boolean(row?.packet_id),
      packetSourceRefMatches: Boolean(row && row.packet_source_ref === candidate.source_ref),
      packetSourceRevisionMatches: Boolean(row && row.packet_source_revision === candidate.source_revision),
      packetWorkspaceRevisionKeyPresent: Boolean(row?.workspace_revision_key),
      chunkSourceRevisionMatches: Boolean(row && row.chunk_source_revision === candidate.source_revision),
      chunkWorkspaceRevisionMatches: Boolean(row && row.chunk_workspace_revision === candidate.workspace_revision),
      packetEmbeddingDigestPresent: Boolean(row?.embedding_digest),
      packetVectorDimension: vectorValues(row?.packet_vector).length,
      packetVectorComputedDigest: packetDigest,
      packetDigestMatchesComputedVector: Boolean(packetDigest && String(row?.embedding_digest ?? '').replace(/^sha256:/i, '').toLowerCase() === packetDigest),
      chunkVectorDimension: vectorValues(row?.chunk_vector).length,
      chunkVectorComputedDigest: chunkDigest,
      packetAndChunkVectorsExact: Boolean(row && equalVectors(row.packet_vector, row.chunk_vector)),
      chunkRepresentationRevision: row?.representation_revision ?? null,
      chunkEmbeddingModel: row?.embedding_model ?? null,
      chunkEmbeddingVersion: row?.embedding_version ?? null,
      chunkEmbeddingDimension: row?.embedding_dimension ?? null,
    };
  });
  const count = (predicate) => results.filter(predicate).length;
  const report = {
    schema: 'atlas.semantic-packet-chunk-crosswalk.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_FROZEN_CANARY_DIAGNOSTIC',
    candidateMap: {
      path: path.relative(ROOT, mapPath).replaceAll('\\', '/'),
      candidateSnapshotRevision: map.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: map.ordinalMapChecksum ?? null,
      identityAuthority: map.identityAuthority === true,
      candidates: candidates.length,
    },
    database: { transactionReadOnly, databaseWrites: false },
    schemaBoundary: {
      packetEmbeddingDigestOwner: 'atlas_packets.embedding_digest',
      packetVectorOwner: 'atlas_packets.embedding',
      chunkVectorOwner: 'codebase_chunk_index.content_embedding_768',
      packetChunkJoinOwner: 'atlas_packet_chunk_lineage',
      chunkEmbeddingDigestColumn: 'absent; no alias from content_hash is made',
    },
    counts: {
      candidates: results.length,
      uniqueLineageJoins: count((row) => row.joinRows === 1),
      resolvedChunkRows: count((row) => row.chunkRowResolved),
      resolvedPacketRows: count((row) => row.packetRowResolved),
      lineageRevisionMatches: count((row) => row.lineageSourceRevisionMatches),
      packetSourceRevisionMatches: count((row) => row.packetSourceRevisionMatches),
      chunkSourceRevisionMatches: count((row) => row.chunkSourceRevisionMatches),
      chunkWorkspaceRevisionMatches: count((row) => row.chunkWorkspaceRevisionMatches),
      packetEmbeddingDigestsPresent: count((row) => row.packetEmbeddingDigestPresent),
      packetDigestsMatchComputedVector: count((row) => row.packetDigestMatchesComputedVector),
      exactPacketChunkVectorMatches: count((row) => row.packetAndChunkVectorsExact),
    },
    candidates: results,
    writes: { postgresWrites: false, qdrantWrites: false, valkeyWrites: false, vectorGeneration: false },
    status: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
    promotionEligible: false,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  report.receiptChecksum = crypto.createHash('sha256').update(serialized).digest('hex');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, counts: report.counts, identityAuthority: report.candidateMap.identityAuthority, reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'), receiptChecksum: report.receiptChecksum }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
