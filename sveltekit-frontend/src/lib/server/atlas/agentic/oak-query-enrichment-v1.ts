import type { QueryClassificationV1 } from '../agentic-file-compiler/query-classifier.js';
import { resolveOakEvidenceV1 } from './oak-resolution-evidence-client.js';
import type { OakResolutionEvidenceV1 } from './contracts/oak-resolution-evidence-v1.js';

/**
 * AR-07 (openspec/changes/parent-atlas-agentic-repair-fabric).
 *
 * Additive, standalone enrichment step over an already-computed
 * QueryClassificationV1 (agentic-file-compiler/query-classifier.ts, live on
 * /api/search/hyperrag). Deliberately NOT called from inside
 * classifyAtlasQuery() itself -- that function is synchronous and lives on a
 * production route; adding a network call there would be a breaking change
 * to its execution model. This module is meant to be called AFTER
 * classification, by a caller that can afford the extra latency and wants
 * richer OAK evidence than the classifier's own narrow 4-keyword `domains`
 * regex provides.
 *
 * Bounded and best-effort: resolves at most `maxLabels` distinct labels
 * (domains + targetHints + symbols, deduped), each independently
 * fail-closed via resolveOakEvidenceV1 (never fabricates a CURIE). A
 * resolution failure for one label never blocks the others.
 */

const DEFAULT_MAX_LABELS = 8;

export interface QueryOakEnrichmentV1 {
  requestId: string;
  evidence: OakResolutionEvidenceV1[];
}

function candidateLabels(classification: QueryClassificationV1, maxLabels: number): string[] {
  const ordered = [
    ...classification.domains,
    ...classification.symbols,
    ...classification.targetHints,
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of ordered) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= maxLabels) break;
  }
  return result;
}

export async function enrichQueryClassificationWithOakV1(
  classification: QueryClassificationV1,
  opts: { maxLabels?: number; timeoutMs?: number } = {}
): Promise<QueryOakEnrichmentV1> {
  const maxLabels = opts.maxLabels ?? DEFAULT_MAX_LABELS;
  const labels = candidateLabels(classification, maxLabels);

  const evidence = await Promise.all(
    labels.map((label) => resolveOakEvidenceV1(label, { timeoutMs: opts.timeoutMs }))
  );

  return { requestId: classification.requestId, evidence };
}
