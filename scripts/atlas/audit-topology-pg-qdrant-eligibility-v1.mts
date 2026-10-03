#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

export const CANONICAL_ELIGIBILITY_QUERY_V1 = Object.freeze({
  schema: 'atlas.canonical-eligibility-query.v1',
  authority: 'postgresql',
  representationId: 'semantic_768',
  dimensions: 768,
  requiredLineage: {
    membershipStatus: 'EXACT_SINGLE_MEMBER',
    revisionStatus: 'PROVEN',
  },
  requiredVector: {
    embeddingEligible: true,
    vectorColumn: 'content_embedding_768',
    dimensions: 768,
  },
  requiredSourceBinding: [
    'canonical_source_ref',
    'workspace_revision',
    'source_revision',
    'content_digest',
  ],
  canonicalAuthority: false,
});

type CandidateOrdinalInput = { candidateOrdinal: number };
type CandidateEligibilityDisposition = {
  candidateOrdinal: number;
  packetKey?: string;
  sourceRef?: string;
  sourceRevision?: string;
  workspaceRevision?: string;
  vectorRows?: number;
  eligibleVectorRows?: number;
  exactLineageRows?: number;
  exactWorkspaceBindings?: number;
  status: 'ELIGIBLE' | 'BLOCKED' | 'BLOCKED_INVALID_CHUNK_ROW_REFERENCE' | 'BLOCKED_MISSING_CANONICAL_PACKET_KEY';
  blockers?: string[];
};
type CandidateEligibilityBitmap = {
  schema: 'atlas.candidate-eligibility-bitmap.v1';
  candidateCount: number;
  eligibleOrdinals: number[];
  bitmapBase64: string;
  canonicalAuthority: false;
};
type EligibilityAuditReport = {
  schema: string;
  generatedAt: string;
  runMode: string;
  queryContract: typeof CANONICAL_ELIGIBILITY_QUERY_V1;
  input: {
    candidateMapPath: string;
    candidateMapIntegrity: string;
    candidateSnapshotRevision?: string;
    workspaceRevision?: string;
    ordinalMapChecksum?: string;
    candidateCount?: number;
  };
  postgres: {
    owners?: Record<string, string | null>;
    dispositionCounts: Record<string, number>;
    blockedSamples: CandidateEligibilityDisposition[];
    eligibilityBitmap: CandidateEligibilityBitmap | null;
    eligibleCount: number;
    sqlOracle?: { eligibleCount: number; parity: { equal: boolean; expectedOnlyCount: number; observedOnlyCount: number; expectedOnlySample: number[]; observedOnlySample: number[] } };
  };
  qdrant: {
    collection: string | null;
    pointCount: number;
    observedOrdinals: number[];
    ambiguousPointCount: number;
    identityDispositionCounts: Record<string, number>;
    duplicatePointCount: number;
    duplicatePointOrdinals: Array<{ candidateOrdinal: number; pointCount: number }>;
    parity: {
      equal: boolean;
      expectedCount: number;
      observedCount: number;
      expectedOnlyCount: number;
      observedOnlyCount: number;
      expectedOnlySample: number[];
      observedOnlySample: number[];
    } | null;
  };
  writes: { postgres: false; qdrant: false; vectorGeneration: false; candidateMap: false };
  canonicalAuthority: false;
  status: string;
  blockers: string[];
  candidateMapRejection?: string;
  checksum?: string;
};

export function compileCandidateEligibilityBitmapV1(
  candidates: CandidateOrdinalInput[],
  dispositions: CandidateEligibilityDisposition[],
): CandidateEligibilityBitmap {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('CANDIDATE_ELIGIBILITY_EMPTY_MAP');
  }
  if (dispositions.length !== candidates.length) {
    throw new Error('CANDIDATE_ELIGIBILITY_DISPOSITION_COUNT_MISMATCH');
  }

  const bytes = Buffer.alloc(Math.ceil(candidates.length / 8));
  const eligibleOrdinals = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate.candidateOrdinal !== index) {
      throw new Error(`CANDIDATE_ELIGIBILITY_ORDINAL_ORDER_MISMATCH:${index}`);
    }
    if (dispositions[index].candidateOrdinal !== index) {
      throw new Error(`CANDIDATE_ELIGIBILITY_DISPOSITION_ORDINAL_MISMATCH:${index}`);
    }
    if (dispositions[index].status === 'ELIGIBLE') {
      bytes[Math.floor(index / 8)] |= 1 << (index % 8);
      eligibleOrdinals.push(index);
    }
  }
  return {
    schema: 'atlas.candidate-eligibility-bitmap.v1',
    candidateCount: candidates.length,
    eligibleOrdinals,
    bitmapBase64: bytes.toString('base64'),
    canonicalAuthority: false,
  };
}

