import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  // Minimal stub: return a few sample cards for the Studio UI.
  const sample = {
    cards: [
      {
        id: 'card-1',
        title: 'Cluster: Evidence Summaries',
        type: 'cluster',
        version: 'v1.0',
        sourceRef: '/docs/repo/atlas/cluster/evidence',
        summary: 'Aggregated evidence summaries for high-priority cases',
        metadata: { author: 'ingest', createdAt: Date.now() },
      },
      {
        id: 'card-2',
        title: 'RAG Card: Contract Clauses',
        type: 'rag-card',
        version: 'v2026-05-27',
        sourceRef: 'https://internal.docs/contract-clauses',
        summary: 'Key contract clause examples and precedents',
        metadata: { author: 'atlas', createdAt: Date.now() },
      },
    ],
    note: 'Stubbed sample cards — production should query Postgres for RagCard / ClusterCard.',
  };

  return new Response(JSON.stringify(sample), {
    headers: { 'content-type': 'application/json' },
  });
};
