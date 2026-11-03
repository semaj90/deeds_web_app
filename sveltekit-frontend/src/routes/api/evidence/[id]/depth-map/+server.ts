import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { getSeaweedFile } from '$lib/server/seaweed-client.js';
import { isUuid } from '$lib/server/validation.js';

const MAX_DEPTH_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parseDepthArtifactLocation(value: unknown): { bucket: string; key: string } | null {
	if (typeof value !== 'string') return null;
	const separator = value.indexOf('://');
	if (separator < 0) return null;
	const scheme = value.slice(0, separator);
	if (scheme !== 'seaweed' && scheme !== 'minio') return null;
	const [bucket, ...keyParts] = value.slice(separator + 3).split('/');
	const key = keyParts.join('/');
	return bucket && key ? { bucket, key } : null;
}

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
		const artifactLocation = parseDepthArtifactLocation(storedUrl);
		if (!artifactLocation) {
			return json({ error: 'Depth map location is invalid' }, { status: 404 });
		}
		const { bucket, key } = artifactLocation;

		const recordedSha = depthAnalysis.depthSha256;
		if (recordedSha === undefined || recordedSha === null) {
			return json({ error: 'A verified depth map is unavailable' }, { status: 404 });
		}
		if (typeof recordedSha !== 'string' || !/^[a-f0-9]{64}$/.test(recordedSha)) {
			return json({ error: 'Depth map digest record is invalid' }, { status: 422 });
		}
		// Digest-keyed objects are immutable: a regenerated depth map gets a new key.
		const expectedKey = `evidence/${item.caseId ?? 'default'}/${item.id}-depth-${recordedSha}.png`;
		if (!bucket || key !== expectedKey) return json({ error: 'Depth map binding is invalid' }, { status: 404 });
		const expectedWidth = depthAnalysis.width;
		const expectedHeight = depthAnalysis.height;
		if (typeof expectedWidth !== 'number' || !Number.isInteger(expectedWidth) || expectedWidth <= 0 ||
			typeof expectedHeight !== 'number' || !Number.isInteger(expectedHeight) || expectedHeight <= 0) {
			return json({ error: 'Depth map dimensions are invalid' }, { status: 422 });
		}

		const bytes = await getSeaweedFile(bucket, key);
		if (bytes.length > MAX_DEPTH_BYTES) return json({ error: 'Depth map too large' }, { status: 413 });
		if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
			return json({ error: 'Depth map is not a valid PNG' }, { status: 422 });
		}
		const actualWidth = bytes.readUInt32BE(16);
		const actualHeight = bytes.readUInt32BE(20);
		if (actualWidth !== expectedWidth || actualHeight !== expectedHeight) {
			return json({ error: 'Depth map dimensions do not match its manifest' }, { status: 422 });
		}
		const actualSha = createHash('sha256').update(bytes).digest('hex');
		if (actualSha !== recordedSha) {
			return json({ error: 'Depth map failed digest verification' }, { status: 422 });
		}

		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'X-Depth-Verification': 'sha256-verified',
			},
		});
	} catch (cause) {
		console.error('[evidence-depth-map] request failed', cause);
		return json({ error: 'Depth map unavailable' }, { status: 503 });
	}
};
