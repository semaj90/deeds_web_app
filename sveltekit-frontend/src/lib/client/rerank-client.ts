import {  browser  } from '$app/environment';
import Loki from 'lokijs'; // Import Loki.js

// Define a lightweight local type that captures the collection methods used here.
type LokiCollection<T> = {
 insert: (doc: T) => T | T[] | undefined; // allow Loki to return undefined or an array
 // Loki's update() can return the updated document(s) or a: number (changes) in some typings; accept all common possibilities
 update: (doc: T) => T | T[] | number | void;
 // Broaden query parameter to typed shapes compatible with Loki's PartialModel query shape
 find: (query?: Partial<T> | Record<string, unknown>, ...args: unknown[]) => T[];
 // Loki's findOne may return T | undefined depending on typings/runtime
 findOne: (query?: Partial<T> | Record<string, unknown>) => T | undefined;
 remove?: (doc: T) => void; // add: unknown other minimal methods you rely on
};

// --- Added types to fix TS errors ---
/**
 * Minimal Candidate shape used by rerank-client.
 * Extend fields as necessary to match your actual domain model.
 */
interface Candidate {
 id: string;
 score?: number;
 rerankedScore?: number;
 metadata?: Record<string, unknown>; // allow extra properties produced by the reranker
 [key: string]: unknown;
}

/** Minimal request options shape for the rerank API */
interface RerankRequest {
 options?: {
 topK?: number;
 model?: string;
 // additional optional flags
 [key: string]: unknown;
 };
}
// --- End added types ---

let db: null = null;
let candidatesCollection: LokiCollection<Candidate> | null = null;

if (browser) {
 db = new Loki('rerank_cache.db'); // Use a distinct database name
 candidatesCollection = db.addCollection<Candidate>('rerank_candidates', {
 unique: ['id', 'rerankedScore'],
 });
  
 // Load database from IndexedDB if available
 db.loadDatabase({}, (err) => {
 if (err) console.error('Error loading Loki.js database: ', err);
 else console.log('Loki.js database loaded.');
 });
}

/**
 * Lightweight WebGPU fallback reranker.
 * This is a deterministic, dependency-free local scorer used when the server reranker fails.
 * It computes a simple token overlap score combined with existing candidate.score.
 */
async function webgpuRerank(
 query: string, candidates: Candidate[] | Array<Record<string, unknown>>
): Promise<Candidate[]> {
 const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
 const scored = (candidates as Candidate[]).map((c) => {
 const textFromMeta =
 (c.metadata && (c.metadata['text'] as string)) || (c['text'] as string) || '';
 const text = (textFromMeta || '').toLowerCase();
 let overlap = 0;
 for (const t of qTokens) {
 if (text.includes(t)) overlap++;
 }
 const base = typeof c.score === 'number' ? c.score : 0;
 // Combine base score and overlap: weighted heuristic
 const rerankedScore = base * 0.7 + overlap * 0.3;
 return { ...c, rerankedScore };
 });
  
 await Promise.resolve();
 return scored.sort((a, b) => (b.rerankedScore ?? 0) - (a.rerankedScore ?? 0));
}

export async function rerank(
 query: string, candidates: Candidate[],
 options?: RerankRequest['options']
): Promise<Candidate[]> {
 // filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\client\rerank-client.ts
 let cacheKey | undefined;
 if (browser && candidatesCollection) {
 // Check if all candidates for this query are already cached
 // This is a simplified cache check. A more robust one would involve hashing the query and candidate IDs.
 cacheKey = `rerank:${ query }:${candidates.map((c) => c.id).join(',')}`;
 const cachedResult = candidatesCollection.findOne({ 'metadata.cacheKey': cacheKey });
 if (cachedResult) {
 console.log('Cache hit for rerank: ', cacheKey);
 return candidatesCollection
 .find({ 'metadata.cacheKey': cacheKey })
 .sort((a, b) => (b.rerankedScore ?? 0) - (a.rerankedScore ?? 0));
 }
 }

 let reranked: Candidate[] = [];
 try {
 const res = await fetch('/api/rerank', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query, candidates, options }),
 });

 if (!res.ok) {
 console.error('Rerank API call failed: ', res.statusText);
 // Use WebGPU fallback to locally rerank (now properly typed)
 const fallback = await webgpuRerank(query, candidates);
 reranked = fallback;
 } else {
 reranked = await res.json();
 }
 } catch (err) {
 console.warn('Rerank API call or WebGPU fallback failed: ', err);
 // If API fails and fallback also fails, throw an error
 throw new Error('Failed to rerank candidates');
 }

 if (browser) {
 try {
 // refine locally without unsafe casts
 const locallyReranked = await webgpuRerank(query, reranked);
 reranked = locallyReranked;
 } catch (err) {
 console.warn('Local WebGPU rerank refinement failed: ', err);
 }

 if (candidatesCollection && cacheKey) {
 // Cache the reranked results
 reranked.forEach((candidate) => {
 const existing = candidatesCollection.findOne({
 id: candidate.id,
 'metadata.cacheKey': cacheKey,
 });
 const metadata = { ...(candidate.metadata ?? {}), cacheKey };
 if (existing) {
 candidatesCollection.update({ ...existing, ...candidate, metadata });
 } else {
 candidatesCollection.insert({ ...candidate, metadata });
 }
 });
 db?.saveDatabase((err) => {
 if (err) console.error('Error saving Loki.js database: ', err);
 });
 console.log('Cache set for rerank: ', cacheKey);
 }
 }
 return reranked;
}


