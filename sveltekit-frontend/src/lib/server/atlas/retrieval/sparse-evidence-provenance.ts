import { z } from 'zod';

/**
 * Sparse lexical scores are evidence signals, not automatically separate
 * logical lanes. Provenance is required so historical compatibility names do
 * not leak into evaluation as algorithm identity.
 */
export const SparseAlgorithmIdSchema = z.enum([
  'QDRANT_BM25',
  'QDRANT_BM42_EXPERIMENTAL',
  'POSTGRES_TS_RANK',
  'POSTGRES_TS_RANK_CD',
  'POSTGRES_TRIGRAM',
  'LEGACY_FNV1A_LOGTF_L2',
]);
export type SparseAlgorithmId = z.infer<typeof SparseAlgorithmIdSchema>;

export const SparseEvidenceSourceSchema = z.enum([
  'QDRANT',
  'POSTGRES',
  'LOCAL_CODEC',
]);

export const SparseEvidenceSignalV1Schema = z.object({
  schema: z.literal('atlas.sparse-evidence-signal.v1'),
  requestId: z.string().min(1),
  canonicalId: z.string().min(1),
  logicalVoteGroup: z.literal('lexical'),
  algorithmId: SparseAlgorithmIdSchema,
  source: SparseEvidenceSourceSchema,
  score: z.number().finite(),
  rank: z.number().int().positive().nullable(),
  experimental: z.boolean(),
  exactTokenEvidence: z.boolean(),
  recomputedByAdapter: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type SparseEvidenceSignalV1 = z.infer<typeof SparseEvidenceSignalV1Schema>;

export const SPARSE_ALGORITHM_CAPABILITIES: Record<SparseAlgorithmId, {
  experimental: boolean;
  lexicalFamily: 'BM25' | 'BM42' | 'POSTGRES_FTS' | 'TRIGRAM' | 'HASHED_CUSTOM';
  mayMasqueradeAsBm25: false;
  mayMasqueradeAsBm42: false;
}> = {
  QDRANT_BM25: {
    experimental: false,
    lexicalFamily: 'BM25',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
  QDRANT_BM42_EXPERIMENTAL: {
    experimental: true,
    lexicalFamily: 'BM42',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
  POSTGRES_TS_RANK: {
    experimental: false,
    lexicalFamily: 'POSTGRES_FTS',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
  POSTGRES_TS_RANK_CD: {
    experimental: false,
    lexicalFamily: 'POSTGRES_FTS',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
  POSTGRES_TRIGRAM: {
    experimental: false,
    lexicalFamily: 'TRIGRAM',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
  LEGACY_FNV1A_LOGTF_L2: {
    experimental: false,
    lexicalFamily: 'HASHED_CUSTOM',
    mayMasqueradeAsBm25: false,
    mayMasqueradeAsBm42: false,
  },
};

/**
 * Preserve multiple sparse algorithms as separate signals while allowing the
 * fusion layer to enforce one logical lexical vote per canonical candidate.
 */
export function groupSparseSignalsByCanonicalId(
  signals: readonly SparseEvidenceSignalV1[],
): Map<string, SparseEvidenceSignalV1[]> {
  const grouped = new Map<string, SparseEvidenceSignalV1[]>();
  for (const raw of signals) {
    const signal = SparseEvidenceSignalV1Schema.parse(raw);
    const rows = grouped.get(signal.canonicalId) ?? [];
    rows.push(signal);
    grouped.set(signal.canonicalId, rows);
  }
  for (const [canonicalId, rows] of grouped) {
    grouped.set(canonicalId, rows.sort((a, b) =>
      a.algorithmId.localeCompare(b.algorithmId)
      || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)));
  }
  return grouped;
}
