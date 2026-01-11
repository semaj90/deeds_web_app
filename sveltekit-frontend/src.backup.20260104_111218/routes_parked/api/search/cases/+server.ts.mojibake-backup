import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const GO_MICROSERVICE_URL = env.GO_MICROSERVICE_URL || 'http://localhost:8080';

/**
 * Search cases endpoint
 * POST /api/search/cases
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    // Validate request method
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    // Validate required fields
    const { query, limit = 10, offset = 0 } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return json({ error: 'Query is required and must be a non-empty string' }, { status: 400 });
    }

    if (query.length > 1000) {
      return json({ error: 'Query must be less than 1000 characters' }, { status: 400 });
    }

    // Validate limit and offset
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json({ error: 'Limit must be an integer between 1 and 100' }, { status: 400 });
    }

    if (!Number.isInteger(offset) || offset < 0) {
      return json({ error: 'Offset must be a non-negative integer' }, { status: 400 });
    }

    // Optional filters
    const filters: Record<string, string> = {};
    if (body.jurisdiction && typeof body.jurisdiction === 'string') {
      filters.jurisdiction = body.jurisdiction;
    }
    if (body.crime_category && typeof body.crime_category === 'string') {
      filters.crime_category = body.crime_category;
    }
    if (body.crime_classification && typeof body.crime_classification === 'string') {
      filters.crime_classification = body.crime_classification;
    }
    if (body.section_type && typeof body.section_type === 'string') {
      filters.section_type = body.section_type;
    }

    console.log('[API] Searching cases:', {
      query,
      limit,
      offset,
      filters,
    });

    // Call Go microservice
    const response = await fetch(`${GO_MICROSERVICE_URL}/search/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        offset,
        ...filters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] Go microservice error:', response.status, errorText);

      return json(
        {
          error: 'Search service error',
          details: errorText,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    console.log('[API] Search completed:', {
      total: result.total,
      chunks: result.chunks?.length || 0,
      executionTime: result.execution_time_ms,
    });

    return json(result);
  } catch (error) {
    console.error('[API] Error searching cases:', error);

    return json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

/**
 * GET endpoint for health check
 */
export const GET: RequestHandler = async () => {
  return json({ error: 'Use POST method to search cases' }, { status: 405 });
};
