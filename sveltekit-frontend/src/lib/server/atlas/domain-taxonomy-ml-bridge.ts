/**
 * ML extension bridge for the canonical domain taxonomy (openspec/changes/parent-atlas-search-classifier-sidecar).
 *
 * `domain-taxonomy.ts`'s `classifyDomainTaxonomy()` stays pure and deterministic — this bridge
 * wraps it, additively appends a `source: 'learned'` label fed by the NLP sidecar's `classify`
 * pass, and never overrides `primary_domain`/`confidence`/`fallback_label` (those remain
 * deterministic-first, per design.md section 2's decision). Fail-open: if the sidecar or its
 * classify pass is unreachable/unavailable, this returns the exact same `DomainClassification`
 * `classifyDomainTaxonomy()` alone would have produced — no `'learned'` entries appended, no new
 * failure mode introduced into any of the 8 existing live callers of the pure function.
 */

import {
  classifyDomainTaxonomy,
  type DomainClassification,
  type DomainTaxonomyInput,
} from './domain-taxonomy.js';

function buildClassifyPassText(input: DomainTaxonomyInput): string {
  return [
    input.sourceRef,
    input.featureId,
    input.summary,
    input.title,
    input.symbol,
    ...(input.imports ?? []),
    ...(input.routes ?? []),
    ...(input.schema ?? []),
    ...(input.dependencies ?? []),
    ...(input.neighbors ?? []),
    ...(input.metadata ?? []),
  ]
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(' ');
}

export async function classifyDomainTaxonomyWithLearned(
  input: DomainTaxonomyInput,
): Promise<DomainClassification> {
  const deterministic = classifyDomainTaxonomy(input);

  const text = buildClassifyPassText(input);
  if (!text.trim()) return deterministic;

  try {
    const { createMiniforgeNlpSidecarClient } = await import('../nlp/miniforge-nlp-sidecar.js');
    const client = createMiniforgeNlpSidecarClient();
    const result = await client.analyze({
      text,
      sourceRef: input.sourceRef ?? undefined,
      passes: ['classify'],
    });

    const classifyPass = (result.pass_results ?? []).find((pass) => pass.family === 'classify');
    if (!classifyPass || classifyPass.status !== 'succeeded') return deterministic;

    const label = classifyPass.artifacts?.label;
    if (typeof label !== 'string' || !label.trim()) return deterministic;

    const score =
      typeof classifyPass.features?.logistic_regression_score === 'number'
        ? classifyPass.features.logistic_regression_score
        : typeof classifyPass.features?.naive_bayes_score === 'number'
          ? classifyPass.features.naive_bayes_score
          : 0;

    return {
      ...deterministic,
      labels: [
        ...deterministic.labels,
        {
          label,
          score,
          source: 'learned',
          evidence_kinds: ['semantic'],
        },
      ],
    };
  } catch {
    // Fail-open, per this bridge's own doc comment: any sidecar/network failure preserves
    // the exact deterministic-only result, never throws past this boundary.
    return deterministic;
  }
}
