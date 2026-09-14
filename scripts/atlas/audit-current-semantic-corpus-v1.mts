#!/usr/bin/env tsx
/**
 * CURRENT-SEMANTIC-CORPUS-01
 *
 * Read-only semantic_768 representation admission over the current
 * CandidateOrdinalMap. This gate is intentionally independent from QRELS:
 * it proves which existing content_embedding rows can be bound to current
 * canonical chunk/source/workspace identity and sealed into a deterministic
 * representation revision. Human relevance judgments remain a later quality
 * promotion gate.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';
import {
  buildSemanticCorpusManifestV1,
  semanticCorpusMemberV1Schema,
  type SemanticCorpusMemberV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/embedding/semantic-corpus-manifest-v1.ts';
import { bindSemanticCorpusToOrdinalMapV1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/semantic-bound-ordinal-map-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const limit = Math.max(1, Math.min(4096, Number(arg('limit', '128'))));
const ordinalMapPath = path.resolve(ROOT, arg('ordinal-map', '.tmp/atlas/current-chunk-ordinal-map-v2.json'));
const reportPath = path.resolve(ROOT, arg('report', 'docs/reports/current-semantic-corpus-v1.json'));
const membersPath = path.resolve(ROOT, arg('members', '.tmp/atlas/current-semantic-corpus-members-v1.json'));
const boundMapPath = path.resolve(ROOT, arg('bound-map', '.tmp/atlas/current-chunk-ordinal-map-semantic-v1.json'));

const connectionString = process.env.DATABASE_URL
  || `postgresql://${process.env.DB_USER || process.env.PGUSER || 'legal_admin'}:${encodeURIComponent(process.env.DB_PASSWORD || process.env.PGPASSWORD || '')}@${process.env.DB_HOST || process.env.PGHOST || '127.0.0.1'}:${process.env.DB_PORT || process.env.PGPORT || '5434'}/${process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db'}`;
const pool = new pg.Pool({ connectionString, max: 1, statement_timeout: 120000 });

const sha256Hex = (value: Buffer | string): string => crypto.createHash('sha256').update(value).digest('hex');
const CONTENT_REVISION = /^sha256:[a-f0-9]{64}$/i;
const HEX16 = /^[a-f0-9]{16}$/i;
const HEX64 = /^[a-f0-9]{64}$/i;

function parseVector(text: unknown): number[] {
  if (typeof text !== 'string') throw new Error('SEMANTIC_VECTOR_TEXT_REQUIRED');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length !== 768) {
    throw new Error(`SEMANTIC_VECTOR_DIMENSION_MISMATCH:${Array.isArray(parsed) ? parsed.length : 'not-array'}`);
  }
  return parsed.map((value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`SEMANTIC_VECTOR_NON_FINITE:${index}`);
    return number;
  });
}

function vectorChecksum(values: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return sha256Hex(bytes);
}

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function inputDigest(contentHash: unknown, content: unknown): { algorithm: 'sha256' | 'sha256_16'; value: string } {
  if (typeof contentHash !== 'string') throw new Error('SEMANTIC_INPUT_DIGEST_REQUIRED');
  if (typeof content !== 'string') throw new Error('SEMANTIC_INPUT_CONTENT_REQUIRED');
  const full = sha256Hex(content);
  if (HEX64.test(contentHash)) {
    if (contentHash.toLowerCase() !== full) throw new Error('SEMANTIC_INPUT_SHA256_MISMATCH');
    return { algorithm: 'sha256', value: contentHash.toLowerCase() };
  }
  if (HEX16.test(contentHash)) {
    if (contentHash.toLowerCase() !== full.slice(0, 16)) throw new Error('SEMANTIC_INPUT_SHA256_16_MISMATCH');
    return { algorithm: 'sha256_16', value: contentHash.toLowerCase() };
  }
  throw new Error(`SEMANTIC_INPUT_DIGEST_FORMAT_UNPROVEN:${contentHash.length}`);
}

type LiveRow = {
  candidate_ordinal: number;
  canonical_id: string;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  chunk_row_id: string;
  chunk_id: string | null;
  relative_path: string;
  content_hash: string | null;
  content: string | null;
  embedding_model: string | null;
  embedding_version: string | null;
  vector_text: string | null;
  dims: number | null;
};

async function main(): Promise<void> {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(JSON.parse(await fs.readFile(ordinalMapPath, 'utf8'))) as CandidateOrdinalMapV1;
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (!CONTENT_REVISION.test(ordinalMap.workspaceRevision)) throw new Error('SEMANTIC_CORPUS_WORKSPACE_REVISION_UNQUALIFIED');

  const requested = ordinalMap.candidates.slice(0, limit).map((candidate) => ({
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
  }));

  const client = await pool.connect();
  let rows: LiveRow[] = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await client.query<LiveRow>(`
      WITH requested AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          "candidateOrdinal" integer,
          "canonicalId" text,
          "packetKey" text,
          "sourceRef" text,
          "sourceRevision" text
        )
      )
      SELECT
        r."candidateOrdinal" AS candidate_ordinal,
        r."canonicalId" AS canonical_id,
        l.packet_key::text AS packet_key,
        l.source_ref::text AS source_ref,
        l.source_revision::text AS source_revision,
        b.workspace_revision::text AS workspace_revision,
        c.id::text AS chunk_row_id,
        c.chunk_id::text AS chunk_id,
        c.relative_path::text AS relative_path,
        c.content_hash::text AS content_hash,
        c.content::text AS content,
        c.embedding_model::text AS embedding_model,
        (to_jsonb(c)->>'embedding_version')::text AS embedding_version,
        c.content_embedding::text AS vector_text,
        vector_dims(c.content_embedding::vector)::int AS dims
      FROM requested r
      JOIN public.atlas_packet_chunk_lineage l
        ON l.canonical_chunk_id::text = r."canonicalId"
       AND l.packet_key::text = r."packetKey"
       AND l.source_ref::text = r."sourceRef"
       AND l.source_revision::text = r."sourceRevision"
       AND l.revision_status = 'PROVEN'
      JOIN public.atlas_workspace_source_bindings b
        ON b.canonical_source_ref::text = l.source_ref::text
       AND b.source_revision::text = l.source_revision::text
       AND b.workspace_revision::text = $2
      JOIN public.codebase_chunk_index c
        ON c.id = l.chunk_row_id
       AND c.relative_path::text = l.source_ref::text
      WHERE c.content_embedding IS NOT NULL
      ORDER BY r."candidateOrdinal", c.id
    `, [JSON.stringify(requested), ordinalMap.workspaceRevision]);
    rows = result.rows;
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }

  const members: SemanticCorpusMemberV1[] = [];
  const blockers: Array<{ candidateOrdinal: number | null; reason: string }> = [];
  const seenOrdinals = new Set<number>();

  for (const row of rows) {
    try {
      if (seenOrdinals.has(row.candidate_ordinal)) throw new Error('SEMANTIC_CORPUS_AMBIGUOUS_ORDINAL');
      if (row.workspace_revision !== ordinalMap.workspaceRevision) throw new Error('SEMANTIC_CORPUS_WORKSPACE_MISMATCH');
      if (!CONTENT_REVISION.test(row.source_revision)) throw new Error('SEMANTIC_CORPUS_SOURCE_REVISION_UNQUALIFIED');
      if (row.chunk_id !== row.canonical_id) throw new Error('SEMANTIC_CORPUS_CHUNK_ID_MISMATCH');
      const candidate = ordinalMap.candidates[row.candidate_ordinal];
      if (!candidate || candidate.canonicalId !== row.canonical_id) throw new Error('SEMANTIC_CORPUS_ORDINAL_IDENTITY_MISMATCH');
      const vector = parseVector(row.vector_text);
      if (row.dims !== 768) throw new Error(`SEMANTIC_CORPUS_VECTOR_DIMS_MISMATCH:${row.dims}`);
      const norm = vectorNorm(vector);
      if (!Number.isFinite(norm) || norm <= 0) throw new Error('SEMANTIC_CORPUS_VECTOR_NORM_INVALID');
      if (Math.abs(norm - 1) > 0.02) throw new Error(`SEMANTIC_CORPUS_VECTOR_NOT_L2_NORMALIZED:${norm}`);
      const digest = inputDigest(row.content_hash, row.content);

      members.push(semanticCorpusMemberV1Schema.parse({
        schema: 'atlas.semantic-corpus-member.v1',
        candidateOrdinal: row.candidate_ordinal,
        canonicalId: row.canonical_id,
        packetKey: row.packet_key,
        sourceRef: row.source_ref,
        sourceRevision: row.source_revision,
        chunkRowId: row.chunk_row_id,
        inputDigestAlgorithm: digest.algorithm,
        inputDigest: digest.value,
        vectorChecksum: vectorChecksum(vector),
        observedEmbeddingModel: row.embedding_model,
        observedEmbeddingVersion: row.embedding_version,
        evidenceRefs: [
          `postgres:atlas_packet_chunk_lineage:${row.chunk_row_id}:${row.canonical_id}`,
          `postgres:atlas_workspace_source_bindings:${row.source_ref}:${row.source_revision}:${row.workspace_revision}`,
          `postgres:codebase_chunk_index:${row.chunk_row_id}:content_embedding`,
        ],
      }));
      seenOrdinals.add(row.candidate_ordinal);
    } catch (error) {
      blockers.push({
        candidateOrdinal: Number.isInteger(row.candidate_ordinal) ? row.candidate_ordinal : null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missingRequested = requested
    .filter((candidate) => !seenOrdinals.has(candidate.candidateOrdinal))
    .map((candidate) => candidate.candidateOrdinal);

  if (members.length === 0) {
    const report = {
      schema: 'atlas.current-semantic-corpus-audit.v1',
      status: 'CURRENT_SEMANTIC_CORPUS_BLOCKED_NO_ADMITTED_MEMBERS',
      generatedAt: new Date().toISOString(),
      workspaceRevision: ordinalMap.workspaceRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      requestedCandidateCount: requested.length,
      joinedRowCount: rows.length,
      admittedMemberCount: 0,
      missingRequestedOrdinals: missingRequested,
      blockers,
      qualityJudgmentsRequired: false,
      writesPerformed: false,
      canonicalAuthority: false,
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  const manifest = buildSemanticCorpusManifestV1({
    ordinalMap,
    members,
    modelProvenanceStatus: 'UNRESOLVED',
  });
  const boundMap = bindSemanticCorpusToOrdinalMapV1({
    ordinalMap,
    members,
    manifest,
    producerRevision: 'current-semantic-corpus:v1',
  });

  const report = {
    schema: 'atlas.current-semantic-corpus-audit.v1',
    status: blockers.length === 0
      ? (manifest.coverageScope === 'FULL_ORDINAL_MAP'
        ? 'CURRENT_SEMANTIC_CORPUS_FULL_SHADOW_READY'
        : 'CURRENT_SEMANTIC_CORPUS_BOUNDED_SHADOW_READY')
      : 'CURRENT_SEMANTIC_CORPUS_PARTIAL_WITH_BLOCKERS',
    generatedAt: new Date().toISOString(),
    workspaceRevision: ordinalMap.workspaceRevision,
    sourceOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    boundOrdinalMapChecksum: boundMap.ordinalMapChecksum,
    requestedCandidateCount: requested.length,
    joinedRowCount: rows.length,
    admittedMemberCount: members.length,
    missingRequestedOrdinals: missingRequested,
    blockers,
    manifest,
    modelProvenance: {
      status: manifest.modelProvenanceStatus,
      note: 'Observed embedding_model/embedding_version values are diagnostics only until an EmbeddingModelManifestV1 instance resolves model/tokenizer checksums.',
    },
    qualityGate: {
      judgmentsRequiredForThisGate: false,
      promotionEligible: false,
      evaluationCorpusManifestRemainsSeparate: true,
    },
    writesPerformed: false,
    canonicalAuthority: false,
    outputs: {
      members: path.relative(ROOT, membersPath).replaceAll('\\', '/'),
      boundOrdinalMap: path.relative(ROOT, boundMapPath).replaceAll('\\', '/'),
    },
    nextGate: blockers.length === 0
      ? 'ACE_LIVE_QUERY_BUNDLE_SHADOW'
      : 'SEMANTIC_CORPUS_PROVENANCE_RECONCILIATION',
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(membersPath), { recursive: true });
  await fs.mkdir(path.dirname(boundMapPath), { recursive: true });
  await fs.writeFile(membersPath, `${JSON.stringify(members, null, 2)}\n`, 'utf8');
  await fs.writeFile(boundMapPath, `${JSON.stringify(boundMap, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    workspaceRevision: report.workspaceRevision,
    admittedMemberCount: report.admittedMemberCount,
    coverageScope: manifest.coverageScope,
    representationRevision: manifest.representationRevision,
    sourceOrdinalMapChecksum: report.sourceOrdinalMapChecksum,
    boundOrdinalMapChecksum: report.boundOrdinalMapChecksum,
    modelProvenanceStatus: manifest.modelProvenanceStatus,
    qualityJudgmentsRequired: false,
    reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'),
    writesPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}).finally(() => pool.end().catch(() => {}));
