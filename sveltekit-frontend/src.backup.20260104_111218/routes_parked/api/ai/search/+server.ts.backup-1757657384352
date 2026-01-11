
import { aiService } from "$lib/server/services/ai-service.js";
import { URL } from "url";
import type { RequestHandler } from './$types';


const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  documentType: z.string().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Check authentication
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse and validate request
    const body = await request.json();
    const { query, limit = 10, threshold = 0.7 } = searchSchema.parse(body);

    // Generate embedding for search query
    const queryEmbedding = await aiService.getOrCreateEmbedding(query);

    // Perform vector search
    const results = await aiService.findSimilarDocuments(
      queryEmbedding,
      limit,
      threshold
    );

    // Format results for response
    const formattedResults = results.map((result: any) => ({
      content: result.content,
      similarity: Math.round(result.similarity * 100) / 100,
      documentId: result.documentId,
      documentType: result.metadata.documentType || 'unknown',
      confidence: result.metadata.analysis?.confidence || null,
      tags: result.metadata.analysis?.tags || []
    }));

    return json({
      success: true,
      data: {
        query,
        results: formattedResults,
        totalResults: results.length,
        searchParams: {
          limit,
          threshold,
          embeddingModel: 'nomic-embed-text'
        }
      }
    });

  } catch (error: any) {
    console.error('Vector search API error:', error);

    if (error instanceof z.ZodError) {
      return json(
        { 
          error: 'Validation failed', 
          details: error.errors 
        }, 
        { status: 400 }
      );
    }

    return json(
      { 
        error: 'Vector search failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const threshold = parseFloat(url.searchParams.get('threshold') || '0.7');

    if (!query) {
      return json({ error: 'Query parameter required' }, { status: 400 });
    }

    // Generate embedding for search query
    const queryEmbedding = await aiService.getOrCreateEmbedding(query);

    // Perform vector search
    const results = await aiService.findSimilarDocuments(
      queryEmbedding,
      limit,
      threshold
    );

    return json({
      success: true,
      data: {
        query,
        results,
        totalResults: results.length
      }
    });

  } catch (error: any) {
    console.error('Vector search GET API error:', error);
    return json(
      { error: 'Vector search failed' }, 
      { status: 500 }
    );
  }
};