#!/usr/bin/env tsx

/**
 * LATENT-BRIDGE-01 / LATENT-FABRIC-01 read-only proof.
 *
 * Resolves each CandidateOrdinal through the already-frozen candidate map,
 * then proves one exact codebase_chunk_index row using source_ref + the chunk
 * content hash carried in candidate evidenceRefs. Only that exact row may
 * contribute latent_256. No packetKey/Qdrant/canonicalId UUID substitution.
 *
 * Writes only the JSON receipt file. No database/vector/cache mutation.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

import {
  buildCandidateLatent256HydrationReceiptV1,
  type CandidateLatent256HydrationObservationV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-latent256-hydration-receipt-v1.ts';
import { candidateOrdinalMapV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });

function arg(name: string, fallback: string | null = null): string | null {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const mapPath = path.resolve(
  arg('candidate-map', path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'))!,
);
const outputPath = path.resolve(
  arg('out', path.join(ROOT, 'docs/reports/candidate-latent256-hydration-v1.json'))!,
);
const representationRevision = String(arg('representation-revision', '') ?? '').trim();
const checkpointRevision = String(arg('checkpoint-revision', '') ?? '').trim();
const producerRevision = String(arg('producer-revision', 'candidate-latent256-hydration-proof:v1') ?? '').trim();

if (!representationRevision) throw new Error('LATENT256_REPRESENTATION_REVISION_REQUIRED');
if (!checkpointRevision) throw new Error('LATENT256_CHECKPOINT_REVISION_REQUIRED');
if (!producerRevision) throw new Error('LATENT256_PRODUCER_REVISION_REQUIRED');

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
  max: 2,
  application_name: 'atlas-candidate-latent256-hydration-proof',
});

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function chunkHash(candidate: { evidenceRefs?: readonly string[] }): string | null {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').pop())?.toLowerCase() ?? null : null;
}

function parseHalfvec(value: string | null): number[] | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  return trimmed.slice(1, -1).split(',').map(Number);
}

type ChunkRow = {
  id: string;
  latent_256: string | null;
  latent_256_checkpoint_revision: string | null;
};

async function observationForCandidate(candidate: zCandidate): Promise<CandidateLatent256HydrationObservationV1> {
  const sourceRef = clean(candidate.sourceRef);
  const hash = chunkHash(candidate);
  if (!sourceRef || !hash) {
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      codebaseChunkId: null,
      exactIdentityMapping: false,
      observedCheckpointRevision: null,
      vector: null,
    };
  }

  const result = await pool.query<ChunkRow>(`
    SELECT id::text AS id,
           latent_256::text AS latent_256,
           NULLIF(btrim(latent_256_checkpoint_revision::text), '') AS latent_256_checkpoint_revision
    FROM public.codebase_chunk_index
    WHERE source_ref = $1
      AND lower(content_hash) = lower($2)
    ORDER BY id
  `, [sourceRef, hash]);

  if (result.rows.length !== 1) {
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      codebaseChunkId: null,
      exactIdentityMapping: false,
      observedCheckpointRevision: null,
      vector: null,
    };
  }

  const row = result.rows[0]!;
  return {
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    codebaseChunkId: row.id,
    exactIdentityMapping: true,
    observedCheckpointRevision: clean(row.latent_256_checkpoint_revision),
    vector: parseHalfvec(row.latent_256),
  };
}

type zCandidate = ReturnType<typeof candidateOrdinalMapV1Schema.parse>['candidates'][number];

async function main(): Promise<void> {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(
    JSON.parse(await fs.readFile(mapPath, 'utf8')),
  );

  const observations: CandidateLatent256HydrationObservationV1[] = [];
  for (const candidate of ordinalMap.candidates) {
    observations.push(await observationForCandidate(candidate));
  }

  const receipt = buildCandidateLatent256HydrationReceiptV1({
    ordinalMap,
    representationRevision,
    checkpointRevision,
    observations,
    producerRevision,
  });

  const status = receipt.availableCount === receipt.rowCount
    ? 'LATENT256_CANDIDATE_HYDRATION_PROVEN'
    : 'LATENT256_CANDIDATE_HYDRATION_PARTIAL';

  const report = {
    ...receipt,
    mode: 'READ_ONLY_EXACT_CHUNK_HYDRATION',
    status,
    candidateMapPath: path.relative(ROOT, mapPath),
    outputPath: path.relative(ROOT, outputPath),
    nextGate: status === 'LATENT256_CANDIDATE_HYDRATION_PROVEN'
      ? 'LATENT_FABRIC_01_COLUMNAR_GPU_READBACK'
      : 'LATENT256_IDENTITY_OR_REVISION_RECONCILIATION',
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status,
    rowCount: receipt.rowCount,
    availableCount: receipt.availableCount,
    missingCount: receipt.missingCount,
    identityUnresolvedCount: receipt.identityUnresolvedCount,
    revisionMismatchCount: receipt.revisionMismatchCount,
    invalidShapeCount: receipt.invalidShapeCount,
    mappingChecksum: receipt.mappingChecksum,
    vectorsChecksum: receipt.vectorsChecksum,
    receiptChecksum: receipt.receiptChecksum,
    writesPerformed: false,
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}).finally(() => pool.end().catch(() => {}));
