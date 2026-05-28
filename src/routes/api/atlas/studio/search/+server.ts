import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') || '';
  // In production: call Qdrant cosine search, then fetch Postgres cards by ids.
  const sample = {
    query: q,
    hits: [],
    note: 'This endpoint should run a Qdrant semantic search and return card lookups.'
  };
  return new Response(JSON.stringify(sample), { headers: { 'content-type': 'application/json' } });
};
