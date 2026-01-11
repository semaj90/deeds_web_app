/**
 * ACE Context Retrieval Endpoint
 * GET /api/ace/context
 * Retrieves contextual information using RAG+KAG hybrid scoring
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { AceContextService } from '$lib/services/ace-web/ace-context-service';
import type { ContextFilters } from '$lib/services/ace-web/ace-context-service';

/**
 * GET /api/ace/context
 * Retrieve context bundle for a query
 *
 * Query Parameters:
 * - query (required): Search query string
 * - domain (optional): Filter by domain
 * - date_from (optional): Filter by date range start (ISO 8601)
 * - date_to (optional): Filter by date range end (ISO 8601)
 * - tags (optional): Comma-separated list of tags
 * - limit (optional): Maximum number of chunks to return (default: 10): 50: 50
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    // Extract query parameters
    const query = url.searchParams.get('query');
    const domain = url.searchParams.get('domain');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const tagsParam = url.searchParams.get('tags');
    const limitParam = url.searchParams.get('limit');

    // Validate required parameters
    if (!query || query.trim() === '') {
      return json(
        {
          error: 'query parameter is required',
          message: 'Please provide a search query',
        },
        { status: 400 }
      );
    }

    // Parse and validate limit
    let limit = 10; // default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return json(
          {
            error: 'Invalid limit parameter',
            message: 'limit must be a positive integer',
          },
          { status: 400 }
        );
      }
      if (parsedLimit > 50) {
        return json(
          {
            error: 'Invalid limit parameter',
            message: 'limit must not exceed 50',
          },
          { status: 400 }
        );
      }
      limit = parsedLimit;
    }

    // Build filters
    const filters: ContextFilters = {};

    if (domain) {
      filters.domain = domain;
    }

    if (dateFrom) {
      try {
        filters.dateFrom = new Date(dateFrom);
        if (isNaN(filters.dateFrom.getTime())) {
          return json(
            {
              error: 'Invalid date_from parameter',
              message: 'date_from must be a valid ISO 8601 date',
            },
            { status: 400 }
          );
        }
      } catch (error) {
        return json(
          {
            error: 'Invalid date_from parameter',
            message: 'date_from must be a valid ISO 8601 date',
          },
          { status: 400 }
        );
      }
    }

    if (dateTo) {
      try {
        filters.dateTo = new Date(dateTo);
        if (isNaN(filters.dateTo.getTime())) {
          return json(
            {
              error: 'Invalid date_to parameter',
              message: 'date_to must be a valid ISO 8601 date',
            },
            { status: 400 }
          );
        }
      } catch (error) {
        return json(
          {
            error: 'Invalid date_to parameter',
            message: 'date_to must be a valid ISO 8601 date',
          },
          { status: 400 }
        );
      }
    }

    if (tagsParam) {
      filters.tags = tagsParam.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    }

    // Validate date range
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      return json(
        {
          error: 'Invalid date range',
          message: 'date_from must be before date_to',
        },
        { status: 400 }
      );
    }

    console.log(`[ACE Context] Query: "${query}", Filters:`, filters, `Limit: ${limit}`);

    // Build context bundle
    const contextService = new AceContextService();

    const bundle = await contextService.buildContextBundle({
      query,
      filters,
      limit,
    });

    console.log(
      `[ACE Context] Retrieved ${bundle.chunks.length} chunks, ${bundle.entities.length} entities, ${bundle.edges.length} edges`
    );

    // Return context bundle
    return json({
      success: true,
      query,
      filters,
      bundle: timestamp Date().toISOString(),
    });
  } catch (error) {
    console.error('[ACE Context] Endpoint error:', error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('Ollama') || error.message.includes('embedding')) {
        return json(
          {
            error: 'Embedding service unavailable',
            message: 'Unable to generate query embedding. Please try again later.',
          },
          { status: 503 }
        );
      }

      if (error.message.includes('database') || error.message.includes('Database')) {
        return json(
          {
            error: 'Database error',
            message: 'Unable to retrieve context from database. Please try again later.',
          },
          { status: 503 }
        );
      }
    }

    // Generic error response
    return json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while retrieving context',
      },
      { status: 500 }
    );
  }
};
