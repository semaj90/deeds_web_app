/**
 * Knowledge Search API Endpoint
 * POST /api/knowledge/search
 *
 * Accepts search queries and returns ranked results with scores.
 * Supports LLM synthesis and tag filtering.
 *
 * Requirements: 8.1
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search';
import type { SearchRequest } from '$lib/services/knowledge-search/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as SearchRequest;

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate query length
    if (body.query.trim().length === 0) {
      return json(
        { error: 'Query cannot be empty' },
        { status: 400 }
      );
    }

    if (body.query.length > 500) {
      return json(
        { error: 'Query too long (max 500 characters)' },
        { status: 400 }
      );
    }

    // Validate topK
    if (body.topK !== undefined) {
      if (typeof body.topK !== 'number' || body.topK < 1 || body.topK > 100) {
        return json(
          { error: 'topK must be a number between 1 and 100' },
          { status: 400 }
        );
      }
    }

    // Validate llmProvider
    if (body.llmProvider !== undefined) {
      const validProviders = ['ollama', 'gemini', 'claude'];
      if (!validProviders.includes(body.llmProvider)) {
        return json(
          { error: `llmProvider must be one of: ${validProviders.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Execute search
    const searcher = getKnowledgeSearcher();
    const startTime = Date.now();

    const results = await searcher.search(body.query, {
      topK: body.topK,
      threshold: 0.5, // Default threshold
      filters: body.filters,
      includeContent: body.includeContent,
      synthesize: body.synthesize,
      llmProvider: body.llmProvider
    });

    const queryTime = Date.now() - startTime;

    // Return results with metadata
    return json({
      success: true,
      query: body.query,
      results,
      metadata: {
        queryTime,
        totalResults: results.length,
        synthesized: body.synthesize || false,
        llmProvider: body.llmProvider || 'ollama'
      }
    });
  } catch (error) {
    console.error('Search API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Ollama')) {
        return json(
          { error: 'LLM service unavailable', details: error.message },
          { status: 503 }
        );
      }

      if (error.message.includes('Qdrant')) {
        return json(
          { error: 'Search service unavailable', details: error.message },
          { status: 503 }
        );
      }
    }

    return json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
};
