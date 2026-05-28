import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') || '';
  // In production: call Qdrant cosine search, then fetch Postgres cards by ids.
  const sample = {
    query: q,
    hits: [
      { id: 'card-1', score: 0.98 },
      { id: 'card-2', score: 0.86 },
    ],
    note: 'Stubbed Qdrant search results. Production should run a Qdrant semantic search and return card lookups.',
  };
  return new Response(JSON.stringify(sample), { headers: { 'content-type': 'application/json' } });
};
