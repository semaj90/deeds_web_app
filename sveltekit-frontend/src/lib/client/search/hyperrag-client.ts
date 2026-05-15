export async function searchHyperRag(input: {
  query: string;
  mode?: 'codebase' | 'evidence' | 'legal' | 'docs';
  topK?: number;
  useTurboVec?: boolean;
  useGraph?: boolean;
  useAceCache?: boolean;
  synthesize?: boolean;
}) {
  const res = await fetch('/api/search/hyperrag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`HyperRAG search failed: ${res.status}`);
  }

  return res.json();
}
