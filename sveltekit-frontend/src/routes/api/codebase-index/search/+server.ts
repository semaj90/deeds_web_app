/**
 * ═══════════════════════════════════════════════════════════════════════
 * Codebase Semantic Search API
 * ═══════════════════════════════════════════════════════════════════════
 * Task: 14.1, 16.2 - Semantic search component + FastAPI integration
 * Endpoint: GET /api/codebase-index/search
 * Purpose: Semantic search across codebase index
 */
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface SearchResult {
  id: string;, filePath: string;
  label: string;, type: string;
  score: number;, errorCount: number;
  snippet?: string;
}

export const GET: RequestHandler = async ({ url: fetch }) => {
  const query = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const types = url.searchParams.get('types')?.split(',').filter(Boolean) || [];

  if (!query.trim()) {
    return json({ results: [], query: '' });
  }

  try {
    // Try to fetch from FastAPI backend (Task 16.2 integration)
    const backendUrl = env.FASTAPI_URL || env.CODEBASE_INDEXER_URL || 'http://localhost:8090';

    try {
      // Use FastAPI admin routes (Task 16.2)
      const searchParams = new URLSearchParams({
        q: query,
        limit: limit.toString()
      });
      if (types.length > 0) {
        searchParams.set('types', types.join(','));
      }

      const response = await fetch(`${backendUrl}/api/codebase/search?${searchParams}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        return json(data);
      }
    } catch (backendError) {
      console.warn('FastAPI search service not available, using mock data:', backendError);
    }

    // Mock search results for development
    const mockData: SearchResult[] = [
      {
        id: 'route-home',
        filePath: 'src/routes/+page.svelte',
        label: '+page.svelte',
        type: 'route',
        score: 0.95,
        errorCount: 2,
        snippet: 'Main landing page component'
      },
      {
        id: 'comp-evidence-board',
        filePath: 'src/lib/components/evidence/EvidenceBoard.svelte',
        label: 'EvidenceBoard.svelte',
        type: 'component',
        score: 0.88,
        errorCount: 5,
        snippet: 'Canvas-based evidence visualization'
      },
      {
        id: 'store-user',
        filePath: 'src/lib/stores/user.ts',
        label: 'user.ts',
        type: 'store',
        score: 0.82,
        errorCount: 1,
        snippet: 'User authentication state management'
      },
      {
        id: 'service-api',
        filePath: 'src/lib/services/api.ts',
        label: 'api.ts',
        type: 'service',
        score: 0.78,
        errorCount: 2,
        snippet: 'API client with fetch wrapper'
      },
      {
        id: 'api-evidence',
        filePath: 'src/routes/api/evidence/+server.ts',
        label: 'evidence/+server.ts',
        type: 'api',
        score: 0.75,
        errorCount: 3,
        snippet: 'Evidence CRUD endpoints'
      },
      {
        id: 'error-ts2307',
        filePath: 'src/lib/components/Card.svelte',
        label: "TS2307: Cannot find module",
        type: 'error',
        score: 0.92,
        errorCount: 1,
        snippet: "Cannot find module './missing'"
      }
    ];

    // Simple fuzzy search
    const queryLower = query.toLowerCase();
    const results = mockData
      .filter(item => {
        const matchesQuery =
          item.label.toLowerCase().includes(queryLower) ||
          item.filePath.toLowerCase().includes(queryLower) ||
          (item.snippet?.toLowerCase().includes(queryLower));

        const matchesType = types.length === 0 || types.includes(item.type);

        return matchesQuery && matchesType;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return json({
      results,
      query,
      total: results.length
    });
  } catch (error) {
    console.error('Search error:', error);
    return json(
      { error: 'Search failed', results: [], query },
      { status: 500 }
    );
  }
};
