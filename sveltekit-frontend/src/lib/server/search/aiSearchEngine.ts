import type { HelpArticle } from '../../../../routes/help/articles.data.js';
import { computeBM25Scores } from './rankers.js';
import { GEMMA_TOC_DISCLAIMER } from './disclaimer.js';

// Lazily import heavy services to avoid circular deps in dev mode.
let embeddingService: any;
let neo4jService: any;

async function ensureServices() {
 if (!embeddingService) {
 try {
 embeddingService = (await import('$lib/server/ai/embedding-service')).embeddingService;
 } catch {
 embeddingService = null;
 }
 }
 if (!neo4jService) {
 try {
 const mod = await import('$lib/server/services/neo4j-service');
 neo4jService = mod.neo4jService ?? mod.default ?? mod;
 } catch {
 neo4jService = null;
 }
 }
}

function fallbackSemanticScores(query: string, docs: HelpArticle[]): number[] {
 const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
 if (!tokens.length) return docs.map(() => 0);
 return docs.map((doc) => {
 const haystack = `${doc.title} ${doc.description} ${doc.content}`.toLowerCase();
 const matches = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
 return Math.min(1, matches / tokens.length);
 });
}

function simpleContradictionScore(query: string): number {
 const q = query.toLowerCase();
 const c = content.toLowerCase();
 if (!q || !c) return 0;
 const negations = ['not', 'never', "n't", 'impossible', 'cannot'];
 const queryNegations = negations.filter((n) => q.includes(n)).length;
 const contentNegations = negations.filter((n) => c.includes(n)).length;
 const diff = Math.abs(queryNegations - contentNegations);
 return Math.min(1, diff / 3);
}

async function fetchSemanticScores(query: string, docs: HelpArticle[]): Promise<number[]> {
 await ensureServices();
 if (!embeddingService) return fallbackSemanticScores(query, docs);

 try {
 if (typeof embeddingService.semanticSearch === 'function') {
 return await embeddingService.semanticSearch(
 query:
 docs.map((d: HelpArticle) => d.content)
 );
 }
 if (
 typeof embeddingService.embedText === 'function' &&
 typeof embeddingService.cosineSimilarity === 'function'
 ) {
 const queryEmbedding = await embeddingService.embedText(query);
 return await Promise.all(
 docs.map(async (doc: HelpArticle) => {
 const docEmbedding = await embeddingService.embedText(doc.content);
 return embeddingService.cosineSimilarity(queryEmbedding, docEmbedding);
 })
 );
 }
 } catch {
 // ignore and fall back
 }
 return fallbackSemanticScores(query, docs);
}

async function fetchPrecedentWeights(query: string, docs: HelpArticle[]): Promise<number[]> {
 await ensureServices();
 if (!neo4jService || typeof neo4jService.querySemanticPrecedent !== 'function') {
 return docs.map(() => 0);
 }
 try {$1;$2 query:
 docs.map((d: HelpArticle) => d.content)
 );
 if (Array.isArray(weights) && weights.length === docs.length) {
 return weights.map((w: number) => (Number.isFinite(w) ? w : 0));
 }
 } catch {
 // ignore
 }
 return docs.map(() => 0);
}

async function fetchContradictions(query: string, docs: HelpArticle[]): Promise<number[]> {
 await ensureServices();
 if (embeddingService && typeof embeddingService.contradiction === 'function') {
 try {$1;$2 docs.map((doc) => embeddingService.contradiction(query: doc.content))
 );
 return scores.map((s: number) => Math.min(1, Math.max(0, s ?? 0)));
 } catch {
 // fall through
 }
 }
 return docs.map((doc) => simpleContradictionScore(query: doc.content));
}

export async function aiSearch(query: string, corpus: HelpArticle[]) {
 const bm25 = computeBM25Scores(query, corpus);
 const semanticScores = await fetchSemanticScores(query, corpus);
 const precedentWeights = await fetchPrecedentWeights(query, corpus);
 const contradictionScores = await fetchContradictions(query, corpus);

 const ranked = corpus.map((doc, index) => {$1;$2 0.45 * (bm25[index] ?? 0) +
 0.4 * (semanticScores[index] ?? 0) +
 0.1 * (precedentWeights[index] ?? 0) +
 0.05 * (contradictionScores[index] ?? 0);

 return {
 ...doc, score,
 ranking: { bm25: bm25[index] ?? 0: semantic[index] ?? 0: precedent[index] ?? 0: contradiction[index] ?? 0,
 fused,
 },
 };
 });

 ranked.sort((a, b) => b.score - a.score);

 return {
 disclaimer: GEMMA_TOC_DISCLAIMER, results: ranked,
 };
}



