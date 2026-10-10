import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

export interface ProductFeatureOrdinalCandidateV1 {
  canonicalCandidateId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
}

export interface ProductFeatureOrdinalMapVerificationInputV1 {
  requestId: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  ordinalMap: unknown;
  candidates: readonly ProductFeatureOrdinalCandidateV1[];
}

export interface ProductFeatureOrdinalMapVerificationReceiptV1 {
  status: 'MATCH';
  requestId: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  producerRevision: string;
  verifiedCandidateCount: number;
}

export function verifyProductFeatureOrdinalMapV1(
  input: ProductFeatureOrdinalMapVerificationInputV1,
): ProductFeatureOrdinalMapVerificationReceiptV1 {
  const map: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);

  if (map.workspaceRevision !== input.workspaceRevision
    || map.candidateSnapshotRevision !== input.candidateSnapshotRevision
    || map.ordinalMapChecksum !== input.ordinalMapChecksum) {
    throw new Error('PRODUCT_FEATURE_ORDINAL_MAP_BINDING_MISMATCH');
  }

  const byCanonicalId = new Map(map.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const seen = new Set<string>();
  for (const selected of input.candidates) {
    if (!selected.canonicalCandidateId || seen.has(selected.canonicalCandidateId)) {
      throw new Error('PRODUCT_FEATURE_CANDIDATE_ID_MISSING_OR_DUPLICATE');
    }
    seen.add(selected.canonicalCandidateId);
    const canonical = byCanonicalId.get(selected.canonicalCandidateId);
    if (!canonical
      || canonical.packetKey !== selected.packetKey
      || canonical.sourceRef !== selected.sourceRef
      || canonical.sourceRevision !== selected.sourceRevision
      || canonical.workspaceRevision !== input.workspaceRevision
      || canonical.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
      throw new Error('PRODUCT_FEATURE_CANDIDATE_NOT_BOUND_TO_ORDINAL_MAP');
    }
  }

  return {
    status: 'MATCH',
    requestId: input.requestId,
    workspaceRevision: map.workspaceRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    producerRevision: map.producerRevision,
    verifiedCandidateCount: seen.size,
  };
}