export function classifyCandidateEligibilityV1(input: {
  candidateOrdinal: number;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  vectorRows: number;
  eligibleVectorRows: number;
  exactLineageRows: number;
  exactWorkspaceBindings: number;
}): CandidateEligibilityDisposition {
  const blockers: string[] = [];
  if (input.vectorRows !== 1) blockers.push(input.vectorRows === 0 ? 'VECTOR_ROW_MISSING' : 'VECTOR_ROW_AMBIGUOUS');
  if (input.eligibleVectorRows !== 1) blockers.push('SEMANTIC_768_NOT_ELIGIBLE');
  if (input.exactLineageRows !== 1) blockers.push(input.exactLineageRows === 0 ? 'EXACT_LINEAGE_MISSING' : 'EXACT_LINEAGE_AMBIGUOUS');
  if (input.exactWorkspaceBindings !== 1) blockers.push(input.exactWorkspaceBindings === 0 ? 'EXACT_WORKSPACE_SOURCE_BINDING_MISSING' : 'EXACT_WORKSPACE_SOURCE_BINDING_AMBIGUOUS');
  return {
    ...input,
    status: blockers.length === 0 ? 'ELIGIBLE' : 'BLOCKED',
    blockers,
  };
}

export function toPostgresCandidateRecordV1(candidate) {
  return {
    candidate_ordinal: candidate.candidateOrdinal,
    canonical_chunk_id: candidate.canonicalChunkId,
    chunk_row_id: candidate.chunkRowId,
    packet_key: candidate.packetKey,
    source_ref: candidate.sourceRef,
    source_revision: candidate.sourceRevision,
  };
}

export function compareOrdinalSets(expectedOrdinals: number[], observedOrdinals: number[]) {
  const expected = [...new Set(expectedOrdinals)].sort((a, b) => a - b);
  const observed = [...new Set(observedOrdinals)].sort((a, b) => a - b);
  return {
    equal: expected.length === observed.length && expected.every((ordinal, index) => ordinal === observed[index]),
    expectedOnly: expected.filter((ordinal) => !observed.includes(ordinal)),
    observedOnly: observed.filter((ordinal) => !expected.includes(ordinal)),
  };
}

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const chunkRowIdFromEvidence = (candidate) => {
  const ref = candidate.evidenceRefs.find((value) => value.startsWith('codebase_chunk_index:'));
  const rowId = ref?.slice('codebase_chunk_index:'.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowId ?? '') ? rowId : null;
};

