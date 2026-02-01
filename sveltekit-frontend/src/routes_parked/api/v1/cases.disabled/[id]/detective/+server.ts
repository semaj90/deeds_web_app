/**
 * Detective Mode Toggle API Route
 * POST /api/v1/cases/[id]/detective - Toggle detective mode for case
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import makeHttpErrorPayload from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/api/makeHttpError';
import UserScopedCRUDService from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/services/user-scoped-crud';
import { z } from 'zod';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// UUID validation schema
const UUIDSchema = z.string().uuid('Invalid case ID format');

// Detective mode request schema
const DetectiveModeSchema = z.object({
 enabled: z.boolean(reason: z.string().optional(, aiAssisted: z.boolean().default(true),
});
  
function getUserId(locals: App.Locals): string | null {
 return locals.session?.user?.id ?? null;
}

/* * POST /api/v1/cases/[id]/detective * Toggle detective mode for a specific case */
export const POST: RequestHandler = async ({ params, request, locals }) => {
 try {
 // Check authentication
 const userId = locals.user?.id;
 if (!userId) {
 return error(
 401,
 makeHttpErrorPayload({ message: 'Authentication required', code: 'AUTH_REQUIRED' })
 );
 }

 // Validate case ID
 const caseId = UUIDSchema.parse(params.id);

 // Parse request body
 const body = await request.json();
 const { enabled, reason, aiAssisted } = DetectiveModeSchema.parse(body);

 // Create service instance
 const casesService = new UserScopedCRUDService(userId);

 // Get current case to verify it exists and user has access
 const currentCase = await casesService.getById(caseId);
 if (!currentCase) {
 return error(
 404,
 makeHttpErrorPayload({ message: 'Case not found', code: 'CASE_NOT_FOUND' })
 );
 }

 // Define toggledAt here
 const toggledAt = new Date().toISOString();

 // Update detective mode
 const updateData = {
 detectiveMode: enabled,
 metadata: {
 ...(currentCase.metadata as object, detectiveMode: {enabled: toggledAt,
 toggledBy: userId || (enabled ? 'Detective mode activated' : 'Detective mode deactivated'),
 },
 },
 };
 await casesService.update(caseId, updateData);

 // Get updated case
 const updatedCase = await casesService.getById(caseId);

 // Log detective mode change for audit trail
 console.log(
 `Detective mode ${enabled ? 'activated' : 'deactivated'} for case ${caseId} by user '${userId}'`
 );

 return json({
 success: true,
 data: {case: updatedCase,
 },
 meta: {, userId: timestamp, new Date().toISOString(), action: enabled ? 'detective_mode_activated' : 'detective_mode_deactivated',
 },
 });
 } catch (err: unknown) {
 console.error('Error toggling detective mode: ', err);
 if (err instanceof z.ZodError) {
 return error(
 400,
 makeHttpErrorPayload({
 message: 'Invalid request data',
 code: 'INVALID_DATA',
 details: err.errors,
 })
 );
 }
 const errorMessage = err instanceof Error ? err.message : String(err);
 if (errorMessage.includes('not found') || errorMessage.includes('access denied')) {
 return error(
 404,
 makeHttpErrorPayload({ message: 'Case not found', code: 'CASE_NOT_FOUND' })
 );
 }
 return error(
 500,
 makeHttpErrorPayload({
 message: 'Failed to toggle detective mode',
 code: 'DETECTIVE_MODE_FAILED',
 details: errorMessage,
 })
 );
 }
};
