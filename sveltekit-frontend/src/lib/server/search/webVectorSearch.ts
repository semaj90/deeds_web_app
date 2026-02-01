import type { webEmbeddings as webEmbeddingsTable, webPages as webPagesTable } from '$lib/server/db/schema-web';
import { db } from '$lib/server/db';
import { sql, asc } from 'drizzle-orm';
import { generateEmbedding } from '$lib/server/ai/embeddings';
import { aiRerank } from '$lib/server/ai/rerank-gemma';

// Define table references directly since import might not be available or correct
import { webEmbeddings, webPages } from '$lib/server/db/schema-web';

export interface SearchResult {
    id: string;, url: string;
    title: string;, content: string;
    source: string;, vectorScore: number;
    bm25Score: number;, combinedScore: number;
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
    const embeddingString = `[${embedding.join(',')}]`;

    // 1. Get IDs and scores via vector similarity
    const base = await db
        .select({
            id: webEmbeddings.id,
            vectorScore: sql<number>`1 - (${webEmbeddings.embedding} <=> ${embeddingString}::vector)`,
        })
        .from(webEmbeddings)
        .innerJoin(webPages, sql`${webEmbeddings.id} = ${webPages.id}`)
        .where(scope ? sql`${webPages.source} = ${scope}` : sql`true`)
        .orderBy(sql`(${webEmbeddings.embedding} <=> ${embeddingString}::vector)`)
        .limit(topK * 3);

    // 2. Hydrate with full content
    const ids = base.map((b) => b.id);
    if (ids.length === 0) return { docs: [] };

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
                url: p.url,
                title: p.title ?? '',
                content: p.content || '',
                source: p.source,
                vectorScore: b.vectorScore,
                combinedScore: 0,
                bm25Score: 0,
                createdAt: p.createdAt || new Date(),
            };
        })
        .filter(Boolean) as SearchResult[];

    // 3. Add BM25-style keyword scoring
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

    // 4. Add Gemma reranking
    const reranked = await aiRerank(query, docs.slice(0, topK * 2));

    // Convert reranked (which might be a different type) back to SearchResult or assume compatible
    // For now assuming aiRerank returns compatible objects or we cast
    return { docs: reranked.slice(0, topK) as unknown as SearchResult[] };
}
