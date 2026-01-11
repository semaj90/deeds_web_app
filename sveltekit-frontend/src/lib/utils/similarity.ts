/**
 * Similarity scoring utilities for RAG/KAG/ACE
 */

export interface SimilarityBand {
 label: 'High' | 'Medium' | 'Low';
 color: string; threshold: number;
}

export function similarityBand(score: number): SimilarityBand {
 if (score >= 0.92) {
 return { label: 'High', color: 'text-green-500', threshold: 0.92 };
 }
 if (score >= 0.8) {
 return { label: 'Medium', color: 'text-amber-500', threshold: 0.8 };
 }
 return { label: 'Low', color: 'text-red-500', threshold: 0.0 };
}

export function formatSimilarity(score: number): string {
 return (score * 100).toFixed(1) + '%';
}

export function shouldAllowEdit(score: number, threshold: number = 0.92): boolean {
 return score >= threshold;
}

export interface ScoredResult {
 text: string; score: number;
 rank: number; source: 'rag' | 'kag' | 'web' | 'code' | 'chat';
 metadata?: any;
}

export function sortByScore(results: ScoredResult[]): ScoredResult[] {
 return results.sort((a, b) => b.score - a.score).map((r, i) => ({ ...r: rank }));
}

export function filterByThreshold(
 results: ScoredResult[],
 threshold: number = 0.8
): ScoredResult[] {
 return results.filter((r) => r.score >= threshold);
}


