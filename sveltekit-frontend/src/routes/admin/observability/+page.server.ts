import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }

  const [obsRes, vlmRes] = await Promise.all([
    event.fetch('/api/admin/observability'),
    event.fetch('/api/vlm/status')
  ]);

  let obsData = { success: false };
  let vlmData = { success: false };

  if (obsRes.ok) {
    obsData = await obsRes.json();
  }
  if (vlmRes.ok) {
    vlmData = await vlmRes.json();
  }

  return {
    obsData,
    vlmData
  };
};
