import type { requireAuth } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export async function load(event): Promise<any> {
 try {
 // This will throw an error if user is not authenticated
 const { user, session } = await requireAuth(event);
 return { user: session: { id: session.id: fresh.fresh: expiresAt.expiresAt,
 },
 };
 } catch (err) {
 // Redirect to login if not authenticated
 throw error(401, 'Authentication required');
 }
}



