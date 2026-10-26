/**
 * DOMAIN-CLASSIFIER-OWNER-01 (parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Maps the existing, real, live `DomainClassification` output (from `domain-taxonomy.ts`'s
 * `classifyDomainTaxonomy()`/`classifyDomainTaxonomyWithLearned()`, 8 real live callers) into the
 * canonical per-executor `DomainClassificationV1` contract, WITHOUT rewriting or duplicating the
 * classifiers themselves -- they stay as-is, this is purely a shape adapter.
 *
 * Honest limitation, not silently worked around: `classifyDomainTaxonomyWithLearned()`
 * (`domain-taxonomy-ml-bridge.ts`) appends at most ONE merged `source: 'learned'` label, picking
 * whichever of `logistic_regression_domain_probability` / `naive_bayes_domain_probability` the
 * sidecar returned first (LR checked before NB) -- it does NOT currently record which specific
 * sklearn algorithm actually produced that score. `DomainClassificationV1.classifierFamily` is a
 * closed enum requiring exactly `'NAIVE_BAYES'` or `'LOGISTIC_REGRESSION'`, and this adapter
 * refuses to guess: `buildRulesDomainClassificationV1` (the RULES family, which IS fully
 * attributable from `labels[].source === 'deterministic'`) is implemented; a learned-family
 * builder is deliberately NOT implemented here until the bridge itself is extended to record
 * which algorithm won. Building a full DomainClassificationV1[] fan-out (rules + naive_bayes +
 * logistic_regression, all three) is left open, tracked in
 * openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md.
 */

import { z } from 'zod';
import {
  buildDomainClassificationV1,
  type DomainClassificationV1,
} from '@deeds/parent-atlas';
import { canonicalSha256V1 } from './prefill/canonical-hash-v1.js';
import {
  DomainClassificationV1Schema as OkfDomainClassificationV1Schema,
  OkfDomainClassificationBatchV1Schema,
  OkfDomainSubjectKindSchema,
  type DomainClassificationV1 as OkfDomainClassificationV1,
  type OkfDomainClassificationBatchV1,
} from './contracts/okf-cross-domain-v1.js';
import { CANONICAL_DOMAINS, DOMAIN_TAXONOMY_VERSION, type DomainClassification } from './domain-taxonomy.js';

export const DOMAIN_TAXONOMY_RULES_CLASSIFIER_REVISION = 'parent-atlas-domain-taxonomy-v1' as const;

export type OkfDomainClassificationCandidateV1 = {
  classification: DomainClassification;
  subjectRef: string;
  subjectKind: z.infer<typeof OkfDomainSubjectKindSchema>;
  sourceRevision: string;
};

export const OKF_DOMAIN_CLASSIFICATION_BATCH_MAX_CANDIDATES_V1 = 500;

function parseDomainClassificationBatchV1(
  input: unknown,
): OkfDomainClassificationBatchV1 {
  return OkfDomainClassificationBatchV1Schema.parse(input);
}

