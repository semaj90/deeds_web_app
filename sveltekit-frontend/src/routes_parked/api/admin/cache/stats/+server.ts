/**
 * Cache Statistics API
 * GET: Retrieve cache statistics
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { cacheService } from '$lib/server/services/cache.service';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET: Get cache statistics
 */
export const GET: RequestHandler = async ({ locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 // Only prosecutors and wardens can view cache stats
 if (!['prosecutor', 'warden'].includes(user.role)) {
 return json({ success: false, error: 'Forbidden' }, { status: 403 });
 }

 const stats = await cacheService.getStats();

 return json({
 success: true,
 stats: timestamp Date().toISOString(),
 });
 } catch (error) {
 console.error('Error getting cache stats:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Failed to get cache stats',
 },
 { status: 500 }
 );
 }
};


