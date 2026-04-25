import { auth } from '$lib/server/lucia.ts';
import type { LayoutServerLoad } from './$types';
import { xstateIntegration } from '$lib/services/xstate-integration';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await auth.validateRequest(locals);

  // Update XState session machine with the current user status
  if (session?.user) {
    xstateIntegration.sendEvent('authMachine', { type: 'USER_AUTHENTICATED', user: session.user });
  } else {
    xstateIntegration.sendEvent('authMachine', { type: 'USER_LOGGED_OUT' });
  }

  return { user: session?.user ?? null };
};
