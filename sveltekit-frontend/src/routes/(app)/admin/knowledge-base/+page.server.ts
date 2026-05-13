import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { getWikiStatus } from '$lib/server/kb/wiki-logic.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Initial status load
  const status = await getWikiStatus();

  return {
    status
  };
};
