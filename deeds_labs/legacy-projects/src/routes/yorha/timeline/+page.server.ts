import type { PageServerLoad } from './$types';

type TimelineAPIResponse = {
  success: boolean;
  events: Array<{
    id: string;
    caseId: string | null;
    type: string;
    title: string;
    description: string;
    timestamp: string | null;
    importance: string;
    automated: boolean;
    evidenceId: string | null;
    relatedEntityId: string | null;
    relatedEntityType: string | null;
    data: Record<string, unknown>;
  }>;
  error?: string;
};

export const load: PageServerLoad = async ({ fetch, url }) => {
  const caseId = url.searchParams.get('caseId');

  try {
    const query = new URLSearchParams();
    if (caseId) query.set('caseId', caseId);
    query.set('limit', '250');

    const res = await fetch(`/api/timeline/events?${query.toString()}`);
    if (!res.ok) {
      throw new Error(`Timeline API returned ${res.status}`);
    }

    const payload = (await res.json()) as TimelineAPIResponse;
    return {
      timeline: payload,
      caseId
    };
  } catch (error) {
    console.warn('Timeline load failed:', error);
    return {
      timeline: { success: false, events: [], error: 'Timeline unavailable' } satisfies TimelineAPIResponse,
      caseId
    };
  }
};
