/**
 * Stage 6 — Qdrant Multi-query union
 * Union ANN over content vector for each variant.
 */

import { searchQdrantCode, type QdrantCodeResult } from '$lib/server/search/qdrant-search.js';
import { getBatchedEmbeddings } from './embed.js';

export interface QdrantUnionHit extends QdrantCodeResult {
    query_variant: string;
}

/**
 * Executes a multi-variant Qdrant search and returns a deduplicated union of hits.
 */
export async function getQdrantUnionHits(
    variants: string[],
    topKPerLane: number = 20
): Promise<QdrantUnionHit[]> {
    if (variants.length === 0) return [];

    // 1. Batch embed all variants
    const embeddings = await getBatchedEmbeddings(variants);
    
    // 2. Parallel search for each variant
    const searchPromises = variants.map((variant, i) => {
        const emb = embeddings[i];
        if (!emb) return Promise.resolve([]);
        return searchQdrantCode(emb, topKPerLane).then(results => 
            results.map(r => ({ ...r, query_variant: variant }))
        );
    });

    const resultsByVariant = await Promise.all(searchPromises);
    
    // 3. Deduplicate by stable_key
    const seen = new Set<string>();
    const union: QdrantUnionHit[] = [];

    for (const variantResults of resultsByVariant) {
        for (const hit of variantResults) {
            if (!seen.has(hit.stable_key)) {
                seen.add(hit.stable_key);
                union.push(hit);
            }
        }
    }

    return union.sort((a, b) => b.semantic_score - a.semantic_score);
}
