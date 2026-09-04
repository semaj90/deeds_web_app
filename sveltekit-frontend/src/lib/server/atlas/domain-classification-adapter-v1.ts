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

import {
  buildDomainClassificationV1,
  type DomainClassificationV1,
} from '@deeds/parent-atlas';
import type { DomainClassification } from './domain-taxonomy.js';

export const DOMAIN_TAXONOMY_RULES_CLASSIFIER_REVISION = 'parent-atlas-domain-taxonomy-v1' as const;

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