async function queryPostgresCandidates(client: pg.PoolClient, candidates, map): Promise<CandidateEligibilityDisposition[]> {
  const dispositions = new Map<number, CandidateEligibilityDisposition>();
  const eligibleInputs = [];
  for (const candidate of candidates) {
    if (!candidate.packetKey) {
      dispositions.set(candidate.candidateOrdinal, { candidateOrdinal: candidate.candidateOrdinal, status: 'BLOCKED_MISSING_CANONICAL_PACKET_KEY', blockers: ['CANONICAL_PACKET_KEY_MISSING'] });
      continue;
    }
    const chunkRowId = chunkRowIdFromEvidence(candidate);
    if (!chunkRowId || !candidate.canonicalId) {
      dispositions.set(candidate.candidateOrdinal, { candidateOrdinal: candidate.candidateOrdinal, status: 'BLOCKED_INVALID_CHUNK_ROW_REFERENCE', blockers: ['CANONICAL_CHUNK_ROW_BINDING_MISSING_OR_INVALID'] });
      continue;
    }
    eligibleInputs.push({
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalChunkId: candidate.canonicalId,
      chunkRowId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
    });
  }

  const batchSize = 500;
  for (let offset = 0; offset < eligibleInputs.length; offset += batchSize) {
    const batch = eligibleInputs.slice(offset, offset + batchSize);
    const result = await client.query(`
      WITH candidates AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          candidate_ordinal integer,
          canonical_chunk_id text,
          chunk_row_id uuid,
          packet_key text,
          source_ref text,
          source_revision text
        )
      )
      SELECT x.candidate_ordinal,
             COALESCE(v.row_count, 0)::int AS vector_rows,
             COALESCE(ev.row_count, 0)::int AS eligible_vector_rows,
             COALESCE(l.row_count, 0)::int AS exact_lineage_rows,
             COALESCE(b.row_count, 0)::int AS exact_workspace_bindings
        FROM candidates x
        LEFT JOIN LATERAL (
          SELECT count(*) AS row_count
            FROM public.codebase_chunk_index c
           WHERE c.id = x.chunk_row_id
             AND c.chunk_id::text = x.canonical_chunk_id
             AND c.source_ref = x.source_ref
        ) v ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS row_count
            FROM public.codebase_chunk_index c
           WHERE c.id = x.chunk_row_id
             AND c.chunk_id::text = x.canonical_chunk_id
             AND c.source_ref = x.source_ref
             AND c.embedding_eligible IS TRUE
             AND c.content_embedding_768 IS NOT NULL
             AND vector_dims(c.content_embedding_768) = 768
        ) ev ON true
        LEFT JOIN LATERAL (
          SELECT count(DISTINCT lineage.id) AS row_count
            FROM public.atlas_packet_chunk_lineage lineage
            JOIN public.codebase_chunk_index c ON c.id = lineage.chunk_row_id
           WHERE lineage.chunk_row_id = x.chunk_row_id
             AND lineage.canonical_chunk_id::text = x.canonical_chunk_id
             AND lineage.packet_key = x.packet_key
             AND lineage.source_ref = x.source_ref
             AND lineage.source_revision = x.source_revision
             AND lineage.membership_status = 'EXACT_SINGLE_MEMBER'
             AND lineage.revision_status = 'PROVEN'
             AND c.source_ref = x.source_ref
        ) l ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS row_count
            FROM public.atlas_workspace_source_bindings binding
           WHERE binding.canonical_source_ref = x.source_ref
             AND binding.workspace_revision = $2
             AND binding.source_revision = x.source_revision
             AND regexp_replace(lower(binding.content_digest), '^sha256:', '') = regexp_replace(lower(x.source_revision), '^sha256:', '')
        ) b ON true
       ORDER BY x.candidate_ordinal
    `, [JSON.stringify(batch.map(toPostgresCandidateRecordV1)), map.workspaceRevision]);
    if (result.rows.length !== batch.length) throw new Error(`POSTGRES_ELIGIBILITY_BATCH_ROW_COUNT_MISMATCH:${offset}:${batch.length}:${result.rows.length}`);

    for (let index = 0; index < batch.length; index += 1) {
      const candidate = batch[index];
      const row = result.rows[index];
      dispositions.set(candidate.candidateOrdinal, classifyCandidateEligibilityV1({
        ...candidate,
        workspaceRevision: map.workspaceRevision,
        vectorRows: Number(row.vector_rows),
        eligibleVectorRows: Number(row.eligible_vector_rows),
        exactLineageRows: Number(row.exact_lineage_rows),
        exactWorkspaceBindings: Number(row.exact_workspace_bindings),
      }));
    }
  }

  return candidates.map((candidate) => {
    const disposition = dispositions.get(candidate.candidateOrdinal);
    if (!disposition) throw new Error(`POSTGRES_ELIGIBILITY_RESULT_MISSING:${candidate.candidateOrdinal}`);
    return disposition;
  });
}

async function queryPostgresEligibilityOracle(client: pg.PoolClient, candidates, map): Promise<number[]> {
  const inputs = [];
  for (const candidate of candidates) {
    const chunkRowId = chunkRowIdFromEvidence(candidate);
    if (!candidate.packetKey || !candidate.canonicalId || !chunkRowId) continue;
    inputs.push({
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalChunkId: candidate.canonicalId,
      chunkRowId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
    });
  }
  const eligibleOrdinals = [];
  const batchSize = 500;
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize);
    const result = await client.query(`
      WITH candidates AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          candidate_ordinal integer,
          canonical_chunk_id text,
          chunk_row_id uuid,
          packet_key text,
          source_ref text,
          source_revision text
        )
      )
      SELECT x.candidate_ordinal
        FROM candidates x
        JOIN public.codebase_chunk_index c
          ON c.id = x.chunk_row_id
         AND c.chunk_id::text = x.canonical_chunk_id
         AND c.source_ref = x.source_ref
         AND c.embedding_eligible IS TRUE
         AND c.content_embedding_768 IS NOT NULL
         AND vector_dims(c.content_embedding_768) = 768
        JOIN public.atlas_packet_chunk_lineage lineage
          ON lineage.chunk_row_id = c.id
         AND lineage.canonical_chunk_id::text = x.canonical_chunk_id
         AND lineage.packet_key = x.packet_key
         AND lineage.source_ref = x.source_ref
         AND lineage.source_revision = x.source_revision
         AND lineage.membership_status = 'EXACT_SINGLE_MEMBER'
         AND lineage.revision_status = 'PROVEN'
        JOIN public.atlas_workspace_source_bindings binding
          ON binding.canonical_source_ref = x.source_ref
         AND binding.workspace_revision = $2
         AND binding.source_revision = x.source_revision
         AND regexp_replace(lower(binding.content_digest), '^sha256:', '')
             = regexp_replace(lower(x.source_revision), '^sha256:', '')
       GROUP BY x.candidate_ordinal
      HAVING count(*) = 1
       ORDER BY x.candidate_ordinal
    `, [JSON.stringify(batch.map(toPostgresCandidateRecordV1)), map.workspaceRevision]);
    eligibleOrdinals.push(...result.rows.map((row) => Number(row.candidate_ordinal)));
  }
  return eligibleOrdinals;
}

