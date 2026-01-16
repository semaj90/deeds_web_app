import { error, redirect } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { uploadFile } from '$lib/server/minio-client';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	// Phase 96: SSR Authentication Guard
	if (!locals.user?.id) {
		// Allow demo data for development/testing
		console.log('No user authenticated, returning demo data');
		return {
			evidence: [],
			caseId: url.searchParams.get('caseId'),
			user: null
		};
	}

	try {
		const caseId = url.searchParams.get('caseId');
		let evidenceData;

		if (caseId) {
			// Get evidence for specific case
			evidenceData = await db
				.select()
				.from(evidence)
				.where(and(eq(evidence.caseId, caseId), eq(evidence.userId, locals.user.id)))
				.limit(100);
		} else {
			// Get all user's evidence
			evidenceData = await db
				.select()
				.from(evidence)
				.where(eq(evidence.userId, locals.user.id))
				.limit(50);
		}

		return {
			evidence: evidenceData,
			caseId,
			user: locals.user
		};
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		console.error('Failed to load evidence:', errorMessage);
		throw error(500, 'Failed to load evidence data');
	}
};

// Phase 96: Form Actions for mutations (replaces API endpoints)
export const actions: Actions = {
	// Upload new evidence
	upload: async ({ request, locals }) => {
		if (!locals.user?.id) {
			throw redirect(302, '/login');
		}

		try {
			const formData = await request.formData();
			const file = formData.get('file') as File;
			const caseId = formData.get('caseId') as string;
			const title = formData.get('title') as string ?? file?.name;
			const description = formData.get('description') as string ?? '';

			if (!file) {
				return { success: false, error: 'No file provided' };
			}

            // 1. Upload to MinIO
            const fileExt = file.name.split('.').pop() ?? 'bin';
            const objectName = `evidence/${locals.user.id}/${randomUUID()}.${fileExt}`;
            const buffer = Buffer.from(await file.arrayBuffer());

            await uploadFile('legal-evidence', objectName, buffer, {
                'Content-Type': file.type,
                'Original-Filename': file.name
            });

			// 2. Create DB Record
			const [newEvidence] = await db
				.insert(evidence)
				.values({
					userId: locals.user.id,
					caseId: caseId ?? null,
					title,
					description,
					fileName: file.name,
					fileSize: file.size,
					mimeType: file.type,
                    // Use storagePath if schema supports it, otherwise rely on objectName convention
                    // storagePath: objectName,
					status: 'pending',
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning();

			return {
				success: true,
				evidence: newEvidence
			};
		} catch (err) {
			console.error('Upload failed:', err);
			return {
				success: false,
				error: err instanceof Error ? err.message : 'Upload failed'
			};
		}
	},

	// Delete evidence
	delete: async ({ request, locals }) => {
		if (!locals.user?.id) {
			throw redirect(302, '/login');
		}

		try {
			const formData = await request.formData();
			const evidenceId = formData.get('evidenceId') as string;

			if (!evidenceId) {
				return { success: false, error: 'No evidence ID provided' };
			}

			// Only delete if owned by user
			await db
				.delete(evidence)
				.where(and(eq(evidence.id, evidenceId), eq(evidence.userId, locals.user.id)));

			return { success, true };
		} catch (err) {
			console.error('Delete failed:', err);
			return {
				success: false,
				error: err instanceof Error ? err.message : 'Delete failed'
			};
		}
	},

	// Update evidence metadata
	update: async ({ request, locals }) => {
		if (!locals.user?.id) {
			throw redirect(302, '/login');
		}

		try {
			const formData = await request.formData();
			const evidenceId = formData.get('evidenceId') as string;
			const title = formData.get('title') as string;
			const description = formData.get('description') as string;

			if (!evidenceId) {
				return { success: false, error: 'No evidence ID provided' };
			}

			const [updated] = await db
				.update(evidence)
				.set({
					title,
					description,
					updatedAt: new Date()
				})
				.where(and(eq(evidence.id, evidenceId), eq(evidence.userId, locals.user.id)))
				.returning();

			return {
				success: true,
				evidence: updated
			};
		} catch (err) {
			console.error('Update failed:', err);
			return {
				success: false,
				error: err instanceof Error ? err.message : 'Update failed'
			};
		}
	}
};


