import { createHash } from 'node:crypto';
import { z } from 'zod';
import { candidateOrdinalMapV1Schema, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import { fanoutAdmissionV1Schema, type FanoutAdmissionV1 } from '../graph/fanout-admission-v1.js';
import { ontologyObservationTupleV1Schema } from './ontology-observation-tuple-v1.js';

export const PRE_FANOUT_EVIDENCE_BUNDLE_SCHEMA_V1 = 'atlas.pre-fanout-evidence-bundle.v1' as const;

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const domainClassificationEvidenceV1Schema = z.object({
  classId: id,
  classifierRevision: id,
  evaluationStatus: z.enum(['FROZEN_EVAL_PROVEN', 'CHALLENGER_UNPROVEN']),
  weight: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(id).default([]),
}).strict().superRefine((row, ctx) => {
  if (row.evaluationStatus !== 'FROZEN_EVAL_PROVEN' && row.weight !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['weight'],
      message: 'DOMAIN_CLASSIFIER_UNPROVEN_REQUIRES_ZERO_WEIGHT',
    });
  }
});
export type DomainClassificationEvidenceV1 = z.infer<typeof domainClassificationEvidenceV1Schema>;

export const preFanoutEvidenceBundleV1Schema = z.object({
  schema: z.literal(PRE_FANOUT_EVIDENCE_BUNDLE_SCHEMA_V1),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: id,
  packetKey: id.nullable(),
  treeNodeId: id.nullable(),
  symbolVersionId: id.nullable(),
  workspaceRevision: id,
  sourceRevision: id,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  structuralEvidenceRefs: z.array(id).min(1),
  chunkEvidenceRefs: z.array(id).default([]),
  astGrepEvidenceRefs: z.array(id).default([]),
  tsMorphEvidenceRefs: z.array(id).default([]),
  ontologyTuples: z.array(ontologyObservationTupleV1Schema).default([]),
  ontologyRevision: id,
  domain: domainClassificationEvidenceV1Schema.nullable(),
  semantic: z.object({
    representationId: id,
    representationRevision: id,
    representationChecksum: checksum,
  }).strict(),
  gates: z.object({
    sourceBytesProven: z.boolean(),
    structuralIdentityProven: z.boolean(),
    ontologyLineageProven: z.boolean(),
    semanticRevisionBound: z.boolean(),
    domainClassifierFrozen: z.boolean(),
  }).strict(),
  fanoutEligible: z.boolean(),
  bundleChecksum: checksum,
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type PreFanoutEvidenceBundleV1 = z.infer<typeof preFanoutEvidenceBundleV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function resolveCandidate(map: CandidateOrdinalMapV1, ordinal: number) {
  const candidate = map.candidates[ordinal];
  if (!candidate || candidate.candidateOrdinal !== ordinal) throw new Error(`PRE_FANOUT_CANDIDATE_ORDINAL_INVALID:${ordinal}`);
  return candidate;
}

export function materializePreFanoutEvidenceBundleV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  candidateOrdinal: number;
  structuralEvidenceRefs: readonly string[];
  chunkEvidenceRefs?: readonly string[];
  astGrepEvidenceRefs?: readonly string[];
  tsMorphEvidenceRefs?: readonly string[];
  ontologyTuples?: readonly z.input<typeof ontologyObservationTupleV1Schema>[];
  ontologyRevision: string;
  domain?: z.input<typeof domainClassificationEvidenceV1Schema> | null;
  semantic: {
    representationId: string;
    representationRevision: string;
    representationChecksum: string;
  };
  gates: {
    sourceBytesProven: boolean;
    structuralIdentityProven: boolean;
    ontologyLineageProven: boolean;
    semanticRevisionBound: boolean;
  };
}): PreFanoutEvidenceBundleV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const candidate = resolveCandidate(ordinalMap, input.candidateOrdinal);
  if (candidate.degradedIdentity) throw new Error('PRE_FANOUT_DEGRADED_IDENTITY_REJECTED');

  const structuralEvidenceRefs = Array.from(new Set(input.structuralEvidenceRefs.map(String))).sort();
  if (structuralEvidenceRefs.length === 0) throw new Error('PRE_FANOUT_STRUCTURAL_EVIDENCE_REQUIRED');

  const ontologyTuples = (input.ontologyTuples ?? []).map((tuple) => ontologyObservationTupleV1Schema.parse(tuple));
  for (const tuple of ontologyTuples) {
    if (tuple.subjectCanonicalId !== candidate.canonicalId) throw new Error('PRE_FANOUT_ONTOLOGY_SUBJECT_MISMATCH');
    if (tuple.workspaceRevision !== candidate.workspaceRevision) throw new Error('PRE_FANOUT_ONTOLOGY_WORKSPACE_REVISION_MISMATCH');
    if (tuple.sourceRevision !== candidate.sourceRevision) throw new Error('PRE_FANOUT_ONTOLOGY_SOURCE_REVISION_MISMATCH');
    if (tuple.ontologyRevision !== input.ontologyRevision) throw new Error('PRE_FANOUT_ONTOLOGY_REVISION_MISMATCH');
  }

  const domain = input.domain === undefined || input.domain === null
    ? null
    : domainClassificationEvidenceV1Schema.parse(input.domain);
  const domainClassifierFrozen = domain?.evaluationStatus === 'FROZEN_EVAL_PROVEN';

  if (candidate.semanticRevision !== null && candidate.semanticRevision !== input.semantic.representationRevision) {
    throw new Error('PRE_FANOUT_SEMANTIC_REVISION_MISMATCH');
  }
  if (!/^[a-f0-9]{64}$/.test(input.semantic.representationChecksum)) {
    throw new Error('PRE_FANOUT_SEMANTIC_CHECKSUM_INVALID');
  }

  const gates = {
    ...input.gates,
    domainClassifierFrozen,
  };
  const fanoutEligible = Boolean(
    gates.sourceBytesProven
    && gates.structuralIdentityProven
    && gates.ontologyLineageProven
    && gates.semanticRevisionBound
  );

  const payload = {
    schema: PRE_FANOUT_EVIDENCE_BUNDLE_SCHEMA_V1,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    candidateSnapshotRevision: candidate.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    structuralEvidenceRefs,
    chunkEvidenceRefs: Array.from(new Set((input.chunkEvidenceRefs ?? []).map(String))).sort(),
    astGrepEvidenceRefs: Array.from(new Set((input.astGrepEvidenceRefs ?? []).map(String))).sort(),
    tsMorphEvidenceRefs: Array.from(new Set((input.tsMorphEvidenceRefs ?? []).map(String))).sort(),
    ontologyTuples,
    ontologyRevision: input.ontologyRevision,
    domain,
    semantic: input.semantic,
    gates,
    fanoutEligible,
    identityAuthority: false as const,
    retrievalVoteProduced: false as const,
    canonicalWritesAllowed: false as const,
  };

  return preFanoutEvidenceBundleV1Schema.parse({
    ...payload,
    bundleChecksum: sha256(payload),
  });
}

