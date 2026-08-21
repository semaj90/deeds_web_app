export const CHUNK_PACKET_IDENTITY_LINK_SCHEMA = 'atlas.chunk-packet-identity-link.v1' as const;

export type ChunkPacketMatchMethod =
  | 'EXACT_CANONICAL_ID'
  | 'EXACT_QDRANT_POINT_LINK'
  | 'EXACT_SOURCE_SPAN'
  | 'SOURCE_REVISION_SPAN'
  | 'CONTENT_HASH_UNIQUE'
  | 'STRUCTURAL_FINGERPRINT'
  | 'AMBIGUOUS'
  | 'UNRESOLVED';

export type ChunkPacketConfidence = 'EXACT' | 'UNIQUE_DERIVATION' | 'AMBIGUOUS' | 'NONE';
export type ChunkPacketAdmission = 'ADMITTED' | 'REVIEW' | 'QUARANTINED';

export interface ChunkPacketCandidateEvidenceV1 {
  source: string;
  method: Exclude<ChunkPacketMatchMethod, 'AMBIGUOUS' | 'UNRESOLVED'>;
  packetKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  startByte: number | null;
  endByte: number | null;
  contentHash: string | null;
  treeNodeId: string | null;
  evidenceRef: string;
}

export interface AtlasChunkPacketIdentityLinkV1 {
  schema: typeof CHUNK_PACKET_IDENTITY_LINK_SCHEMA;
  qdrantCollection: string;
  qdrantPointId: string;
  chunkIndexId: string | null;
  canonicalPacketKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  matchMethod: ChunkPacketMatchMethod;
  candidatePacketKeys: string[];
  confidence: ChunkPacketConfidence;
  admission: ChunkPacketAdmission;
  reasonCodes: string[];
  evidenceRefs: string[];
  canonicalPacketMinted: false;
  canonicalWritesAllowed: false;
}

const METHOD_PRIORITY: Record<Exclude<ChunkPacketMatchMethod, 'AMBIGUOUS' | 'UNRESOLVED'>, number> = {
  EXACT_CANONICAL_ID: 600,
  EXACT_QDRANT_POINT_LINK: 550,
  EXACT_SOURCE_SPAN: 500,
  SOURCE_REVISION_SPAN: 450,
  STRUCTURAL_FINGERPRINT: 350,
  CONTENT_HASH_UNIQUE: 200,
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map(clean).filter((value): value is string => Boolean(value)))].sort();
}

/**
 * Classify already-observed identity evidence without minting identity.
 *
 * Critical invariant: content-hash evidence can corroborate an existing packet
 * candidate, but CONTENT_HASH_UNIQUE by itself never authorizes ADMITTED. The
 * output is ADMITTED only when one existing atlas_packets.packet_key is uniquely
 * selected by an exact/span/structural evidence class.
 */
