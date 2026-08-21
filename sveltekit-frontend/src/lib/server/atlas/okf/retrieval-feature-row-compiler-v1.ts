import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import type { CandidateProjectionInput } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  RetrievalFeatureRowV1Schema,
  type OkfEvidenceRefV1,
  type OkfRevisionSetV1,
  type RetrievalFeatureRowV1,
} from './okf-evidence-feature-v1.js';
import {
  CANDIDATE_FEATURE_REGISTRY_V1,
  CANDIDATE_FEATURE_REGISTRY_REVISION,
} from './candidate-feature-registry-v1.js';

export const RETRIEVAL_FEATURE_ROW_COMPILER_REVISION = 'atlas.retrieval-feature-row-compiler.c25.v1' as const;

type FeatureName = (typeof CANDIDATE_FEATURE_NAMES)[number];

function candidateFeatureValue(candidate: CandidateProjectionInput, featureName: FeatureName): number | undefined {
  return candidate[featureName as keyof CandidateProjectionInput] as number | undefined;
}

export function compileRetrievalFeatureRowV1(input: {
  queryId: string;
  candidateCanonicalId: string;
  candidate: CandidateProjectionInput;
  rowOrdinal: number;
  workspaceRevision: string;
  sourceRevision: string | null;
  representationRevision: string;
  featureRevision: string;
  revisions: OkfRevisionSetV1;
  featureEvidenceRefs: Partial<Record<FeatureName, readonly OkfEvidenceRefV1[]>>;
  absenceEvidenceRef: OkfEvidenceRefV1;
}): RetrievalFeatureRowV1 {
  if (input.revisions.featureMappingRevision !== CANDIDATE_FEATURE_REGISTRY_REVISION) {
    throw new Error(`RETRIEVAL_FEATURE_MAPPING_REVISION_MISMATCH:${input.revisions.featureMappingRevision}`);
  }
  if (!Number.isInteger(input.rowOrdinal) || input.rowOrdinal < 0) {
    throw new Error(`RETRIEVAL_FEATURE_ROW_ORDINAL_INVALID:${input.rowOrdinal}`);
  }

  const registry = new Map(CANDIDATE_FEATURE_REGISTRY_V1.map((entry) => [entry.featureName, entry]));
  const features = CANDIDATE_FEATURE_NAMES.map((featureName) => {
    const definition = registry.get(featureName);
    if (!definition) throw new Error(`RETRIEVAL_FEATURE_DEFINITION_MISSING:${featureName}`);
    const raw = candidateFeatureValue(input.candidate, featureName);
    const present = raw !== undefined && raw !== null;
    if (present && !Number.isFinite(raw)) {
      throw new Error(`RETRIEVAL_FEATURE_NON_FINITE:${input.candidate.packet_key}:${featureName}`);
    }
    const evidenceRefs = present
      ? [...(input.featureEvidenceRefs[featureName] ?? [])]
      : [input.absenceEvidenceRef];
    if (!evidenceRefs.length) {
      throw new Error(`RETRIEVAL_FEATURE_PROVENANCE_MISSING:${input.candidate.packet_key}:${featureName}`);
    }
    if (present) {
      const disallowed = evidenceRefs.filter((ref) => !definition.allowedEvidenceKinds.includes(ref.evidenceKind));
      if (disallowed.length) {
        throw new Error(`RETRIEVAL_FEATURE_EVIDENCE_KIND_NOT_ALLOWED:${input.candidate.packet_key}:${featureName}:${disallowed[0].evidenceKind}`);
      }
    }
    return {
      featureName,
      value: present ? Math.fround(raw) : 0,
      present,
      definitionRevision: definition.featureMappingRevision,
      compilerRevision: RETRIEVAL_FEATURE_ROW_COMPILER_REVISION,
      evidenceRefs,
    };
  });

  return RetrievalFeatureRowV1Schema.parse({
    schema: 'atlas.retrieval-feature-row.v1',
    queryId: input.queryId,
    candidateCanonicalId: input.candidateCanonicalId,
    candidatePacketKey: input.candidate.packet_key,
    rowOrdinal: input.rowOrdinal,
    lineage: {
      workspaceRevision: input.workspaceRevision,
      sourceRevision: input.sourceRevision,
      representationRevision: input.representationRevision,
      featureRevision: input.featureRevision,
      revisions: input.revisions,
    },
    features,
    evidenceAuthority: false,
    canonicalWritesAllowed: false,
  });
}
