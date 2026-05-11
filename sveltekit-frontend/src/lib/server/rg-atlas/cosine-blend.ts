/**
 * Stage 9 — Cosine final blend
 * Compute the final weighted blend for each hit. Pure function.
 */

import type { RankedHit } from './types.js';

/**
 * Weights from the spec:
 * final = 0.4·marco + 0.3·karpathy + 0.2·cos_query + 0.1·langextract
 */
export const DEFAULT_WEIGHTS = {
    marco: 0.4,
    karpathy: 0.3,
    cos: 0.2,
    lang: 0.1
};

/**
 * Compute the final weighted blend for each hit.
 */
export function cosineBlend(
    hits: Array<Omit<RankedHit, 'clusterId'> & { clusterId?: number }>,
    weights = DEFAULT_WEIGHTS
): RankedHit[] {
    const clamp = (n: number) => Math.max(0, Math.min(1, n));

    const result = hits.map(hit => {
        const s = hit.scores;
        const final = 
            weights.marco * clamp(s.marco) +
            weights.karpathy * clamp(s.karpathy) +
            weights.cos * clamp(s.qdrantCosine) +
            weights.lang * clamp(s.langExtract);
        
        return {
            ...hit,
            scores: {
                ...hit.scores,
                final
            },
            clusterId: hit.clusterId ?? -1
        } as RankedHit;
    });

    return result.sort((a, b) => b.scores.final - a.scores.final);
}
