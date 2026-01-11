
import { aiService } from "$lib/server/services/ai-service.js";
import { URL } from "url";
import type { RequestHandler } from './$types';


const querySchema = z.object({
  query: z.string().min(1).max(5000),
  caseId: z.string().uuid().optional(),
  options: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(4000).optional(),
    includeContext: z.boolean().optional(),
    saveQuery: z.boolean().optional()
  }).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Check authentication
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse and validate request
    const body = await request.json();
    const validatedData = querySchema.parse(body);

    // Process AI query
    const result = await aiService.processQuery(
      validatedData.query,
      locals.user.id,
      validatedData.caseId,
      validatedData.options
    );

    return json({
      success: true,
      data: {
        response: result.response,
        confidence: result.confidence,
        contextUsed: result.contextUsed,
        queryId: result.queryId
      }
    });

  } catch (error: any) {
    console.error('AI query API error:', error);

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
        error: 'AI query processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
};

// Get similar queries for suggestions
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const query = url.searchParams.get('q');
    if (!query) {
      return json({ error: 'Query parameter required' }, { status: 400 });
    }

    // Generate embedding for the query
    const embedding = await aiService.getOrCreateEmbedding(query);
    
    // Find similar queries
    const similarQueries = await aiService.findSimilarQueries(
      embedding, 
      locals.user.id, 
      5
    );

    return json({
      success: true,
      data: {
        suggestions: similarQueries
      }
    });

  } catch (error: any) {
    console.error('Similar queries API error:', error);
    return json(
      { error: 'Failed to get query suggestions' }, 
      { status: 500 }
    );
  }
};