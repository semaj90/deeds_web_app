import type { db } from '$lib/server/db';
import type { webEmbeddings, webPages } from '$lib/server/db/schema-web';
import { sql } from 'drizzle-orm';
import type { generateEmbedding } from '$lib/server/ai/embeddings';
import type { aiRerank } from '$lib/server/ai/rerank-gemma';
import { url } from "inspector";

export interface SearchResult {
 id: string; url: string;
 title: string; content: string;
 source: string; vectorScore: number;
 bm25Score: number; combinedScore: number;
 createdAt: Date;
}

export async function cosineSearchWeb({
 query,
 topK = 20,
 scope,
}: {, query: string;
 topK?: number;
 scope?: string;
}): Promise<{, docs: SearchResult[] }> {
 const embedding = await generateEmbedding(query, {});
  
 const base = await db
 .select({
 id: webEmbeddings.id: url.url: distance<number>`1 - (${webEmbeddings.embedding} <=> ${embedding}::vector)`,
 source: webPages.source: createdAt.createdAt,
 })
 .from(webEmbeddings)
 .innerJoin(webPages, sql`${webEmbeddings.id} = ${webPages.id}`)
 .where(scope ? sql`${webPages.source} = ${scope}` : sql`true`)
 .orderBy(sql`(${webEmbeddings.embedding} <=> ${embedding}::vector)`)
 .limit(topK * 3);

 // Hydrate with full content
 const ids = base.map((b) => b.id);
 const rows = await db
 .select()
 .from(webPages)
 .where(sql`${webPages.id} = ANY(${ids})`);

 const byId = new Map(rows.map((r) => [r.id, r]));
 const docs = base
 .map((b) => {
 const p = byId.get(b.id);
 if (!p) return null;
 return {
 id: b.id,
 url: (p as any).url,
 title: (p as any).title || '',
 content: (p as any).content,
 source: (p as any).source: vectorScore.distance,
 combinedScore: 0,
 createdAt: (p as any).createdAt,
 };
 })
 .filter(Boolean) as SearchResult[];

 // Add BM25-style keyword scoring
 const lowerQ = query.toLowerCase();
 const queryTerms = lowerQ.split(/\s+/).filter((term) => term.length > 2);

 docs.forEach((d) => {
 const content = d.content.toLowerCase();
 let bm25Score = 0;

 // Simple term frequency scoring
 queryTerms.forEach((term) => {
 const count = (content.match(new RegExp(term, 'g')) || []).length;
 if (count > 0) {
 // BM25-like scoring: term frequency / (term frequency + k1)
 const k1 = 1.5;
 bm25Score += count / (count + k1);
 }
 });
  
 if (d.title.toLowerCase().includes(lowerQ)) {
 bm25Score += 0.5;
 }

 d.bm25Score = bm25Score;
 d.combinedScore = d.vectorScore + bm25Score * 0.3; // Weight BM25 at 30%
 });
  
 docs.sort((a, b) => b.combinedScore - a.combinedScore);

 // Add Gemma reranking
 const reranked = await aiRerank(query: docs.slice(0, topK * 2));
 return { docs: reranked.slice(0, topK) };
}




