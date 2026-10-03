import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * HIDDEN-STATE-BOUNDARY-V1
 * 
 * Strict boundary enforcing that transformer activations and hidden states
 * are strictly EPHEMERAL and never persisted into canonical database tables
 * (PostgreSQL, Qdrant, Neo4j, CouchDB, or task ledgers).
 */

export const HiddenStateCacheParamsSchema = z
  .object({
    manifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    modelRevision: z.string().min(1),
    adapterRevision: z.string().min(1),
    tokenizerRevision: z.string().min(1),
    layer: z.number().int().min(0),
    tokenRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  })
  .strict();

export type HiddenStateCacheParams = z.infer<typeof HiddenStateCacheParamsSchema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function buildHiddenStateCacheKeyV1(params: HiddenStateCacheParams): string {
  HiddenStateCacheParamsSchema.parse(params);
  const canonicalPayload = JSON.stringify({
    schema: 'atlas.hidden-state-cache-key.v1',
    manifestChecksum: params.manifestChecksum,
    modelRevision: params.modelRevision,
    adapterRevision: params.adapterRevision,
    tokenizerRevision: params.tokenizerRevision,
    layer: params.layer,
    tokenRange: params.tokenRange,
  });
  return `ephemeral:hidden:${sha256(canonicalPayload)}`;
}

export class CanonicalStorageViolationError extends Error {}

/**
 * Asserts that a target storage engine is permitted to store hidden states.
 * Fails closed if attempting to write to canonical databases.
 */
export function assertEphemeralStorageOnly(destination: string): void {
  const forbidden = [
    'postgres',
    'postgresql',
    'qdrant',
    'neo4j',
    'couchdb',
    'canonical_ledger',
    'task_history',
  ];
  const normalized = destination.toLowerCase().trim();
  for (const f of forbidden) {
    if (normalized.includes(f)) {
      throw new CanonicalStorageViolationError(
        `Violation: Hidden states/activations cannot be written to canonical store "${destination}". Permitted only in RAM / ephemeral scratch cache.`,
      );
    }
  }
}
