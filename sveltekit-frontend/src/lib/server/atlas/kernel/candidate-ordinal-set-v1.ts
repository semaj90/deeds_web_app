import { createHash } from 'node:crypto';
import { z } from 'zod';

import { denseExecutorKindSchema } from '../retrieval/dense-executor-candidate-ordinal-v1.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const CandidateOrdinalHitV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  score: z.number().finite(),
  rank: z.number().int().positive(),
  executor: denseExecutorKindSchema,
  evidenceRefs: z.array(z.string().min(1)).max(4096),
}).strict();
export type CandidateOrdinalHitV1 = z.infer<typeof CandidateOrdinalHitV1Schema>;

export const CandidateOrdinalSetV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-set.v1'),
  requestId: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: checksum,
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  hits: z.array(CandidateOrdinalHitV1Schema).max(1_000_000),
  approximate: z.boolean(),
  exactPromotionRequired: z.literal(true),
  rawVectorsIncluded: z.literal(false),
  executorIdsIncluded: z.literal(false),
  candidateOrdinalIsIdentityAuthority: z.literal(false),
  canonicalWrites: z.literal(false),
  resultChecksum: checksum,
}).strict();
export type CandidateOrdinalSetV1 = z.infer<typeof CandidateOrdinalSetV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * Ordinal-only retrieval result for Go/Python/kernel boundaries.
 *
 * Large semantic vectors remain behind revision/checksum-qualified artifacts.
 * Executor-local point/node IDs terminate below this boundary. CandidateOrdinal
 * is a frozen execution coordinate scoped by candidateSnapshotRevision and
 * ordinalMapChecksum; it is not canonical identity.
 */
export function buildCandidateOrdinalSetV1(input: {
  requestId: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  representationRevision: string;
  hits: readonly z.input<typeof CandidateOrdinalHitV1Schema>[];
  approximate: boolean;
}): CandidateOrdinalSetV1 {
  const hits = input.hits.map((hit) => CandidateOrdinalHitV1Schema.parse(hit));
  const seen = new Set<number>();
  for (const hit of hits) {
    if (seen.has(hit.candidateOrdinal)) {
      throw new Error(`CANDIDATE_ORDINAL_SET_DUPLICATE:${hit.candidateOrdinal}`);
    }
    seen.add(hit.candidateOrdinal);
  }

  const payload = {
    schema: 'atlas.candidate-ordinal-set.v1' as const,
    requestId: input.requestId,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    representationId: 'semantic_768' as const,
    representationRevision: input.representationRevision,
    hits,
    approximate: input.approximate,
    exactPromotionRequired: true as const,
    rawVectorsIncluded: false as const,
    executorIdsIncluded: false as const,
    candidateOrdinalIsIdentityAuthority: false as const,
    canonicalWrites: false as const,
  };

  return CandidateOrdinalSetV1Schema.parse({
    ...payload,
    resultChecksum: digest(payload),
  });
}

export function verifyCandidateOrdinalSetV1(
  input: z.input<typeof CandidateOrdinalSetV1Schema>,
): CandidateOrdinalSetV1 {
  const parsed = CandidateOrdinalSetV1Schema.parse(input);
  const { resultChecksum, ...payload } = parsed;
  const expected = digest(payload);
  if (expected !== resultChecksum) {
    throw new Error(`CANDIDATE_ORDINAL_SET_CHECKSUM_MISMATCH:${expected}:${resultChecksum}`);
  }
  return parsed;
}
