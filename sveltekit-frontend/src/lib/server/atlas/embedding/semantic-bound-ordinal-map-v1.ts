import {
  assertCandidateOrdinalMapIntegrityV1,
  materializeCandidateOrdinalMap,
  type CandidateOrdinalMapV1,
  type CanonicalCandidateIdentityInput,
} from '../features/canonical-candidate-v1.js';
import {
  semanticCorpusManifestV1Schema,
  semanticCorpusMemberV1Schema,
  type SemanticCorpusManifestV1,
  type SemanticCorpusMemberV1,
} from './semantic-corpus-manifest-v1.js';

/**
 * Derives a new ordinal-map snapshot after semantic corpus admission.
 * Candidate ordinals and canonical identity are preserved exactly. Only
 * semanticRevision is populated for corpus members. Non-members remain null.
 * The source map is never mutated.
 */
export function bindSemanticCorpusToOrdinalMapV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  members: readonly SemanticCorpusMemberV1[];
  manifest: SemanticCorpusManifestV1;
  producerRevision: string;
}): CandidateOrdinalMapV1 {
  assertCandidateOrdinalMapIntegrityV1(input.ordinalMap);
  const manifest = semanticCorpusManifestV1Schema.parse(input.manifest);
  if (manifest.workspaceRevision !== input.ordinalMap.workspaceRevision) {
    throw new Error('SEMANTIC_BOUND_MAP_WORKSPACE_MISMATCH');
  }
  if (manifest.ordinalMapChecksum !== input.ordinalMap.ordinalMapChecksum) {
    throw new Error('SEMANTIC_BOUND_MAP_SOURCE_MAP_CHECKSUM_MISMATCH');
  }

  const members = input.members.map((member) => semanticCorpusMemberV1Schema.parse(member));
  if (members.length !== manifest.memberCount) {
    throw new Error(`SEMANTIC_BOUND_MAP_MEMBER_COUNT_MISMATCH:${members.length}:${manifest.memberCount}`);
  }
  const memberByOrdinal = new Map(members.map((member) => [member.candidateOrdinal, member]));
  if (memberByOrdinal.size !== members.length) throw new Error('SEMANTIC_BOUND_MAP_DUPLICATE_ORDINAL');

  const candidates: CanonicalCandidateIdentityInput[] = input.ordinalMap.candidates.map((candidate) => {
    const member = memberByOrdinal.get(candidate.candidateOrdinal);
    if (member && member.canonicalId !== candidate.canonicalId) {
      throw new Error(`SEMANTIC_BOUND_MAP_CANONICAL_ID_MISMATCH:${candidate.candidateOrdinal}`);
    }
    return {
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: member ? manifest.representationRevision : candidate.semanticRevision,
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: member
        ? [...candidate.evidenceRefs, `semantic-corpus:${manifest.corpusChecksum}`]
        : candidate.evidenceRefs,
      representationBindings: candidate.representationBindings,
    };
  });

  return materializeCandidateOrdinalMap({
    candidates,
    candidateSnapshotRevision: `${input.ordinalMap.candidateSnapshotRevision}:semantic:${manifest.representationRevision}`,
    workspaceRevision: input.ordinalMap.workspaceRevision,
    producerRevision: input.producerRevision,
  });
}
