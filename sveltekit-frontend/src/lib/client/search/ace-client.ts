import type { AceSearchInput, AceSearchOutput } from '$lib/server/ai/ace-search.js';

export async function searchAce(input: AceSearchInput): Promise<AceSearchOutput> {
  const res = await fetch('/api/search/ace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ACE search failed: ${res.status} ${body}`);
  }

  return res.json();
}
