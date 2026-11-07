/**
 * src/routes/api/storage/upload/+server.ts
 *
 * Dedicated SeaweedFS S3 multi-bucket streaming upload route.
 * Routes files to purpose-specific buckets with strict contract assertions:
 *   - legal-evidence (original evidence)
 *   - atlas-artifacts (derived artifacts, backups, scene binaries)
 *   - legal-corpus (primary legal corpus)
 *   - federal-law (statutes, CFR, SCOTUS, Circuit cases)
 *   - state-law (state statutes, appellate/supreme records)
 *   - local-law (municipal ordinances, county codes)
 *
 * Calculates real SHA-256 hash and persists metadata headers to SeaweedFS.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { z } from 'zod';
import { putFileToSeaweed } from '$lib/server/storage/seaweed.js';
import {
	storageBuckets,
	assertEvidenceBucket,
	assertArtifactBucket,
	assertLegalCorpusBucket,
	assertFederalLawBucket,
	assertStateLawBucket,
	assertLocalLawBucket
} from '$lib/server/storage/storage-buckets.js';

const VALID_BUCKETS = [
	storageBuckets.evidence,
	storageBuckets.artifacts,
	storageBuckets.legalCorpus,
	storageBuckets.federalLaw,
	storageBuckets.stateLaw,
	storageBuckets.localLaw
] as const;

const uploadMetadataSchema = z.object({
	bucket: z.enum(VALID_BUCKETS),
	objectKey: z.string().min(1).max(1024).optional(),
	category: z.string().max(128).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Authentication check
	if (!locals.user?.id) {
		return json(
			{
				success: false,
				error: 'Unauthorized',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 401 }
		);
	}

	// 2. Parse multipart form data
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return json(
			{
				success: false,
				error: 'Invalid multipart form data',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 400 }
		);
	}

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json(
			{
				success: false,
				error: 'Missing file field or not a File instance',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 400 }
		);
	}

	const rawBucket = formData.get('bucket')?.toString();
	const rawObjectKey = formData.get('objectKey')?.toString();
	const rawCategory = formData.get('category')?.toString();

	const parsed = uploadMetadataSchema.safeParse({
		bucket: rawBucket,
		objectKey: rawObjectKey || undefined,
		category: rawCategory || undefined
	});

	if (!parsed.success) {
		return json(
			{
				success: false,
				error: parsed.error.issues[0]?.message ?? 'Invalid upload parameters',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 400 }
		);
	}

	const { bucket } = parsed.data;

	// 3. Assert bucket constraints per storage-buckets policy
	try {
		switch (bucket) {
			case storageBuckets.evidence:
				assertEvidenceBucket(bucket);
				break;
			case storageBuckets.artifacts:
				assertArtifactBucket(bucket);
				break;
			case storageBuckets.legalCorpus:
				assertLegalCorpusBucket(bucket);
				break;
			case storageBuckets.federalLaw:
				assertFederalLawBucket(bucket);
				break;
			case storageBuckets.stateLaw:
				assertStateLawBucket(bucket);
				break;
			case storageBuckets.localLaw:
				assertLocalLawBucket(bucket);
				break;
		}
	} catch (guardErr: any) {
		return json(
			{
				success: false,
				error: guardErr.message ?? 'Bucket policy violation',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 400 }
		);
	}

	// 4. Calculate real SHA-256 and read bytes
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

	const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const objectKey =
		parsed.data.objectKey ||
		`${bucket}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeFilename}`;

	// 5. Stream / Put to SeaweedFS S3
	try {
		const result = await putFileToSeaweed({
			bucket,
			objectKey,
			bytes,
			contentType: file.type || 'application/octet-stream',
			metadata: {
				'x-sha256': sha256,
				'x-original-name': encodeURIComponent(file.name),
				'x-uploader-id': String(locals.user.id),
				'x-category': parsed.data.category || 'general'
			}
		});

		return json({
			success: true,
			bucket,
			objectKey,
			sha256,
			size: bytes.byteLength,
			contentType: file.type || 'application/octet-stream',
			etag: result?.etag ?? null
		});
	} catch (uploadErr: any) {
		console.error('[SeaweedFS Multi-Bucket Upload Error]:', uploadErr);
		return json(
			{
				success: false,
				error: uploadErr.message ?? 'Failed to stream object to SeaweedFS',
				bucket: null,
				objectKey: null,
				sha256: null
			},
			{ status: 500 }
		);
	}
};
