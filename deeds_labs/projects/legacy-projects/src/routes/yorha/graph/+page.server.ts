import type { PageServerLoad } from './$types';

type GraphPayload = {
  nodes: Array<{ id: string; label: string; type: string }>;
  links: Array<{ id: string; source: string; target: string; score: number }>;
  error?: string;
};

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    const res = await fetch('/api/graph/evidence');
    if (!res.ok) {
      throw new Error(`Graph API returned ${res.status}`);
    }

    const graph = (await res.json()) as GraphPayload;
    return {
      graph
    };
  } catch (error) {
    console.warn('Graph load failed:', error);
    return {
      graph: { nodes: [], links: [] } satisfies GraphPayload,
      error: error instanceof Error ? error.message : 'Failed to load graph'
    };
  }
};
