/**
 * Keyword-based domain classification for AST enrichment.
 * Maps source_ref text to semantic domains for XGBoost feature extraction.
 */

import { z } from 'zod';
import type { Domain } from './ast-keyword-types.js';
import {
  CANONICAL_DOMAINS,
  classifyDomainTaxonomy,
} from '../atlas/domain-taxonomy.js';

export const domainClassificationSchema = z.object({
  domain: z.enum(['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general']),
  confidence: z.number().finite().min(0).max(1),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});

export type DomainClassification = z.infer<typeof domainClassificationSchema>;

export function classifyDomainFromText(text: string): DomainClassification {
  const classification = classifyDomainTaxonomy({ summary: text });
  const counts = Object.fromEntries(CANONICAL_DOMAINS.map((domain) => [domain, 0])) as Record<Domain, number>;
  const primary = classification.primary_domain ?? classification.fallback_label ?? 'general';
  counts[primary as Domain] = 1;
  for (const secondary of classification.secondary_domains) {
    counts[secondary as Domain] = Math.max(counts[secondary as Domain] ?? 0, 1);
  }

  return domainClassificationSchema.parse({
    domain: primary as Domain,
    confidence: classification.confidence,
    counts,
  });
}