/**
 * Joins the evidence bundle to the existing admission receipt without
 * creating a second admission authority. This is intentionally read-only:
 * the admission receipt remains the only source of CandidateOrdinal
 * eligibility, while the bundle proves the evidence families agree with it.
 */
export function verifyPreFanoutBundleAgainstAdmissionV1(input: {
  admission: unknown;
  bundle: unknown;
}): { aligned: boolean; blockers: string[] } {
  const admission = fanoutAdmissionV1Schema.parse(input.admission);
  const bundle = preFanoutEvidenceBundleV1Schema.parse(input.bundle);
  const blockers: string[] = [];
  const candidate = admission.candidateOrdinalMap?.candidates[bundle.candidateOrdinal];

  if (!admission.admitted || admission.status !== 'ADMITTED_TO_CANDIDATE_ORDINAL') blockers.push('FANOUT_ADMISSION_REQUIRED');
  if (!bundle.fanoutEligible) blockers.push('PRE_FANOUT_BUNDLE_NOT_ELIGIBLE');
  if (!candidate || candidate.candidateOrdinal !== bundle.candidateOrdinal) blockers.push('CANDIDATE_ORDINAL_MISMATCH');
  if (admission.snapshotId !== bundle.candidateSnapshotRevision && admission.candidateOrdinalMap?.candidateSnapshotRevision !== bundle.candidateSnapshotRevision) blockers.push('CANDIDATE_SNAPSHOT_REVISION_MISMATCH');
  if (admission.sourceRevision !== bundle.sourceRevision) blockers.push('SOURCE_REVISION_MISMATCH');
  if (admission.representationId !== bundle.semantic.representationId) blockers.push('REPRESENTATION_ID_MISMATCH');
  if (admission.representationRevision !== bundle.semantic.representationRevision) blockers.push('REPRESENTATION_REVISION_MISMATCH');
  if (admission.candidateOrdinalMap?.ordinalMapChecksum !== bundle.ordinalMapChecksum) blockers.push('ORDINAL_MAP_CHECKSUM_MISMATCH');
  if (bundle.identityAuthority || bundle.retrievalVoteProduced || bundle.canonicalWritesAllowed) blockers.push('PRE_FANOUT_AUTHORITY_FLAGS_INVALID');

  return { aligned: blockers.length === 0, blockers };
}
