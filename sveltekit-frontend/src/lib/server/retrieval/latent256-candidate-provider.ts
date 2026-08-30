/**
 * Latent256CandidateProviderV1 — candidate-side hydration for the LATENT256_SEMANTIC_DEDUP
 * post-process step in post-process-reranker.ts.
 *
 * Boundary: this file owns storage access and validation. postProcessCandidates() stays a pure
 * function that only ever sees an already-validated ReadonlyMap<string, readonly number[]> --
 * it never learns whether that map came from Postgres, Qdrant, mmap, or a test fixture.
 *
 * What this is NOT:
 *   - Not a query-time encoder. It only hydrates ALREADY-MATERIALIZED latent_256 vectors for
 *     candidate identities that a prior retrieval pass already produced (e.g. the top-N from
 *     the primary semantic_768 search). There is no query-latent-vector step here and none is
 *     needed for candidate-side diversity pruning.
 *   - Not authoritative. Every hydrated vector is non-canonical
 *     (models/nested-semantic-autoencoder/README.md: canonicalAuthority=false,
 *     queryEncoder=false, activeRetrievalLane=false). A malformed or revision-mismatched row is
 *     dropped from the result, never substituted or repaired -- the caller (postProcessCandidates)
 *     already treats "missing" as fail-open (candidate survives, per its own contract).
 *
 * Identity scope: as of 2026-08-29, latent_256 exists only for codebase_chunk_index rows, and
 * candidateIds here are that table's `id` (uuid, stringified) -- the same identity used as the
 * Qdrant point id in codebase_chunks_latent256 (see provision_qdrant_latent256.py). If latent_256
 * is ever backfilled for a different table/candidate family, this provider's query needs
 * revisiting -- it is not a generic packetKey resolver.
 */

import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, pgRows } from '$lib/server/db/client';

export const LATENT_256_DIM = 256;

export interface Latent256HydrateInput {
  /** codebase_chunk_index.id values, deliberately distinct from Atlas packetKey. */
  candidateIds: readonly string[];
  /** Explicit caller-supplied snapshot identity. */
  candidateSnapshotRevision: string;
  /** Explicit derived-representation identity. */
  representationRevision: string;
  /** The ONLY revision actually checked against live data: rows whose
   * latent_256_checkpoint_revision does not equal this value are excluded from `vectors` and
   * counted in `revisionMismatch`, never silently accepted. */
  checkpointRevision: string;
}

export interface Latent256HydrateResult {
  vectors: ReadonlyMap<string, readonly number[]>;
  outcomes: readonly Latent256HydrationOutcome[];
  requested: number;
  found: number;
  missing: number;
  revisionMismatch: number;
  identityUnresolved: number;
  /** Rows present with the correct checkpoint revision but rejected by shape validation
   * (wrong dimension, non-finite values). Distinct from `missing` (no row at all) and
   * `revisionMismatch` (row exists, wrong checkpoint) so a caller can tell the three failure
   * modes apart in an audit trail. */
  invalidShape: number;
  vectorsChecksum: string;
  receiptChecksum: string;
}

export type Latent256HydrationStatus =
  | 'AVAILABLE'
  | 'MISSING'
  | 'REVISION_MISMATCH'
  | 'INVALID_SHAPE'
  | 'IDENTITY_UNRESOLVED';

export interface Latent256HydrationOutcome {
  candidateOrdinal: number;
  canonicalId: string | null;
  codebaseChunkId: string | null;
  status: Latent256HydrationStatus;
}

export interface Latent256CandidateProviderV1 {
  hydrate(input: Latent256HydrateInput): Promise<Latent256HydrateResult>;
}

function isValidLatent256(vec: number[]): boolean {
  if (vec.length !== LATENT_256_DIM) return false;
  for (const v of vec) {
    if (!Number.isFinite(v)) return false;
  }
  return true;
}

function parseHalfvec(value: string): number[] {
  return value
    .slice(1, -1)
    .split(',')
    .map(Number);
}

function computeReceiptChecksum(input: {
  candidateIds: readonly string[];
  candidateSnapshotRevision: string;
  representationRevision: string;
  checkpointRevision: string;
  vectorsChecksum: string;
  found: number;
  missing: number;
  revisionMismatch: number;
  identityUnresolved: number;
  invalidShape: number;
}): string {
  const digest = createHash('sha256');
  digest.update(input.candidateSnapshotRevision);
  digest.update(input.representationRevision);
  digest.update(input.checkpointRevision);
  digest.update(input.vectorsChecksum);
  digest.update(String(input.found));
  digest.update(String(input.missing));
  digest.update(String(input.revisionMismatch));
  digest.update(String(input.identityUnresolved));
  digest.update(String(input.invalidShape));
  for (const key of [...input.candidateIds].sort()) digest.update(key);
  return digest.digest('hex');
}

