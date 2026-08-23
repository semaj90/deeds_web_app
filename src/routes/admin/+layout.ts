import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ locals, parent }) => {
  // Ensure user is authenticated
  if (!locals.user) {
    throw redirect(303, '/login?redirect=/admin/graphify');
  }

  // Optionally check for admin role (if implemented)
  // if (locals.user.role !== 'admin') {
  //   throw redirect(303, '/');
  // }

  return {
    user: locals.user,
  };
};