export function classifyChunkPacketIdentityLink(input: {
  qdrantCollection: string;
  qdrantPointId: string | number;
  chunkIndexId?: string | number | null;
  sourceRef?: string | null;
  sourceRevision?: string | null;
  evidence: readonly ChunkPacketCandidateEvidenceV1[];
}): AtlasChunkPacketIdentityLinkV1 {
  const qdrantCollection = clean(input.qdrantCollection);
  const qdrantPointId = clean(String(input.qdrantPointId));
  if (!qdrantCollection) throw new Error('S512_ID_QDRANT_COLLECTION_REQUIRED');
  if (!qdrantPointId) throw new Error('S512_ID_QDRANT_POINT_ID_REQUIRED');

  const evidence = [...input.evidence]
    .filter((item) => Boolean(clean(item.evidenceRef)))
    .sort((a, b) => {
      const priority = METHOD_PRIORITY[b.method] - METHOD_PRIORITY[a.method];
      if (priority !== 0) return priority;
      return a.evidenceRef.localeCompare(b.evidenceRef);
    });

  const evidenceRefs = unique(evidence.map((item) => item.evidenceRef));
  const allCandidatePacketKeys = unique(evidence.map((item) => item.packetKey));

  if (!evidence.length || !allCandidatePacketKeys.length) {
    return {
      schema: CHUNK_PACKET_IDENTITY_LINK_SCHEMA,
      qdrantCollection,
      qdrantPointId,
      chunkIndexId: input.chunkIndexId == null ? null : String(input.chunkIndexId),
      canonicalPacketKey: null,
      sourceRef: clean(input.sourceRef),
      sourceRevision: clean(input.sourceRevision),
      matchMethod: 'UNRESOLVED',
      candidatePacketKeys: allCandidatePacketKeys,
      confidence: 'NONE',
      admission: 'QUARANTINED',
      reasonCodes: [evidence.length ? 'NO_EXISTING_PACKET_KEY_RESOLVED' : 'NO_IDENTITY_EVIDENCE'],
      evidenceRefs,
      canonicalPacketMinted: false,
      canonicalWritesAllowed: false,
    };
  }

  const strongestPriority = Math.max(...evidence.map((item) => METHOD_PRIORITY[item.method]));
  const strongest = evidence.filter((item) => METHOD_PRIORITY[item.method] === strongestPriority);
  const strongestPacketKeys = unique(strongest.map((item) => item.packetKey));

  if (strongestPacketKeys.length !== 1) {
    return {
      schema: CHUNK_PACKET_IDENTITY_LINK_SCHEMA,
      qdrantCollection,
      qdrantPointId,
      chunkIndexId: input.chunkIndexId == null ? null : String(input.chunkIndexId),
      canonicalPacketKey: null,
      sourceRef: clean(input.sourceRef),
      sourceRevision: clean(input.sourceRevision),
      matchMethod: 'AMBIGUOUS',
      candidatePacketKeys: allCandidatePacketKeys,
      confidence: 'AMBIGUOUS',
      admission: 'REVIEW',
      reasonCodes: ['MULTIPLE_STRONGEST_PACKET_CANDIDATES'],
      evidenceRefs,
      canonicalPacketMinted: false,
      canonicalWritesAllowed: false,
    };
  }

  const selectedPacketKey = strongestPacketKeys[0];
  const selectedEvidence = strongest.filter((item) => clean(item.packetKey) === selectedPacketKey);
  const selectedMethods = new Set(selectedEvidence.map((item) => item.method));
  const selectedMethod = selectedEvidence[0].method;

  const sourceRefs = unique(selectedEvidence.map((item) => item.sourceRef));
  const sourceRevisions = unique(selectedEvidence.map((item) => item.sourceRevision));
  if (sourceRefs.length > 1 || sourceRevisions.length > 1) {
    return {
      schema: CHUNK_PACKET_IDENTITY_LINK_SCHEMA,
      qdrantCollection,
      qdrantPointId,
      chunkIndexId: input.chunkIndexId == null ? null : String(input.chunkIndexId),
      canonicalPacketKey: null,
      sourceRef: clean(input.sourceRef),
      sourceRevision: clean(input.sourceRevision),
      matchMethod: 'AMBIGUOUS',
      candidatePacketKeys: allCandidatePacketKeys,
      confidence: 'AMBIGUOUS',
      admission: 'REVIEW',
      reasonCodes: ['STRONG_EVIDENCE_LINEAGE_CONFLICT'],
      evidenceRefs,
      canonicalPacketMinted: false,
      canonicalWritesAllowed: false,
    };
  }

  if (selectedMethods.has('CONTENT_HASH_UNIQUE') && selectedMethods.size === 1) {
    return {
      schema: CHUNK_PACKET_IDENTITY_LINK_SCHEMA,
      qdrantCollection,
      qdrantPointId,
      chunkIndexId: input.chunkIndexId == null ? null : String(input.chunkIndexId),
      canonicalPacketKey: null,
      sourceRef: sourceRefs[0] ?? clean(input.sourceRef),
      sourceRevision: sourceRevisions[0] ?? clean(input.sourceRevision),
      matchMethod: 'CONTENT_HASH_UNIQUE',
      candidatePacketKeys: allCandidatePacketKeys,
      confidence: 'UNIQUE_DERIVATION',
      admission: 'REVIEW',
      reasonCodes: ['CONTENT_HASH_ONLY_CANNOT_AUTHORIZE_CANONICAL_LINK'],
      evidenceRefs,
      canonicalPacketMinted: false,
      canonicalWritesAllowed: false,
    };
  }

  const exact = selectedMethod === 'EXACT_CANONICAL_ID' || selectedMethod === 'EXACT_QDRANT_POINT_LINK';
  return {
    schema: CHUNK_PACKET_IDENTITY_LINK_SCHEMA,
    qdrantCollection,
    qdrantPointId,
    chunkIndexId: input.chunkIndexId == null ? null : String(input.chunkIndexId),
    canonicalPacketKey: selectedPacketKey,
    sourceRef: sourceRefs[0] ?? clean(input.sourceRef),
    sourceRevision: sourceRevisions[0] ?? clean(input.sourceRevision),
    matchMethod: selectedMethod,
    candidatePacketKeys: allCandidatePacketKeys,
    confidence: exact ? 'EXACT' : 'UNIQUE_DERIVATION',
    admission: 'ADMITTED',
    reasonCodes: [exact ? 'EXISTING_CANONICAL_PACKET_EXACTLY_RESOLVED' : 'EXISTING_CANONICAL_PACKET_UNIQUELY_DERIVED'],
    evidenceRefs,
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
  };
}
