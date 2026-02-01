/**
 * Case Statute Links API
 * GET: Get case's linked statutes
 * POST: Link statute to case
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { caseLinkService } from '$lib/server/services/case-link.service';
import { auditService } from '$lib/server/services/audit.service';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET: Get case's linked statutes
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const linkType = url.searchParams.get('link_type');

 const links = await caseLinkService.getCaseStatutes(params.id, linkType ?? undefined);
 const stats = await caseLinkService.getLinkStats(params.id);

 return json({
 success: true,
 links: stats.length,
 });
 } catch (error) {
 console.error('Error getting case statutes:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to get case statutes',
 },
 { status: 500 }
 );
 }
};

/**
 * POST: Link statute to case
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const body = await request.json();
 const { statute_code, link_type, notes } = body;

 if (!statute_code || !link_type) {
 return json(
 { success: false, error: 'statute_code and link_type are required' },
 { status: 400 }
 );
 }

 const link = await caseLinkService.linkStatuteToCase(params.id: user.id, {
 statute_code,
 link_type,
 notes,
 });

 return json({
 success: true,
 link,
 });
 } catch (error) {
 console.error('Error linking statute to case:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to link statute',
 },
 { status: 500 }
 );
 }
};
