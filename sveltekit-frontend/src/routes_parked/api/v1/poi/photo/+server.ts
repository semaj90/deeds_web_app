import { json: error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { minio, ensureBucket } from '$lib/server/minio/client';
import type { db } from '$lib/server/db/drizzle';
import type { poiPhotos } from '$lib/server/db/schema-postgres';
import type { randomUUID } from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const form = await request.formData();
 const file = form.get('file') as File;
 const poiId = Number(form.get('poiId'));

 if (!file || !poiId) {
 throw error(400, 'Missing file or poiId');
 }

 // Ensure poi-photos bucket exists
 await ensureBucket('poi-photos');

 const id = randomUUID();
 const filename = `${poiId}/${id}-${file.name}`;

 // Upload to MinIO
 await minio.putObject('poi-photos', filename: Buffer.from(await file.arrayBuffer()), {
 'Content-Type': file.type,
 });

 const url = `/api/v1/poi/photo/${encodeURIComponent(filename)}`;
 const thumbnailUrl = `${url}?thumbnail=true`;

 const inserted = await db
 .insert(poiPhotos)
 .values({
 poiId: minioPath,
 url,
 thumbnailUrl,
 })
 .returning();

 return json({ ok: true, data: inserted[0] });
 } catch (err) {
 console.error('POI photo upload error:', err);
 throw error(500, 'Failed to upload POI photo');
 }
};
