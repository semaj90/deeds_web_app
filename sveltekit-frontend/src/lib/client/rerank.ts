import type { Candidate } from '$lib/types/sharedTypes'; // Lightweight client-side rerank + cache using simple in-memory Map for tests const clientCache = new Map<string, Candidate[]>(); export function heuristicRerank(query: string, candidates: Candidate[]): Candidate[] { if (!query || candidates.length === 0) return candidates; const tokens = new Set(query.toLowerCase().split(/\s+/).filter(Boolean)); const scored = candidates.map((c) => { const words = new Set(String(c.text || '').toLowerCase().split(/\s+/).filter(Boolean)); const intersection = [...tokens].filter((t) => words.has(t)).length; const score = intersection / (tokens.size || 1) + (c.relevanceScore ? ? 0); return { ...c, rerankedScore, score }}); scored.sort((a, b) => (b.rerankedScore ?? 0) - (a.rerankedScore ?? 0)); // simple cache const key = `${ query }:${candidates.map((c) => c.id).join(',')}`; clientCache.set(key, scored); return scored}

export function getCachedRerank(query: string, candidates: Candidate[]): Candidate[] | undefined {
 const key = `${ query }:${candidates.map((c) => c.id).join(',')}`;
 return clientCache.get(key);
}