function projectionIdentityKey(candidate, workspaceRevision) {
  return [candidate.canonicalId, candidate.packetKey, candidate.sourceRef, candidate.sourceRevision, workspaceRevision].join('\u0000');
}

export function classifyQdrantCandidatePointV1(point, candidateOrdinalsByIdentity, workspaceRevision) {
  const payload = point?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { disposition: 'PAYLOAD_NOT_OBJECT', ordinals: [] };
  }
  const identityFields = [
    ['canonicalId', payload.canonical_id ?? payload.canonicalId],
    ['packetKey', payload.packet_key ?? payload.packetKey],
    ['sourceRef', payload.source_ref ?? payload.sourceRef],
    ['sourceRevision', payload.source_revision ?? payload.sourceRevision],
    ['workspaceRevision', payload.workspace_revision ?? payload.workspaceRevision],
  ];
  const missingField = identityFields.find(([, value]) => typeof value !== 'string' || !value.trim());
  if (missingField) return { disposition: `MISSING_${missingField[0].replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`, ordinals: [] };
  const observedWorkspaceRevision = payload.workspace_revision ?? payload.workspaceRevision;
  if (observedWorkspaceRevision !== workspaceRevision) {
    return { disposition: 'WORKSPACE_REVISION_MISMATCH', ordinals: [] };
  }
  const key = projectionIdentityKey({
    canonicalId: payload.canonical_id ?? payload.canonicalId,
    packetKey: payload.packet_key ?? payload.packetKey,
    sourceRef: payload.source_ref ?? payload.sourceRef,
    sourceRevision: payload.source_revision ?? payload.sourceRevision,
  }, observedWorkspaceRevision);
  const ordinals = candidateOrdinalsByIdentity.get(key) ?? [];
  if (ordinals.length === 0) return { disposition: 'EXACT_IDENTITY_NOT_IN_CANDIDATE_MAP', ordinals };
  if (ordinals.length > 1) return { disposition: 'MULTIPLE_CANDIDATE_ORDINALS', ordinals };
  return { disposition: 'EXACT_IDENTITY_MATCH', ordinals };
}

export function resolveQdrantCandidateOrdinalsV1(point, candidateOrdinalsByIdentity, workspaceRevision) {
  return classifyQdrantCandidatePointV1(point, candidateOrdinalsByIdentity, workspaceRevision).ordinals;
}

