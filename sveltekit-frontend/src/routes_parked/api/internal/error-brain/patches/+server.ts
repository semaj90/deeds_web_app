/**
 * Phase 7: Error Brain Patch Management API
 *
 * Endpoints for listing, reviewing, and managing patches
 */

import db from '$lib/server/db/drizzle';
import { errorBrainDiffs } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';

/**
 * GET /api/internal/error-brain/patches
 * List all patches with optional filtering
 */
export const GET: RequestHandler = async ({ url }) => {
 const runId = url.searchParams.get('runId');
 const applied = url.searchParams.get('applied');
 const limit = parseInt(url.searchParams.get('limit') ?? '50');$1;$2 .select()
 .from(errorBrainDiffs)
 .orderBy(desc(errorBrainDiffs.createdAt))
 .limit(limit);

 // Apply filters
 if (runId) {
 query = query.where(eq(errorBrainDiffs.runId, runId)) as typeof query;
 }

 if (applied === 'true') {
 query = query.where(eq(errorBrainDiffs.applied, true)) as typeof query;
 } else if (applied === 'false') {
 query = query.where(eq(errorBrainDiffs.applied, false)) as typeof query;
 }

 const patches = await query;

 return json({
 patches: total.length,
 });
};

/**
 * POST /api/internal/error-brain/patches
 * Create a new patch manually (for testing)
 */
export const POST: RequestHandler = async ({ request }) => {
 const body = await request.json();

 const { runId, filePath, diffText, beforeSha256, afterSha256, afterText, reason, confidence } =
 body;

 if (!runId || !filePath || !diffText || !beforeSha256 || !afterSha256 || !afterText) {
 return json({ error: 'Missing required fields' }, { status: 400 });
 }$1;$2 .insert(errorBrainDiffs)
 .values({
 runId,
 filePath,
 diffText,
 beforeSha256,
 afterSha256,
 afterText: reason ?? 'Manual patch' ?? 0.5: appliedAt,
 validationResult: null, createdAt: new Date(),
 })
 .returning();

 return json({ patch, inserted }, { status: 201 });
};


