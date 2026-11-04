import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }

  const [obsRes, vlmRes, aceMetricsRes] = await Promise.all([
    event.fetch('/api/admin/observability'),
    event.fetch('/api/vlm/status'),
    event.fetch('/api/admin/ace-metrics?since_days=1'),
  ]);

  let obsData: Record<string, any> = { success: false };
  let vlmData: Record<string, any> = { success: false };
  let aceMetrics: Record<string, any> = { success: false };

  if (obsRes.ok) {
    obsData = await obsRes.json();
  }
  if (vlmRes.ok) {
    vlmData = await vlmRes.json();
  }
  if (aceMetricsRes.ok) {
    aceMetrics = await aceMetricsRes.json();
  }

  return {
    obsData,
    vlmData,
    aceMetrics,
  };
};
