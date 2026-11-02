import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const boundedKey = (maximum: number) => z.string().trim().min(1).max(maximum);

const observationSchema = z.object({
  contextRef: boundedKey(1_024),
  contextRevision: sha256Revision,
  candidateFeatureKey: boundedKey(512),
  candidateSourceRef: boundedKey(1_024),
  candidateSourceRevision: sha256Revision,
  polarity: z.enum(['OBSERVED_ASSOCIATION', 'EXPLICIT_NEGATIVE']),
  evidenceClaimIds: z.array(z.string().uuid()).min(1).max(16),
  evidenceSourceRef: boundedKey(1_024),
  evidenceSourceRevision: sha256Revision,
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const SparseFeatureSnapshotInputV1Schema = z.object({
  schema: z.literal('atlas.sparse-feature-snapshot-input.v1'),
  sourceSnapshotRef: boundedKey(1_024),
  sourceSnapshotRevision: sha256Revision,
  candidateCatalogSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z.array(observationSchema).max(20_000),
}).strict().superRefine((input, context) => {
  const pairs = new Set<string>();
  input.observations.forEach((observation, index) => {
    const pair = JSON.stringify([observation.contextRef, observation.candidateFeatureKey]);
    if (pairs.has(pair)) {
      context.addIssue({
        code: 'custom',
        path: ['observations', index],
        message: 'DUPLICATE_OR_CONFLICTING_CONTEXT_FEATURE_PAIR',
      });
    }
    pairs.add(pair);
    if (observation.evidenceSourceRevision !== `sha256:${observation.evidenceSha256}`) {
      context.addIssue({
        code: 'custom',
        path: ['observations', index, 'evidenceSourceRevision'],
        message: 'EVIDENCE_REVISION_DIGEST_MISMATCH',
      });
    }
  });
});

export const SparseFeatureSnapshotV1Schema = z.object({
  schema: z.literal('atlas.sparse-feature-snapshot.v1'),
  sourceSnapshotRef: boundedKey(1_024),
  sourceSnapshotRevision: sha256Revision,
  candidateCatalogSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z.array(observationSchema).max(20_000),
  missingPairSemantics: z.literal('UNKNOWN_NOT_NEGATIVE'),
  admission: z.literal('PROPOSAL_ONLY'),
  canonicalAuthority: z.literal(false),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type SparseFeatureSnapshotInputV1 = z.infer<typeof SparseFeatureSnapshotInputV1Schema>;
export type SparseFeatureSnapshotV1 = z.infer<typeof SparseFeatureSnapshotV1Schema>;

export function buildSparseFeatureSnapshotV1(input: unknown): SparseFeatureSnapshotV1 {
  const parsed = SparseFeatureSnapshotInputV1Schema.parse(input);
  const body = normalizeSnapshotBody({
    schema: 'atlas.sparse-feature-snapshot.v1',
    sourceSnapshotRef: parsed.sourceSnapshotRef,
    sourceSnapshotRevision: parsed.sourceSnapshotRevision,
    candidateCatalogSnapshotSha256: parsed.candidateCatalogSnapshotSha256,
    observations: parsed.observations,
    missingPairSemantics: 'UNKNOWN_NOT_NEGATIVE',
    admission: 'PROPOSAL_ONLY',
    canonicalAuthority: false,
  });
  const snapshotSha256 = hashSnapshotBody(body);
  return SparseFeatureSnapshotV1Schema.parse({ ...body, snapshotSha256 });
}

export function parseSparseFeatureSnapshotV1(input: unknown): SparseFeatureSnapshotV1 {
  const parsed = SparseFeatureSnapshotV1Schema.parse(input);
  const body = normalizeSnapshotBody(parsed);
  if (hashSnapshotBody(body) !== parsed.snapshotSha256) {
    throw new Error('SPARSE_FEATURE_SNAPSHOT_DIGEST_MISMATCH');
  }
  return SparseFeatureSnapshotV1Schema.parse({ ...body, snapshotSha256: parsed.snapshotSha256 });
}

type SnapshotBody = Omit<SparseFeatureSnapshotV1, 'snapshotSha256'>;

function normalizeSnapshotBody(snapshot: SnapshotBody | SparseFeatureSnapshotV1): SnapshotBody {
  const observations = [...snapshot.observations].sort((left, right) =>
    (left.contextRef < right.contextRef ? -1 : left.contextRef > right.contextRef ? 1 : 0)
      || (left.candidateFeatureKey < right.candidateFeatureKey ? -1 : left.candidateFeatureKey > right.candidateFeatureKey ? 1 : 0),
  ).map((observation) => ({
    ...observation,
    evidenceClaimIds: [...observation.evidenceClaimIds].sort(),
  }));
  return {
    schema: snapshot.schema,
    sourceSnapshotRef: snapshot.sourceSnapshotRef,
    sourceSnapshotRevision: snapshot.sourceSnapshotRevision,
    candidateCatalogSnapshotSha256: snapshot.candidateCatalogSnapshotSha256,
    observations,
    missingPairSemantics: snapshot.missingPairSemantics,
    admission: snapshot.admission,
    canonicalAuthority: snapshot.canonicalAuthority,
  };
}

function hashSnapshotBody(body: SnapshotBody): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
