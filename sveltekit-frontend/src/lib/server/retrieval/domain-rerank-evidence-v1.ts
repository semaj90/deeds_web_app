import { z } from 'zod';

import { normalizeDomainLabel } from '../atlas/domain-taxonomy.js';
import type { FeatureEnvelope } from './feature-envelope.js';
import type { DomainClassMatchV1 } from './domain-class-match-v1.js';
import type { RerankCandidate } from './runtime-reranker.js';

export const DomainRerankEvidenceV1Schema = z.object({
  schema: z.literal('atlas.domain-rerank-evidence.v1'),
  domainClass: z.string().min(1).nullable(),
  labelSource: z.enum(['feature_envelope_domain_class', 'feature_envelope_domain', 'missing']),
  classifierVersion: z.string().min(1).nullable(),
  classifierSource: z.string().min(1).nullable(),
  domainScore: z.number().min(0).max(1).nullable(),
  domainClassMatch: z.number().min(0).max(1).nullable(),
  domainClassMatchEligible: z.boolean(),
  rankingEligible: z.boolean(),
  trainingEligible: z.boolean(),
  blockers: z.array(z.enum([
    'DOMAIN_LABEL_MISSING',
    'DOMAIN_CLASSIFIER_LINEAGE_MISSING',
    'QUERY_DOMAIN_MISSING',
    'DOMAIN_SCORE_PRODUCER_MISSING',
  ])),
});

export type DomainRerankEvidenceV1 = z.infer<typeof DomainRerankEvidenceV1Schema>;

type DomainEvidenceEnvelope = FeatureEnvelope & {
  domain_classifier_version?: string | null;
  classifier_version?: string | null;
  domain_class_source?: string | null;
};

/**
 * Read domain evidence already present on a FeatureEnvelope.
 *
 * This adapter does not classify text. SearchRuntime promotion classification
 * is owned by atlas/domain-taxonomy.ts, and this read boundary must not create
 * a second classifier owner.
 *
 * A categorical label is useful evidence, but it is not automatically a
 * numeric rerank feature. Until classifier lineage and a query-domain match are
 * present, domainScore/domainClassMatch remain null and cannot affect ranking.
 */
export function extractDomainRerankEvidenceV1(
  envelope: DomainEvidenceEnvelope,
): DomainRerankEvidenceV1 {
  const explicitDomainClass = typeof envelope.domain_class === 'string'
    ? envelope.domain_class.trim()
    : '';
  const rawDomain = typeof envelope.domain === 'string' ? envelope.domain.trim() : '';

  const normalized = normalizeDomainLabel(explicitDomainClass || rawDomain || null);
  const domainClass = normalized.canonical ?? normalized.fallback;
  const labelSource = explicitDomainClass
    ? 'feature_envelope_domain_class'
    : rawDomain
      ? 'feature_envelope_domain'
      : 'missing';

  const classifierVersion =
    envelope.domain_classifier_version?.trim() ||
    envelope.classifier_version?.trim() ||
    null;
  const classifierSource = envelope.domain_class_source?.trim() || null;

  const blockers: DomainRerankEvidenceV1['blockers'] = [];
  if (!domainClass) blockers.push('DOMAIN_LABEL_MISSING');
  if (!classifierVersion || !classifierSource) blockers.push('DOMAIN_CLASSIFIER_LINEAGE_MISSING');
  blockers.push('QUERY_DOMAIN_MISSING');
  blockers.push('DOMAIN_SCORE_PRODUCER_MISSING');

  return DomainRerankEvidenceV1Schema.parse({
    schema: 'atlas.domain-rerank-evidence.v1',
    domainClass,
    labelSource,
    classifierVersion,
    classifierSource,
    domainScore: null,
    domainClassMatch: null,
    domainClassMatchEligible: false,
    rankingEligible: false,
    trainingEligible: false,
    blockers,
  });
}

/**
 * Compose a proven query-domain comparison into observational domain evidence.
 *
 * This is deliberately a shadow/training boundary, not a live ranking-policy
 * promotion. A valid domainClassMatch can become training/evaluation evidence
 * while `rankingEligible` remains false because `domainScore` still has no
 * explicit producer and the canonical domain blend weight remains zero.
 */
export function composeDomainRerankEvidenceV1(
  envelope: DomainEvidenceEnvelope,
  comparison: DomainClassMatchV1,
): DomainRerankEvidenceV1 {
  const base = extractDomainRerankEvidenceV1(envelope);

  const samePacket = comparison.candidatePacketKey === (envelope.packet_key ?? '');
  const sameDomain = comparison.candidateDomainClass === base.domainClass;
  const classifierLineagePresent = Boolean(base.classifierVersion && base.classifierSource);
  const matchEligible = Boolean(
    comparison.featureEligible &&
    samePacket &&
    sameDomain &&
    classifierLineagePresent &&
    comparison.domainClassMatch !== null,
  );

  const blockers = base.blockers.filter((blocker) =>
    blocker !== 'QUERY_DOMAIN_MISSING' || !matchEligible,
  );

  return DomainRerankEvidenceV1Schema.parse({
    ...base,
    domainClassMatch: matchEligible ? comparison.domainClassMatch : null,
    domainClassMatchEligible: matchEligible,
    // The domain blend itself remains shadow-only until frozen evaluation.
    rankingEligible: false,
    // A lineage-qualified match is safe to export as a candidate feature for
    // frozen training/evaluation even though live ranking promotion is blocked.
    trainingEligible: matchEligible,
    blockers,
  });
}

export const RerankPolicyFeatureProjectionV1Schema = z.object({
  rewardPrior: z.number().min(0).max(1).nullable(),
  domainClassMatch: z.number().min(0).max(1).nullable(),
});

export type RerankPolicyFeatureProjectionV1 = z.infer<typeof RerankPolicyFeatureProjectionV1Schema>;

/**
 * Keep historical reward and query/domain agreement orthogonal.
 * Missing values stay missing; callers may choose an explicit model-specific
 * neutral value only at the final model transport boundary.
 */
export function projectRerankPolicyFeaturesV1(
  candidate: Pick<RerankCandidate, 'rewardPrior' | 'domainClassMatch'>,
): RerankPolicyFeatureProjectionV1 {
  return RerankPolicyFeatureProjectionV1Schema.parse({
    rewardPrior: candidate.rewardPrior ?? null,
    domainClassMatch: candidate.domainClassMatch ?? null,
  });
}
