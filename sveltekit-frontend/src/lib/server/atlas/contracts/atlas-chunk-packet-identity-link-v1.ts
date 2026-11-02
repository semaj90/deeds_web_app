import { z } from 'zod';

export const IdentityMatchMethodV1Schema = z.enum([
  'EXACT_CANONICAL_ID',
  'EXACT_SOURCE_SPAN',
  'SOURCE_REVISION_SPAN',
  'CONTENT_HASH_UNIQUE',
  'STRUCTURAL_FINGERPRINT',
  'AMBIGUOUS',
  'UNRESOLVED',
]);
export type IdentityMatchMethodV1 = z.infer<typeof IdentityMatchMethodV1Schema>;

export const IdentityConfidenceV1Schema = z.enum(['EXACT', 'UNIQUE_DERIVATION', 'AMBIGUOUS', 'NONE']);
export type IdentityConfidenceV1 = z.infer<typeof IdentityConfidenceV1Schema>;

export const AtlasChunkPacketIdentityLinkV1Schema = z.object({
  schema: z.literal('atlas.chunk-packet-identity-link.v1'),
  qdrantCollection: z.string().min(1),
  qdrantPointId: z.string().min(1),
  chunkIndexId: z.string().min(1),
  canonicalPacketKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  matchMethod: IdentityMatchMethodV1Schema,
  candidatePacketKeys: z.array(z.string().min(1)),
  confidence: IdentityConfidenceV1Schema,
  evidenceRefs: z.array(z.string().min(1)),
  admission: z.enum(['ADMITTED', 'QUARANTINED']),
  canonicalPacketMinted: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
});

export type AtlasChunkPacketIdentityLinkV1 = z.infer<typeof AtlasChunkPacketIdentityLinkV1Schema>;

export interface IdentityEvidenceInputV1 {
  exactCanonicalPacketKey?: string | null;
  sourceSpanCandidatePacketKeys?: string[];
  sourceRevisionSpanCandidatePacketKeys?: string[];
  contentHashCandidatePacketKeys?: string[];
  structuralFingerprintCandidatePacketKeys?: string[];
  evidenceRefs?: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function chooseMatch(input: IdentityEvidenceInputV1): {
  method: IdentityMatchMethodV1;
  candidatePacketKeys: string[];
  confidence: IdentityConfidenceV1;
} {
  if (input.exactCanonicalPacketKey) {
    return { method: 'EXACT_CANONICAL_ID', candidatePacketKeys: [input.exactCanonicalPacketKey], confidence: 'EXACT' };
  }
  const ordered: Array<[IdentityMatchMethodV1, string[]]> = [
    ['EXACT_SOURCE_SPAN', unique(input.sourceSpanCandidatePacketKeys ?? [])],
    ['SOURCE_REVISION_SPAN', unique(input.sourceRevisionSpanCandidatePacketKeys ?? [])],
    ['CONTENT_HASH_UNIQUE', unique(input.contentHashCandidatePacketKeys ?? [])],
    ['STRUCTURAL_FINGERPRINT', unique(input.structuralFingerprintCandidatePacketKeys ?? [])],
  ];
  for (const [method, candidates] of ordered) {
    if (candidates.length === 1) return { method, candidatePacketKeys: candidates, confidence: 'UNIQUE_DERIVATION' };
    if (candidates.length > 1) return { method: 'AMBIGUOUS', candidatePacketKeys: candidates, confidence: 'AMBIGUOUS' };
  }
  return { method: 'UNRESOLVED', candidatePacketKeys: [], confidence: 'NONE' };
}

export function deriveAtlasChunkPacketIdentityLinkV1(input: {
  qdrantCollection: string;
  qdrantPointId: string;
  chunkIndexId: string;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  evidence?: IdentityEvidenceInputV1;
}): AtlasChunkPacketIdentityLinkV1 {
  const selected = chooseMatch(input.evidence ?? {});
  const admitted = selected.confidence === 'EXACT' || selected.confidence === 'UNIQUE_DERIVATION';
  return AtlasChunkPacketIdentityLinkV1Schema.parse({
    schema: 'atlas.chunk-packet-identity-link.v1',
    qdrantCollection: input.qdrantCollection,
    qdrantPointId: input.qdrantPointId,
    chunkIndexId: input.chunkIndexId,
    canonicalPacketKey: selected.candidatePacketKeys[0] ?? null,
    sourceRef: input.sourceRef ?? null,
    sourceRevision: input.sourceRevision ?? null,
    matchMethod: selected.method,
    candidatePacketKeys: selected.candidatePacketKeys,
    confidence: selected.confidence,
    evidenceRefs: unique(input.evidence?.evidenceRefs ?? []),
    admission: admitted ? 'ADMITTED' : 'QUARANTINED',
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
  });
}
