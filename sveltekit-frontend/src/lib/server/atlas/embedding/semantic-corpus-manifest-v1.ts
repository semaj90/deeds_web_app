import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

export const SEMANTIC_CORPUS_MANIFEST_V1 = 'atlas.semantic-corpus-manifest.v1' as const;
export const SEMANTIC_CORPUS_MEMBER_V1 = 'atlas.semantic-corpus-member.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export const semanticCorpusMemberV1Schema = z.object({
  schema: z.literal(SEMANTIC_CORPUS_MEMBER_V1),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: contentRevision,
  chunkRowId: z.string().uuid(),
  inputDigestAlgorithm: z.enum(['sha256', 'sha256_16']),
  inputDigest: z.string().regex(/^[a-f0-9]+$/),
  vectorChecksum: sha256,
  observedEmbeddingModel: z.string().min(1).nullable(),
  observedEmbeddingVersion: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict().superRefine((value, ctx) => {
  const expectedLength = value.inputDigestAlgorithm === 'sha256' ? 64 : 16;
  if (value.inputDigest.length !== expectedLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inputDigest'],
      message: `SEMANTIC_CORPUS_INPUT_DIGEST_LENGTH_MISMATCH:${value.inputDigestAlgorithm}:${expectedLength}`,
    });
  }
});

export type SemanticCorpusMemberV1 = z.infer<typeof semanticCorpusMemberV1Schema>;

export const semanticCorpusManifestV1Schema = z.object({
  schema: z.literal(SEMANTIC_CORPUS_MANIFEST_V1),
  workspaceRevision: contentRevision,
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().regex(/^semantic_768:sha256:[a-f0-9]{64}$/),
  dimensions: z.literal(768),
  metric: z.literal('COSINE'),
  normalization: z.literal('L2'),
  storage: z.object({
    table: z.literal('codebase_chunk_index'),
    column: z.literal('content_embedding'),
    storageType: z.literal('halfvec(768)'),
  }).strict(),
  coverageScope: z.enum(['FULL_ORDINAL_MAP', 'BOUNDED_SUBSET']),
  ordinalMapRowCount: z.number().int().positive(),
  memberCount: z.number().int().positive(),
  sourceRevisionSetChecksum: sha256,
  identitySetChecksum: sha256,
  vectorSetChecksum: sha256,
  observedEmbeddingModels: z.array(z.string().min(1)),
  observedEmbeddingVersions: z.array(z.string().min(1)),
  modelProvenanceStatus: z.enum(['RESOLVED', 'UNRESOLVED']),
  qualityJudgmentsRequired: z.literal(false),
  qualityPromotionEligible: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  corpusChecksum: sha256,
}).strict();

export type SemanticCorpusManifestV1 = z.infer<typeof semanticCorpusManifestV1Schema>;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

function assertMemberMatchesOrdinalMap(member: SemanticCorpusMemberV1, map: CandidateOrdinalMapV1): void {
  const candidate = map.candidates[member.candidateOrdinal];
  if (!candidate) throw new Error(`SEMANTIC_CORPUS_ORDINAL_NOT_IN_MAP:${member.candidateOrdinal}`);
  const pairs: Array<[string, unknown, unknown]> = [
    ['canonicalId', member.canonicalId, candidate.canonicalId],
    ['packetKey', member.packetKey, candidate.packetKey],
    ['sourceRef', member.sourceRef, candidate.sourceRef],
    ['sourceRevision', member.sourceRevision, candidate.sourceRevision],
  ];
  for (const [field, actual, expected] of pairs) {
    if (actual !== expected) {
      throw new Error(`SEMANTIC_CORPUS_MEMBER_IDENTITY_MISMATCH:${member.candidateOrdinal}:${field}`);
    }
  }
}

