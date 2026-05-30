/**
 * POST /api/persons-of-interest/[id]/gpu-analyze
 *
 * On-demand GPU-accelerated analysis of a POI's photos.
 * Runs similarity matrix, clustering, and cross-POI matching
 * using LibTorch CUDA (with CPU fallback).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const poiId = params.id;
	if (!isUuid(poiId)) {
		return json({ error: 'Invalid POI ID format' }, { status: 400 });
	}

	try {
		const { analyzePoiPhotoGpu } = await import('$lib/server/gpu/background-analyzer.js');
		const { db } = await import('$lib/server/db/client');
		const { poiPhotos, personsOfInterest } = await import('$lib/server/db/schema-postgres.js');
    const { and, eq, desc, or, isNull } = await import('drizzle-orm');

    const owners = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(and(eq(personsOfInterest.id, poiId), or(eq(personsOfInterest.createdBy, Number(locals.user.id)), isNull(personsOfInterest.createdBy))))
      .limit(1);

    if (!owners[0]) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

		// Get latest photo for this POI
		const photos = await db
			.select({ id: poiPhotos.id })
			.from(poiPhotos)
			.where(eq(poiPhotos.poiId, poiId))
			.orderBy(desc(poiPhotos.uploadedAt))
			.limit(1);

		if (!photos[0]) {
			return json({ error: 'No photos found for this POI' }, { status: 404 });
		}

		const result = await analyzePoiPhotoGpu(photos[0].id, poiId);

		if (!result) {
			return json({
				success: true,
				message: 'Insufficient data for GPU analysis (need at least 2 POI photos in system)',
				result: null,
			});
		}

		return json({ success: true, result });
	} catch (err) {
		console.error('[poi/gpu-analyze] error:', err);
		return json({ error: 'GPU analysis failed' }, { status: 500 });
	}
};