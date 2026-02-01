import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema-postgres';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const caseId = params.id;

	// Verify case exists and user has access
	const caseRecord = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

	if (!caseRecord || caseRecord.length === 0) {
		throw error(404, 'Case not found');
	}

	if (caseRecord[0].userId !== locals.user.id) {
		throw error(403, 'You do not have access to this case');
	}

	return {
		caseId,
		caseTitle: caseRecord[0].title
	};
};

export const actions: Actions = {
 upload: async ({ request, params, locals }) => {
 if (!locals.user) {
 throw error(401, 'Unauthorized');
 }

 const caseId = params.id;
 const formData = await request.formData();
 const file = formData.get('file') as File;

 if (!file) {
 throw error(400, 'No file provided');
 }

	// Validate file
	const maxSize = 50 * 1024 * 1024; // 50MB
	const allowedTypes = [
		'application/pdf',
		'image/png',
		'image/jpeg',
		'image/tiff',
		'application/x-tiff'
	];

 if (file.size > maxSize) {
 throw error(400, 'File size exceeds 50MB limit');
 }

 if (!allowedTypes.includes(file.type)) {
 throw error(400, 'File type not supported');
 }

 try {
 // TODO: Upload to MinIO
 // TODO: Create rag_documents record
 // TODO: Publish RabbitMQ message

	return {
		success: true,
		message: 'File uploaded successfully',
		documentId: 'placeholder-id'
	};
 } catch (err) {
 console.error('Upload error:', err);
 throw error(500, 'Upload failed');
 }
 },
	};