export function buildSemanticCorpusManifestV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  members: readonly SemanticCorpusMemberV1[];
  modelProvenanceStatus?: 'RESOLVED' | 'UNRESOLVED';
}): SemanticCorpusManifestV1 {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);
  const members = input.members.map((member) => semanticCorpusMemberV1Schema.parse(member));
  if (members.length === 0) throw new Error('SEMANTIC_CORPUS_MEMBERS_REQUIRED');

  const ordinals = new Set<number>();
  const canonicalIds = new Set<string>();
  for (const member of members) {
    if (ordinals.has(member.candidateOrdinal)) {
      throw new Error(`SEMANTIC_CORPUS_DUPLICATE_ORDINAL:${member.candidateOrdinal}`);
    }
    if (canonicalIds.has(member.canonicalId)) {
      throw new Error(`SEMANTIC_CORPUS_DUPLICATE_CANONICAL_ID:${member.canonicalId}`);
    }
    ordinals.add(member.candidateOrdinal);
    canonicalIds.add(member.canonicalId);
    assertMemberMatchesOrdinalMap(member, map);
  }

  const ordered = [...members].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  const coverageScope = ordered.length === map.rowCount ? 'FULL_ORDINAL_MAP' as const : 'BOUNDED_SUBSET' as const;
  const sourceRevisionSetChecksum = checksum(sortedUnique(ordered.map((member) => member.sourceRevision)));
  const identitySetChecksum = checksum(ordered.map((member) => ({
    candidateOrdinal: member.candidateOrdinal,
    canonicalId: member.canonicalId,
    packetKey: member.packetKey,
    sourceRef: member.sourceRef,
    sourceRevision: member.sourceRevision,
    chunkRowId: member.chunkRowId,
  })));
  const vectorSetChecksum = checksum(ordered.map((member) => ({
    candidateOrdinal: member.candidateOrdinal,
    canonicalId: member.canonicalId,
    inputDigestAlgorithm: member.inputDigestAlgorithm,
    inputDigest: member.inputDigest,
    vectorChecksum: member.vectorChecksum,
  })));
  const observedEmbeddingModels = sortedUnique(
    ordered.flatMap((member) => member.observedEmbeddingModel ? [member.observedEmbeddingModel] : []),
  );
  const observedEmbeddingVersions = sortedUnique(
    ordered.flatMap((member) => member.observedEmbeddingVersion ? [member.observedEmbeddingVersion] : []),
  );

  const corpusIdentity = {
    schema: 'atlas.semantic-corpus-identity.v1',
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    representationId: 'semantic_768' as const,
    dimensions: 768 as const,
    coverageScope,
    ordinalMapRowCount: map.rowCount,
    memberCount: ordered.length,
    sourceRevisionSetChecksum,
    identitySetChecksum,
    vectorSetChecksum,
  };
  const corpusIdentityChecksum = checksum(corpusIdentity);
  const representationRevision = `semantic_768:sha256:${corpusIdentityChecksum}` as const;

  const payload = {
    schema: SEMANTIC_CORPUS_MANIFEST_V1,
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    representationId: 'semantic_768' as const,
    representationRevision,
    dimensions: 768 as const,
    metric: 'COSINE' as const,
    normalization: 'L2' as const,
    storage: {
      table: 'codebase_chunk_index' as const,
      column: 'content_embedding' as const,
      storageType: 'halfvec(768)' as const,
    },
    coverageScope,
    ordinalMapRowCount: map.rowCount,
    memberCount: ordered.length,
    sourceRevisionSetChecksum,
    identitySetChecksum,
    vectorSetChecksum,
    observedEmbeddingModels,
    observedEmbeddingVersions,
    modelProvenanceStatus: input.modelProvenanceStatus ?? 'UNRESOLVED' as const,
    qualityJudgmentsRequired: false as const,
    qualityPromotionEligible: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };

  return semanticCorpusManifestV1Schema.parse({
    ...payload,
    corpusChecksum: checksum(payload),
  });
}

export function verifySemanticCorpusManifestV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  members: readonly SemanticCorpusMemberV1[];
  manifest: SemanticCorpusManifestV1;
}): void {
  const manifest = semanticCorpusManifestV1Schema.parse(input.manifest);
  const rebuilt = buildSemanticCorpusManifestV1({
    ordinalMap: input.ordinalMap,
    members: input.members,
    modelProvenanceStatus: manifest.modelProvenanceStatus,
  });
  if (rebuilt.corpusChecksum !== manifest.corpusChecksum) {
    throw new Error(`SEMANTIC_CORPUS_CHECKSUM_MISMATCH:${rebuilt.corpusChecksum}:${manifest.corpusChecksum}`);
  }
  if (rebuilt.representationRevision !== manifest.representationRevision) {
    throw new Error(`SEMANTIC_CORPUS_REPRESENTATION_REVISION_MISMATCH:${rebuilt.representationRevision}:${manifest.representationRevision}`);
  }
}
