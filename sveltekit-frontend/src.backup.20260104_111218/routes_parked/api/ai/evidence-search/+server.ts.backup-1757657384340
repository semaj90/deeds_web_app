import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { eq, sql, and, ne } from 'drizzle-orm';
import { evidence } from '$lib/server/db/unified-schema';
import { cache } from '$lib/server/cache/redis';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { embedding, limit = 5, caseId } = body;

    if (!embedding || !Array.isArray(embedding)) {
      return json({ error: 'Invalid embedding provided' }, { status: 400 });
    }

    // Create cache key for this search
    const cacheKey = `evidence_search:${JSON.stringify(embedding.slice(0, 10))}:${limit}:${caseId || 'all'}`;
    
    // Check Redis cache first
    const cachedResults = await cache.get(cacheKey);
    if (cachedResults) {
      console.log('🚀 Evidence search cache hit');
      return json(cachedResults);
    }

    // Convert the embedding array to a pgvector-compatible format
    const embeddingVector = `[${embedding.join(',')}]`;

    // Build the query to find similar evidence
    let query = db
      .select({
        id: evidence.id,
        file_name: evidence.file_name,
        file_path: evidence.file_path,
        ocr_content: evidence.ocr_content,
        ai_summary: evidence.ai_summary,
        case_id: evidence.case_id,
        created_at: evidence.created_at,
        similarity: sql<number>`1 - (${evidence.embedding_vector} <=> ${embeddingVector}::vector)`
      })
      .from(evidence)
      .where(
        and(
          // Only include evidence with embeddings
          sql`${evidence.embedding_vector} IS NOT NULL`,
          // Exclude current case if specified
          caseId ? ne(evidence.case_id, caseId) : undefined
        )
      )
      .orderBy(sql`${evidence.embedding_vector} <=> ${embeddingVector}::vector`)
      .limit(limit);

    const results = await query;

    const responseData = {
      results: results.map(item => ({
        id: item.id,
        fileName: item.file_name,
        filePath: item.file_path,
        ocrContent: item.ocr_content?.substring(0, 500) + '...', // Truncate for performance
        aiSummary: item.ai_summary,
        caseId: item.case_id,
        createdAt: item.created_at,
        similarity: item.similarity
      })),
      count: results.length
    };

    // Cache results for 5 minutes
    await cache.set(cacheKey, responseData, 5 * 60 * 1000);
    console.log('💾 Evidence search results cached');

    return json(responseData);

  } catch (error) {
    console.error('Evidence search error:', error);
    return json(
      { 
        error: 'Evidence search failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
};