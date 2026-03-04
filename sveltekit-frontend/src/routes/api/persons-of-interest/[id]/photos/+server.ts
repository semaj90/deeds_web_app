import { db } from '$lib/server/db/client';
import { poiPhotos, personsOfInterest } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { uploadFile } from '$lib/server/minio-client';
import { createHash } from 'crypto';
import type { RequestHandler } from './$types';

const BUCKET = 'poi-photos';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * GET /api/persons-of-interest/[id]/photos
 * List all photos for a POI (most recent first)
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const photos = await db
			.select()
			.from(poiPhotos)
			.where(eq(poiPhotos.poiId, params.id))
			.orderBy(desc(poiPhotos.uploadedAt));

		return json({ success: true, photos });
	} catch (err) {
		console.error('[poi-photos] GET error:', err);
		return json({ success: true, photos: [] });
	}
};

/**
 * POST /api/persons-of-interest/[id]/photos
 * Upload a photo for a POI
 * Accepts multipart/form-data with field "file"
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const poiId = params.id;

	try {
		// Verify POI exists
		const [poi] = await db
			.select({ id: personsOfInterest.id })
			.from(personsOfInterest)
			.where(eq(personsOfInterest.id, poiId))
			.limit(1);

		if (!poi) {
			return json({ error: 'Person of interest not found' }, { status: 404 });
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file || !(file instanceof File)) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		if (!ALLOWED_TYPES.includes(file.type)) {
			return json(
				{ error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
				{ status: 400 }
			);
		}

		if (file.size > MAX_SIZE) {
			return json({ error: 'File too large. Max 10MB.' }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
		const ext = file.name.split('.').pop() || 'jpg';
		const minioKey = `${poiId}/${hash}.${ext}`;

		// Upload to MinIO
		await uploadFile(BUCKET, minioKey, buffer, {
			'Content-Type': file.type,
			'X-POI-Id': poiId,
			'X-Original-Name': file.name,
		});

		const url = `/minio/${BUCKET}/${minioKey}`;

		// Insert DB record
		const [photo] = await db
			.insert(poiPhotos)
			.values({
				poiId,
				minioKey,
				url,
				originalName: file.name,
				mimeType: file.type,
				size: file.size,
			})
			.returning();

		return json({ success: true, photo }, { status: 201 });
	} catch (err) {
		console.error('[poi-photos] POST error:', err);
		return json({ error: 'Failed to upload photo' }, { status: 500 });
	}
};

/**
 * DELETE /api/persons-of-interest/[id]/photos
 * Remove a photo by photoId in JSON body
 * Body: { photoId: string }
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const photoId = body.photoId;

		if (!photoId) {
			return json({ error: 'photoId required' }, { status: 400 });
		}

		const [deleted] = await db
			.delete(poiPhotos)
			.where(eq(poiPhotos.id, photoId))
			.returning();

		if (!deleted) {
			return json({ error: 'Photo not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('[poi-photos] DELETE error:', err);
		return json({ error: 'Failed to delete photo' }, { status: 500 });
	}
};