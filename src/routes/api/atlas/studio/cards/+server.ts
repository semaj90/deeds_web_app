import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  // Minimal stub: production should query Postgres RagCard / ClusterCard tables.
  const sample = {
    cards: [],
    note: 'This endpoint should query Postgres for RagCard / ClusterCard. Currently a stub.'
  };

  return new Response(JSON.stringify(sample), {
    headers: { 'content-type': 'application/json' }
  });
};