async function queryQdrant(packetKeys, env, onPoint) {
  const baseUrl = String(env.QDRANT_URL ?? `http://${env.QDRANT_HOST ?? '127.0.0.1'}:${env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
  const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');
  const uniquePacketKeys = [...new Set(packetKeys.filter((key) => typeof key === 'string' && key.length > 0))];
  const packetKeyBatchSize = 128;
  const pageSize = 512;
  const maxPagesPerBatch = 32;
  const maxTotalPoints = 1_000_000;
  let pointCount = 0;
  for (let batchOffset = 0; batchOffset < uniquePacketKeys.length; batchOffset += packetKeyBatchSize) {
    const packetKeyBatch = uniquePacketKeys.slice(batchOffset, batchOffset + packetKeyBatchSize);
    let offset;
    for (let page = 0; page < maxPagesPerBatch; page += 1) {
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: { must: [{ key: 'packet_key', match: { any: packetKeyBatch } }] },
          limit: pageSize,
          ...(offset === undefined ? {} : { offset }),
          with_payload: ['canonical_id', 'packet_key', 'source_ref', 'source_revision', 'workspace_revision'],
          with_vector: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
      const body = await response.json();
      const result = body.result;
      const pagePoints = Array.isArray(result) ? result : (Array.isArray(result?.points) ? result.points : []);
      pointCount += pagePoints.length;
      if (pointCount > maxTotalPoints) throw new Error('QDRANT_TOTAL_POINT_LIMIT_REACHED');
      for (const point of pagePoints) onPoint(point);
      offset = result?.next_page_offset;
      if (offset === undefined || offset === null || pagePoints.length === 0) break;
      if (page === maxPagesPerBatch - 1) throw new Error('QDRANT_SCROLL_PAGE_LIMIT_REACHED');
    }
  }
  return { collection, pointCount };
}

async function main() {
  const env = loadRepoEnv(process.env);
  const mapPath = path.resolve(env.ATLAS_CANDIDATE_MAP ?? path.join(REPO_ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
  const outputPath = path.resolve(env.ATLAS_TOPOLOGY_ELIGIBILITY_REPORT ?? path.join(REPO_ROOT, '.tmp/atlas/topology-pg-qdrant-eligibility-v1.json'));
  const report: EligibilityAuditReport = {
    schema: 'atlas.topology-pg-qdrant-eligibility-audit.v1',
    generatedAt: new Date().toISOString(),
    runMode: 'READ_ONLY',
    queryContract: CANONICAL_ELIGIBILITY_QUERY_V1,
    input: { candidateMapPath: path.relative(REPO_ROOT, mapPath), candidateMapIntegrity: 'NOT_CHECKED' },
    postgres: { dispositionCounts: {}, blockedSamples: [], eligibilityBitmap: null, eligibleCount: 0 },
    qdrant: { collection: null, pointCount: 0, observedOrdinals: [], ambiguousPointCount: 0, identityDispositionCounts: {}, duplicatePointCount: 0, duplicatePointOrdinals: [], parity: null },
    writes: { postgres: false, qdrant: false, vectorGeneration: false, candidateMap: false },
    canonicalAuthority: false,
    status: 'BLOCKED',
    blockers: [],
  };

  const rawMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const map = candidateOrdinalMapV1Schema.parse(rawMap);
  report.input = {
    candidateMapPath: path.relative(REPO_ROOT, mapPath),
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    workspaceRevision: map.workspaceRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    candidateCount: map.rowCount,
    candidateMapIntegrity: 'VALID',
  };
  try {
    assertCandidateOrdinalMapIntegrityV1(map);
  } catch (error) {
    report.input.candidateMapIntegrity = 'INVALID';
    report.blockers.push('CANDIDATE_ORDINAL_MAP_CHECKSUM_INVALID');
    report.candidateMapRejection = error instanceof Error ? error.message : String(error);
    report.status = 'BLOCKED_CANDIDATE_MAP_INTEGRITY';
    report.checksum = sha256(JSON.stringify(report));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: report.status, blockers: report.blockers, reportPath: outputPath }, null, 2));
    process.exitCode = 2;
    return;
  }

  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, application_name: 'atlas-topology-pg-qdrant-eligibility-audit' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const requiredRelations = await client.query(`
        SELECT to_regclass('public.codebase_chunk_index')::text AS vector_owner,
               to_regclass('public.atlas_packet_chunk_lineage')::text AS lineage_owner,
               to_regclass('public.atlas_workspace_source_bindings')::text AS source_binding_owner
      `);
      const owners = requiredRelations.rows[0];
      if (Object.values(owners).some((value) => value === null)) throw new Error('POSTGRES_CANONICAL_ELIGIBILITY_OWNER_MISSING');
      report.postgres.owners = owners;
      await client.query("SET LOCAL statement_timeout = '120s'");
      const dispositions = await queryPostgresCandidates(client, map.candidates, map);
      report.postgres.dispositionCounts = dispositions.reduce((counts, disposition) => {
        counts[disposition.status] = (counts[disposition.status] ?? 0) + 1;
        return counts;
      }, {} as Record<string, number>);
      report.postgres.blockedSamples = dispositions.filter((disposition) => disposition.status !== 'ELIGIBLE').slice(0, 100);
      report.postgres.eligibilityBitmap = compileCandidateEligibilityBitmapV1(map.candidates, dispositions);
      report.postgres.eligibleCount = report.postgres.eligibilityBitmap.eligibleOrdinals.length;
      const oracleOrdinals = await queryPostgresEligibilityOracle(client, map.candidates, map);
      const oracleParity = compareOrdinalSets(report.postgres.eligibilityBitmap.eligibleOrdinals, oracleOrdinals);
      report.postgres.sqlOracle = {
        eligibleCount: oracleOrdinals.length,
        parity: {
          equal: oracleParity.equal,
          expectedOnlyCount: oracleParity.expectedOnly.length,
          observedOnlyCount: oracleParity.observedOnly.length,
          expectedOnlySample: oracleParity.expectedOnly.slice(0, 100),
          observedOnlySample: oracleParity.observedOnly.slice(0, 100),
        },
      };
      if (!report.postgres.sqlOracle.parity.equal) report.blockers.push('POSTGRES_BITMAP_DIFFERS_FROM_SQL_ORACLE');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const candidateOrdinalsByIdentity = new Map<string, number[]>();
  for (const candidate of map.candidates) {
    if (!candidate.packetKey || !candidate.canonicalId || !candidate.sourceRevision) continue;
    const key = projectionIdentityKey(candidate, map.workspaceRevision);
    candidateOrdinalsByIdentity.set(key, [...(candidateOrdinalsByIdentity.get(key) ?? []), candidate.candidateOrdinal]);
  }
  const qdrantMatchCounts = new Map<number, number>();
  const { collection, pointCount } = await queryQdrant(map.candidates.map((candidate) => candidate.packetKey), env, (point) => {
    const { disposition, ordinals } = classifyQdrantCandidatePointV1(point, candidateOrdinalsByIdentity, map.workspaceRevision);
    report.qdrant.identityDispositionCounts[disposition] = (report.qdrant.identityDispositionCounts[disposition] ?? 0) + 1;
    if (ordinals.length > 1) {
      report.qdrant.ambiguousPointCount += 1;
      return;
    }
    if (ordinals.length === 1) qdrantMatchCounts.set(ordinals[0], (qdrantMatchCounts.get(ordinals[0]) ?? 0) + 1);
  });
  report.qdrant.collection = collection;
  report.qdrant.pointCount = pointCount;
  report.qdrant.observedOrdinals = [...qdrantMatchCounts.keys()].sort((a, b) => a - b);
  const duplicateOrdinals = [...qdrantMatchCounts.entries()].filter(([, count]) => count > 1);
  report.qdrant.duplicatePointCount = duplicateOrdinals.length;
  report.qdrant.duplicatePointOrdinals = duplicateOrdinals.slice(0, 100).map(([candidateOrdinal, count]) => ({ candidateOrdinal, pointCount: count }));
  const exactParity = compareOrdinalSets(report.postgres.eligibilityBitmap.eligibleOrdinals, report.qdrant.observedOrdinals);
  report.qdrant.parity = {
    equal: exactParity.equal,
    expectedCount: report.postgres.eligibilityBitmap.eligibleOrdinals.length,
    observedCount: report.qdrant.observedOrdinals.length,
    expectedOnlyCount: exactParity.expectedOnly.length,
    observedOnlyCount: exactParity.observedOnly.length,
    expectedOnlySample: exactParity.expectedOnly.slice(0, 100),
    observedOnlySample: exactParity.observedOnly.slice(0, 100),
  };
  if (!report.qdrant.parity.equal) report.blockers.push('QDRANT_ORDINAL_SET_DIFFERS_FROM_POSTGRES_BITMAP');
  if (report.qdrant.ambiguousPointCount) report.blockers.push('QDRANT_POINTS_MATCH_MULTIPLE_CANDIDATE_ORDINALS');
  if (report.qdrant.duplicatePointCount) report.blockers.push('MULTIPLE_QDRANT_POINTS_MAP_TO_CANDIDATE_ORDINAL');
  report.status = report.blockers.length === 0 ? 'PG_QDRANT_ELIGIBILITY_PARITY_PROVEN_READ_ONLY' : 'BLOCKED_PG_QDRANT_ELIGIBILITY_PARITY';
  report.checksum = sha256(JSON.stringify(report));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, eligibleCount: report.postgres.eligibleCount, qdrantPoints: report.qdrant.pointCount, qdrantOrdinals: report.qdrant.observedOrdinals.length, duplicateOrdinals: report.qdrant.duplicatePointOrdinals.length, blockers: report.blockers, reportPath: outputPath }, null, 2));
  if (report.status === 'BLOCKED_PG_QDRANT_ELIGIBILITY_PARITY') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: 'BLOCKED', error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
