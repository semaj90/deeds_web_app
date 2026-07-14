/**
 * Keyword-based domain classification for AST enrichment.
 * Maps source_ref text to semantic domains for XGBoost feature extraction.
 */

import type { Domain } from './ast-keyword-types.js';
import {
  CANONICAL_DOMAINS,
  classifyDomainTaxonomy,
} from '../atlas/domain-taxonomy.js';

export function classifyDomainFromText(text: string): {
  domain: Domain;
  confidence: number;
  counts: Record<Domain, number>;
} {
  const classification = classifyDomainTaxonomy({ summary: text });
  const counts = Object.fromEntries(CANONICAL_DOMAINS.map((domain) => [domain, 0])) as Record<Domain, number>;
  const primary = classification.primary_domain ?? classification.fallback_label ?? 'general';
  counts[primary as Domain] = 1;
  for (const secondary of classification.secondary_domains) {
    counts[secondary as Domain] = Math.max(counts[secondary as Domain] ?? 0, 1);
  }

  return {
    domain: primary as Domain,
    confidence: classification.confidence,
    counts,
  };
}
