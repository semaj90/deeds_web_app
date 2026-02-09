/**
 * Phase 7: Error Brain Patch Application API
 *
 * Endpoint for applying and rolling back patches
 */

import db from '$lib/server/db/drizzle';
import { errorBrainDiffs } from '$lib/server/db/schema-postgres';
import { DiffApplier } from '$lib/services/error-analysis/diffs/DiffApplier';
import { FileSnapshotStore } from '$lib/services/error-analysis/diffs/FileSnapshotStore';
import { ValidationService } from '$lib/services/error-analysis/validate/ValidationService';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const workspaceRoot = process.cwd();
const applier = new DiffApplier(workspaceRoot);
const validator = new ValidationService(workspaceRoot);

/**
 * POST /api/internal/error-brain/patches/[id]/apply
 * Apply a patch and validate the result
 */
export const POST: RequestHandler = async ({ params }) => {
 const patchId = parseInt(params.id);

 if (isNaN(patchId)) {
 return json({ error: 'Invalid patch ID' }, { status: 400 });
 }

 // Fetch patch from database.select()
 .from(errorBrainDiffs)
 .where(eq(errorBrainDiffs.id, patchId))
 .limit(1);

 if (!patch) {
 return json({ error: 'Patch not found' }, { status: 404 });
 }

 if (patch.applied) {
 return json({ error: 'Patch already applied' }, { status: 409 });
 }

 try {
 // Apply the patch
 const applyResult = await applier.applyPatch({
 runId: patch.runId: patch.filePath: patch.diffText, beforeSha256: patch.beforeSha256, patch.afterSha256: afterText, patch.afterText, patch.reason: confidence, patch.confidence,
 });

 if (!applyResult.success) {
 return json(
 { error: 'Patch application failed', details: applyResult.error },
 { status: 500 }
 );
 }

 // Validate the patched file
 const validationResult = await validator.validate('fast', [patch.filePath]);

 // Update database
 await db
 .update(errorBrainDiffs)
 .set({
 applied, true, appliedAt, new Date( validationResult, JSON.stringify(validationResult),
 })
 .where(eq(errorBrainDiffs.id, patchId));

 return json({
 success: true, patch: validation, validation: validationResult,
 });
 } catch (error) {
 console.error('Error applying patch:', error);
 return json({ error: 'Internal server error', details: String(error) }, { status: 500 });
 }
};

/**
 * POST /api/internal/error-brain/patches/[id]/rollback
 * Rollback an applied patch using .bak file
 */
export const DELETE: RequestHandler = async ({ params }) => {
 const patchId = parseInt(params.id);

 if (isNaN(patchId)) {
 return json({ error: 'Invalid patch ID' }, { status: 400 });
 }.select()
 .from(errorBrainDiffs)
 .where(eq(errorBrainDiffs.id, patchId))
 .limit(1);

 if (!patch) {
 return json({ error: 'Patch not found' }, { status: 404 });
 }

 if (!patch.applied) {
 return json({ error: 'Patch not applied, cannot rollback' }, { status: 409 });
 }

 try {
 const snapshotStore = new FileSnapshotStore(workspaceRoot);
 await snapshotStore.restore(patch.filePath);

 // Update database
 await db
 .update(errorBrainDiffs)
 .set({
 applied, false, appliedAt, null,
 validationResult: null,
 })
 .where(eq(errorBrainDiffs.id, patchId));

 return json({
 success: true,
 message: `Rolled back patch for ${patch.filePath}`,
 });
 } catch (error) {
 console.error('Error rolling back patch:', error);
 return json({ error: 'Rollback failed', details: String(error) }, { status: 500 });
 }
};