export function buildOkfDomainClassificationProposalArrayV1(input: {
  candidates: readonly OkfDomainClassificationCandidateV1[];
}): OkfDomainClassificationBatchV1 {
  if (input.candidates.length > OKF_DOMAIN_CLASSIFICATION_BATCH_MAX_CANDIDATES_V1) {
    throw new Error('OKF_DOMAIN_CLASSIFICATION_BATCH_LIMIT_EXCEEDED');
  }

  const identities = new Set<string>();
  const rows: OkfDomainClassificationV1[] = [];

  for (const candidate of input.candidates) {
    const identity = JSON.stringify([
      candidate.subjectKind,
      candidate.subjectRef.trim(),
      candidate.sourceRevision.trim(),
    ]);
    if (identities.has(identity)) throw new Error('OKF_DOMAIN_CLASSIFICATION_DUPLICATE_CANDIDATE');
    identities.add(identity);

    const batch = buildOkfDomainClassificationBatchV1(candidate);
    if (batch.status === 'UNAVAILABLE') {
      return parseDomainClassificationBatchV1({
        schema: 'atlas.okf.domain-classification-batch.v1',
        status: 'UNAVAILABLE',
        taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
        rows: [],
        reason: batch.reason,
        canonicalAuthority: false,
        writesPerformed: false,
      });
    }
    rows.push(...batch.rows);
  }

  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  rows.sort((left, right) => compare(left.subjectRef, right.subjectRef)
    || compare(left.subjectKind, right.subjectKind)
    || compare(left.domainId, right.domainId)
    || compare(left.classificationId, right.classificationId));

  return parseDomainClassificationBatchV1({
    schema: 'atlas.okf.domain-classification-batch.v1',
    status: rows.length > 0 ? 'PROPOSAL_ONLY' : 'UNAVAILABLE',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    rows,
    reason: rows.length > 0 ? null : 'NO_CANONICAL_DOMAIN_LABELS',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function buildOkfDomainClassificationBatchV1(input: {
  classification: DomainClassification;
  subjectRef: string;
  subjectKind: z.infer<typeof OkfDomainSubjectKindSchema>;
  sourceRevision: string;
}): OkfDomainClassificationBatchV1 {
  const subjectRef = input.subjectRef.trim();
  const sourceRevision = input.sourceRevision.trim();
  if (!subjectRef) throw new Error('OKF_DOMAIN_SUBJECT_REF_REQUIRED');
  if (!sourceRevision) throw new Error('OKF_DOMAIN_SOURCE_REVISION_REQUIRED');
  if (!/^sha256:[a-f0-9]{64}$/.test(sourceRevision)) throw new Error('OKF_DOMAIN_SOURCE_REVISION_INVALID');

  const evidenceRefs = [...new Set(input.classification.evidence
    .map((item) => item.source_ref?.trim())
    .filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
  if (evidenceRefs.length === 0) {
    return parseDomainClassificationBatchV1({
      schema: 'atlas.okf.domain-classification-batch.v1',
      status: 'UNAVAILABLE',
      taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
      rows: [],
      reason: 'CLASSIFICATION_EVIDENCE_REFS_MISSING',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  }

  const canonicalLabelSet = new Set<string>(CANONICAL_DOMAINS);
  const rows = input.classification.labels
    .filter((label) => label.source === 'deterministic' && canonicalLabelSet.has(label.label))
    .map((label) => {
      const producerRevision = input.classification.classifier_version || DOMAIN_TAXONOMY_RULES_CLASSIFIER_REVISION;
      const rowBody = {
        schemaVersion: 'atlas.okf.domain-classification.v1' as const,
        subjectRef,
        subjectKind: input.subjectKind,
        domainId: label.label,
        taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
        confidence: label.score,
        evidenceRefs,
        sourceRevision,
        producerId: 'domain-taxonomy:deterministic-rules',
        producerRevision,
        lifecycle: 'DERIVED' as const,
      };
      const classificationId = `okf-domain-classification:${canonicalSha256V1(rowBody)}`;
      return OkfDomainClassificationV1Schema.parse({ ...rowBody, classificationId });
    });

  return parseDomainClassificationBatchV1({
    schema: 'atlas.okf.domain-classification-batch.v1',
    status: rows.length > 0 ? 'PROPOSAL_ONLY' : 'UNAVAILABLE',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    rows,
    reason: rows.length > 0 ? null : 'NO_CANONICAL_DOMAIN_LABELS',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function buildRulesDomainClassificationV1(
  classification: DomainClassification,
  context: { canonicalId: string; sourceRevision: string },
): DomainClassificationV1 {
  const deterministicLabels = classification.labels.filter((label) => label.source === 'deterministic');

  const probabilities: Record<string, number> = {};
  for (const label of deterministicLabels) {
    probabilities[label.label] = label.score;
  }

  const predictedDomain = classification.primary_domain;
  if (predictedDomain !== null && !(predictedDomain in probabilities)) {
    // classifyDomainTaxonomy()'s own gate (confidence >= 0.55 AND bestScore >= 1.5) can pick a
    // primary_domain that the `ranked`/`labels` cutoff still included -- this should always hold
    // by construction, but assert rather than silently pass an inconsistent pair through.
    probabilities[predictedDomain] = classification.confidence;
  }

  return buildDomainClassificationV1({
    canonicalId: context.canonicalId,
    sourceRevision: context.sourceRevision,
    classifierFamily: 'RULES',
    classifierRevision: classification.classifier_version || DOMAIN_TAXONOMY_RULES_CLASSIFIER_REVISION,
    probabilities,
    predictedDomain,
    confidence: classification.confidence,
    evidenceRefs: classification.evidence
      .map((item) => item.source_ref)
      .filter((ref): ref is string => Boolean(ref)),
  });
}