function computeVectorsChecksum(vectors: ReadonlyMap<string, readonly number[]>): string {
  const digest = createHash('sha256');
  for (const [candidateId, vector] of [...vectors.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    digest.update(candidateId);
    const bytes = Buffer.alloc(vector.length * 4);
    for (let index = 0; index < vector.length; index += 1) {
      bytes.writeFloatLE(vector[index]!, index * 4);
    }
    digest.update(bytes);
  }
  return digest.digest('hex');
}

/** Postgres-backed implementation. Reads codebase_chunk_index.latent_256 directly -- this is the
 * repo's own preferred proof-of-lineage source (see openspec/changes/parent-atlas-neural-prefill-encoder
 * "For Parent Atlas I slightly prefer Postgres first for the proof because you can check the
 * representation/checkpoint lineage in the same read"). A Qdrant-point-retrieval implementation
 * of the same interface is a later optimization, not required for correctness. */
export class PostgresLatent256CandidateProvider implements Latent256CandidateProviderV1 {
  async hydrate(input: Latent256HydrateInput): Promise<Latent256HydrateResult> {
    const { candidateIds, candidateSnapshotRevision, representationRevision, checkpointRevision } = input;
    const requested = candidateIds.length;

    if (requested === 0) {
      return {
        vectors: new Map(),
        outcomes: [],
        requested: 0,
        found: 0,
        missing: 0,
        revisionMismatch: 0,
        identityUnresolved: 0,
        invalidShape: 0,
        vectorsChecksum: computeVectorsChecksum(new Map()),
        receiptChecksum: computeReceiptChecksum({ candidateIds, candidateSnapshotRevision, representationRevision, checkpointRevision, vectorsChecksum: computeVectorsChecksum(new Map()), found: 0, missing: 0, revisionMismatch: 0, identityUnresolved: 0, invalidShape: 0 }),
      };
    }

    interface Row extends Record<string, unknown> {
      id: string;
      latent_256: string | null;
      latent_256_checkpoint_revision: string | null;
    }

    const rawResult = await db.execute(sql`
      SELECT id::text AS id, latent_256::text AS latent_256, latent_256_checkpoint_revision
      FROM codebase_chunk_index
      WHERE id = ANY(${sql`ARRAY[${sql.join(candidateIds.map(k => sql`${k}::uuid`), sql`, `)}]`})
    `);
    const rows = pgRows<Row>(rawResult);

    const rowByKey = new Map<string, Row>();
    for (const row of rows) {
      rowByKey.set(row.id, row);
    }

    const vectors = new Map<string, readonly number[]>();
    const outcomes: Latent256HydrationOutcome[] = [];
    const seenIds = new Set<string>();
    let found = 0;
    let revisionMismatch = 0;
    let identityUnresolved = 0;
    let invalidShape = 0;

    for (const [candidateOrdinal, key] of candidateIds.entries()) {
      if (seenIds.has(key)) {
        identityUnresolved++;
        outcomes.push({ candidateOrdinal, canonicalId: null, codebaseChunkId: null, status: 'IDENTITY_UNRESOLVED' });
        continue;
      }
      seenIds.add(key);
      const row = rowByKey.get(key);
      if (!row || row.latent_256 == null) {
        outcomes.push({ candidateOrdinal, canonicalId: key, codebaseChunkId: null, status: 'MISSING' });
        continue;
      }

      if (row.latent_256_checkpoint_revision !== checkpointRevision) {
        revisionMismatch++;
        outcomes.push({ candidateOrdinal, canonicalId: key, codebaseChunkId: row.id, status: 'REVISION_MISMATCH' });
        continue;
      }

      const vec = parseHalfvec(row.latent_256);
      if (!isValidLatent256(vec)) {
        invalidShape++;
        outcomes.push({ candidateOrdinal, canonicalId: key, codebaseChunkId: row.id, status: 'INVALID_SHAPE' });
        continue;
      }

      vectors.set(key, vec);
      found++;
      outcomes.push({ candidateOrdinal, canonicalId: key, codebaseChunkId: row.id, status: 'AVAILABLE' });
    }

    const missing = requested - found - revisionMismatch - invalidShape - identityUnresolved;

    const vectorsChecksum = computeVectorsChecksum(vectors);
    return {
      vectors,
      outcomes,
      requested,
      found,
      missing,
      revisionMismatch,
      identityUnresolved,
      invalidShape,
      vectorsChecksum,
      receiptChecksum: computeReceiptChecksum({ candidateIds, candidateSnapshotRevision, representationRevision, checkpointRevision, vectorsChecksum, found, missing, revisionMismatch, identityUnresolved, invalidShape }),
    };
  }
}
