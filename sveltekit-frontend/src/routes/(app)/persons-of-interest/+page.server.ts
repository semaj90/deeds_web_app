import type { PageServerLoad } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Get case ID from query params or session
  const caseId = url.searchParams.get('caseId') || (locals as any).caseId;

  if (!caseId) {
    throw new Error('Case ID is required');
  }

  return {
    caseId,
  };
};


