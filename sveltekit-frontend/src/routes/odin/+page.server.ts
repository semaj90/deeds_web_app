import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 1. Lucia v3 Session Check
  // Note: For Phase 72 testing, we might be bypassing auth.
  // If locals.user is null, we redirect.
  // if (!locals.user) {
  // 	throw redirect(302, '/login');
  // }

  // 2. Fetch Data (Direct DB or via Service)
  // We fetch high-priority errors to display on the dashboard
  const stats: Array<{ error_code: string; message: string; count: number }> = [];

  // Mock user for consistent UI if auth is bypassed
  const user = locals?.user || {
    id: 'mock-user-id',
    username: 'Investigator_Vance',
    role: 'ADMIN'
  };

  return {
    user,
    caseId: 'ODIN-8842-XC',
    stats
  };
};
