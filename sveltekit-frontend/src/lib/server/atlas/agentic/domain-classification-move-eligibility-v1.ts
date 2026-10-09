import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { DomainClassificationV1Schema } from '../contracts/semantic-signal-v1.js';
import type { ViterbiFrame } from '../../analysis/k-best-viterbi.js';
import { CapabilityRegistryV1Schema, type CapabilityRegistryV1 } from './agent-execution-spine-v1.js';

const RevisionSchema = z.string().min(1);

export const DomainMoveEligibilityPolicyV1Schema = z.object({
  schema: z.literal('atlas.domain-move-eligibility-policy.v1'),
  moveId: z.string().min(1),
  capabilityId: z.string().min(1),
  policyRevision: RevisionSchema,
  classifierRevision: RevisionSchema,
  workspaceRevision: RevisionSchema,
  allowedDomainIds: z.array(z.string().min(1)).min(1).max(64),
  confidenceFloor: z.number().finite().min(0).max(1),
}).strict();

export type DomainMoveEligibilityPolicyV1 = z.infer<typeof DomainMoveEligibilityPolicyV1Schema>;

export const DomainMoveEligibilityDecisionV1Schema = z.object({
  schema: z.literal('atlas.domain-move-eligibility-decision.v1'),
  moveId: z.string().min(1),
  capabilityId: z.string().min(1),
  policyRevision: RevisionSchema,
  classifierRevision: RevisionSchema.nullable(),
  workspaceRevision: RevisionSchema.nullable(),
  domainId: z.string().min(1).nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  status: z.enum(['ELIGIBLE', 'BELOW_CONFIDENCE_FLOOR', 'DOMAIN_NOT_ALLOWED', 'NOT_PROVEN']),
  canonicalAuthority: z.literal(false),
  authorizationGranted: z.literal(false),
  decisionChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export type DomainMoveEligibilityDecisionV1 = z.infer<typeof DomainMoveEligibilityDecisionV1Schema>;

export interface CapabilityMoveEligibilityCandidateV1 {
  capabilityId: string;
  capabilityRevision: string;
  capabilityRegistryRevision: string;
  toolId: string;
  toolRevision: string;
  mutationClass: string;
  eligibilityStatus: DomainMoveEligibilityDecisionV1['status'] | 'NOT_APPLICABLE';
  eligibilityDecisionChecksum: string | null;
  canonicalAuthority: false;
  authorizationGranted: false;
}

export function evaluateDomainMoveEligibilityV1(input: {
  classification: unknown;
  policy: unknown;
}): DomainMoveEligibilityDecisionV1 {
  const policyResult = DomainMoveEligibilityPolicyV1Schema.safeParse(input.policy);
  const classificationResult = DomainClassificationV1Schema.safeParse(input.classification);

  const policy = policyResult.success ? policyResult.data : null;
  const classification = classificationResult.success ? classificationResult.data : null;
  const moveId = policy?.moveId ?? 'unresolved';
  const capabilityId = policy?.capabilityId ?? 'unresolved';
  const policyRevision = policy?.policyRevision ?? 'unresolved';
  const domainId = classification?.primary_label ?? null;
  const confidence = classification?.confidence ?? null;
  const evidenceRefs = classification?.evidence_refs.map((ref) => ref.source_ref) ?? [];

  let status: DomainMoveEligibilityDecisionV1['status'] = 'NOT_PROVEN';
  if (
    policy &&
    classification &&
    classification.model_revision_state === 'PROVEN' &&
    classification.producer_revision === policy.classifierRevision &&
    classification.workspace_revision === policy.workspaceRevision &&
    domainId !== null &&
    classification.labels.some((label) => label.label === domainId)
  ) {
    if (!policy.allowedDomainIds.includes(domainId)) {
      status = 'DOMAIN_NOT_ALLOWED';
    } else if (confidence < policy.confidenceFloor) {
      status = 'BELOW_CONFIDENCE_FLOOR';
    } else {
      status = 'ELIGIBLE';
    }
  }

  const body = {
    schema: 'atlas.domain-move-eligibility-decision.v1' as const,
    moveId,
    capabilityId,
    policyRevision,
    classifierRevision: classification?.producer_revision ?? null,
    workspaceRevision: classification?.workspace_revision ?? null,
    domainId,
    confidence,
    evidenceRefs,
    status,
    canonicalAuthority: false as const,
    authorizationGranted: false as const,
  };

  return DomainMoveEligibilityDecisionV1Schema.parse({
    ...body,
    decisionChecksum: `sha256:${canonicalSha256V1(body)}`,
  });
}

export function composeDomainMoveEligibilityEmissionV1(input: {
  baseEmissionScore: number;
  decision: DomainMoveEligibilityDecisionV1;
  maximumBoost?: number;
}): {
  baseEmissionScore: number;
  emissionScore: number;
  eligibilityStatus: DomainMoveEligibilityDecisionV1['status'];
  featureAvailable: boolean;
  featureUnavailableReason: 'MOVE_NOT_ELIGIBLE' | 'NOT_APPLICABLE' | null;
  decisionChecksum: string;
  canonicalAuthority: false;
  authorizationGranted: false;
} {
  if (!Number.isFinite(input.baseEmissionScore)) throw new Error('VITERBI_BASE_EMISSION_MUST_BE_FINITE');
  const decision = DomainMoveEligibilityDecisionV1Schema.parse(input.decision);
  const maximumBoost = input.maximumBoost ?? 0.05;
  if (!Number.isFinite(maximumBoost) || maximumBoost < 0 || maximumBoost > 0.1) {
    throw new Error('VITERBI_DOMAIN_ELIGIBILITY_BOOST_OUT_OF_BOUNDS');
  }

  const featureAvailable = decision.status === 'ELIGIBLE';
  const boost = featureAvailable ? maximumBoost * (decision.confidence ?? 0) : 0;

  return {
    baseEmissionScore: input.baseEmissionScore,
    emissionScore: input.baseEmissionScore + boost,
    eligibilityStatus: decision.status,
    featureAvailable,
    featureUnavailableReason: featureAvailable ? null : decision.status === 'NOT_PROVEN' ? 'NOT_APPLICABLE' : 'MOVE_NOT_ELIGIBLE',
    decisionChecksum: decision.decisionChecksum,
    canonicalAuthority: false,
    authorizationGranted: false,
  };
}

export function compileCapabilityMoveEligibilityFrameV1(input: {
  observationRevision: string;
  registry: CapabilityRegistryV1;
  baseEmissionScores: Readonly<Record<string, number>>;
  decision?: DomainMoveEligibilityDecisionV1 | null;
  maximumBoost?: number;
}): ViterbiFrame<CapabilityMoveEligibilityCandidateV1> {
  if (!input.observationRevision.trim()) throw new Error('VITERBI_OBSERVATION_REVISION_REQUIRED');
  const registry = CapabilityRegistryV1Schema.parse(input.registry);
  const capabilityIds = registry.entries.map((entry) => entry.capabilityId);
  if (new Set(capabilityIds).size !== capabilityIds.length) throw new Error('CAPABILITY_REGISTRY_DUPLICATE_CAPABILITY_ID');
  const scoreIds = Object.keys(input.baseEmissionScores);
  if (scoreIds.length !== capabilityIds.length || capabilityIds.some((id) => !Object.hasOwn(input.baseEmissionScores, id))) {
    throw new Error('VITERBI_BASE_EMISSION_CAPABILITY_SET_MISMATCH');
  }
  for (const [capabilityId, score] of Object.entries(input.baseEmissionScores)) {
    if (!Number.isFinite(score)) throw new Error(`VITERBI_BASE_EMISSION_MUST_BE_FINITE:${capabilityId}`);
  }

  const decision = input.decision == null ? null : DomainMoveEligibilityDecisionV1Schema.parse(input.decision);
  if (decision && !verifyDomainMoveEligibilityDecisionV1(decision)) {
    throw new Error('DOMAIN_MOVE_ELIGIBILITY_CHECKSUM_MISMATCH');
  }
  if (decision && !capabilityIds.includes(decision.capabilityId)) {
    throw new Error('DOMAIN_MOVE_ELIGIBILITY_CAPABILITY_NOT_IN_REGISTRY');
  }

  const maximumBoost = input.maximumBoost ?? 0.05;
  if (!Number.isFinite(maximumBoost) || maximumBoost < 0 || maximumBoost > 0.1) {
    throw new Error('VITERBI_DOMAIN_ELIGIBILITY_BOOST_OUT_OF_BOUNDS');
  }

  return {
    revision: input.observationRevision,
    candidates: registry.entries.map((entry) => {
      const applies = decision !== null && decision.capabilityId === entry.capabilityId;
      const boost = applies && decision.status === 'ELIGIBLE' ? maximumBoost * (decision.confidence ?? 0) : 0;
      return {
        id: entry.capabilityId,
        value: {
          capabilityId: entry.capabilityId,
          capabilityRevision: entry.capabilityRevision,
          capabilityRegistryRevision: registry.registryRevision,
          toolId: entry.toolId,
          toolRevision: entry.toolRevision,
          mutationClass: entry.mutationClass,
          eligibilityStatus: applies ? decision.status : 'NOT_APPLICABLE',
          eligibilityDecisionChecksum: applies ? decision.decisionChecksum : null,
          canonicalAuthority: false,
          authorizationGranted: false,
        },
        emissionScore: input.baseEmissionScores[entry.capabilityId]! + boost,
      };
    }),
  };
}

export function verifyDomainMoveEligibilityDecisionV1(value: DomainMoveEligibilityDecisionV1): boolean {
  const parsed = DomainMoveEligibilityDecisionV1Schema.parse(value);
  const { decisionChecksum, ...body } = parsed;
  return decisionChecksum === `sha256:${canonicalSha256V1(body)}`;
}
