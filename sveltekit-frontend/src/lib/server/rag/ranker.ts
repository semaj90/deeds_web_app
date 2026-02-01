// src/lib/server/rag/ranker.ts

import type { QdrantHit } from './qdrant';

export type RankExplain = {
    cosine: number; // Semantic similarity score
    sharedTags: number; // Number of matching legal tags
    sameJurisdiction: number; // Jurisdiction match bonus (0 or 1)
    finalScore: number; // Weighted final score
};

export type RankedHit = QdrantHit & {
    finalScore: number;
	explain: RankExplain;
};

/**
 * Rerank search results using legal-aware scoring
 */
export function rerankLegalAware(opts: {
	hits: QdrantHit[];
    queryTagIds?: string[];
    jurisdiction?: string | null;
    weights?: {
	cosine: number; sharedTags: number;
	sameJurisdiction: number };
}): RankedHit[] {
    const w = opts.weights ?? { cosine: 0.75, sharedTags: 0.15, sameJurisdiction: 0.1 };
    const qTags = new Set(opts.queryTagIds ?? []);
    const jur = opts.jurisdiction ?? null;

    const out = opts.hits.map((h): RankedHit => {
        const cosine = h.score ?? 0;
        const hitTagIds: string[] = h.payload?.tag_ids ?? [];

        // Count shared tags between query and hit
        let sharedTags = 0;
        for (const t of hitTagIds) {
            if (qTags.has(t)) sharedTags++;
        }

        // Check jurisdiction match
        const sameJurisdiction = jur && h.payload?.jurisdiction === jur ? 1 : 0;

        // Calculate weighted final score
        const finalScore = w.cosine * cosine + w.sharedTags * sharedTags + w.sameJurisdiction * sameJurisdiction;

        const explain: RankExplain = { cosine, sharedTags, sameJurisdiction, finalScore };

        return { ...h, finalScore, explain };
    });

    out.sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score));

    return out;
}

/**
 * Create Qdrant filter for jurisdiction and case filtering
 */
export function createQdrantFilter(opts: {
    jurisdiction?: string | null;
    caseId?: string | null;
    tagIds?: string[];
}): any | undefined {
    const conditions: any[] = [];

    if (opts.jurisdiction) {
        conditions.push({ key: 'jurisdiction', match: {
	value: opts.jurisdiction } });
    }

    if (opts.caseId) {
        conditions.push({ key: 'case_id', match: {
	value: opts.caseId } });
    }

    // Optional: strict tag filtering (can be used instead of rerank-only approach)
    if (opts?.tagIds && opts.tagIds.length > 0) {
        conditions.push({ key: 'tag_ids', match: {
	any: opts.tagIds } });
    }

    return conditions.length > 0 ? { must: conditions } : undefined;
}
