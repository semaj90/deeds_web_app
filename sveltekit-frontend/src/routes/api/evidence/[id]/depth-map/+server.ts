import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { getSeaweedFile } from '$lib/server/seaweed-client.js';
import { isUuid } from '$lib/server/validation.js';

const MAX_DEPTH_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

	try {
		const userId = Number(locals.user.id);
		const [item] = await db
			.select({
				id: evidence.id,
				caseId: evidence.caseId,
				hash: evidence.hash,
				mimeType: evidence.mimeType,
				fileType: evidence.fileType,
				aiAnalysis: evidence.aiAnalysis,
			})
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, params.id),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					eq(cases.userId, userId),
					eq(cases.assignedAttorney, userId),
				),
			))
			.limit(1);

		if (!item) return json({ error: 'Evidence not found' }, { status: 404 });
		if (!/^image\//i.test(item.mimeType ?? item.fileType ?? '')) {
			return json({ error: 'Evidence is not an image' }, { status: 415 });
		}

		const aiAnalysis = item.aiAnalysis && typeof item.aiAnalysis === 'object'
			? item.aiAnalysis as Record<string, unknown>
			: {};
		const depthAnalysis = aiAnalysis.depthAnalysis && typeof aiAnalysis.depthAnalysis === 'object'
			? aiAnalysis.depthAnalysis as Record<string, unknown>
			: null;
		const sourceRevision = typeof item.hash === 'string'
			? item.hash.startsWith('sha256:') ? item.hash : `sha256:${item.hash}`
			: null;
		if (!depthAnalysis || !sourceRevision || depthAnalysis.sourceRevision !== sourceRevision) {
			return json({ error: 'No source-revision-bound depth map is available' }, { status: 404 });
		}

		const storedUrl = depthAnalysis.depthMapUrl;
		if (typeof storedUrl !== 'string' || !storedUrl.startsWith('minio://')) {
			return json({ error: 'Depth map location is invalid' }, { status: 404 });
		}
		const [bucket, ...keyParts] = storedUrl.slice('minio://'.length).split('/');
		const key = keyParts.join('/');
		const expectedKey = `evidence/${item.caseId ?? 'default'}/${item.id}-depth.png`;
		if (!bucket || key !== expectedKey) return json({ error: 'Depth map binding is invalid' }, { status: 404 });

		const bytes = await getSeaweedFile(bucket, key);
		if (bytes.length > MAX_DEPTH_BYTES) return json({ error: 'Depth map too large' }, { status: 413 });
		if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
			return json({ error: 'Depth map is not a valid PNG' }, { status: 422 });
		}

		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	} catch (cause) {
		console.error('[evidence-depth-map] request failed', cause);
		return json({ error: 'Depth map unavailable' }, { status: 503 });
	}
};
