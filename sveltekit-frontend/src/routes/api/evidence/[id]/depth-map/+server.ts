import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parseWholeImageAnalysisRowV1 } from '$lib/server/evidence/whole-image-analysis-readback-v1.js';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { ENV } from '$lib/server/env.server.js';
import { getSeaweedFile } from '$lib/server/seaweed-client.js';
import { isUuid } from '$lib/server/validation.js';

const MAX_DEPTH_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const depthPinSchema = z.object({ sourceRevision: digest, artifactSha256: digest, analysisRevision: z.string().min(1).max(512) });

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

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'string') {
		try { value = JSON.parse(value); } catch { return null; }
	}
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });
	const query = url?.searchParams;
	const pin = query && ['sourceRevision', 'artifactSha256', 'analysisRevision'].some((name) => query.has(name))
		? depthPinSchema.safeParse(Object.fromEntries(query)) : null;
	if (pin && !pin.success) return json({ error: 'Invalid depth revision locator' }, { status: 400 });

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
				isNull(evidence.deletedAt),
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

		const sourceRevision = typeof item.hash === 'string'
			? item.hash.startsWith('sha256:') ? item.hash : `sha256:${item.hash}`
			: null;
		if (!sourceRevision || !/^sha256:[a-f0-9]{64}$/.test(sourceRevision)) {
			return json({ error: 'Evidence source revision is invalid' }, { status: 409 });
		}
		if (pin?.success && pin.data.sourceRevision !== sourceRevision) {
			return json({ error: 'Depth source revision changed' }, { status: 409 });
		}

		let bucket: string | null = null;
		let key: string | null = null;
		let recordedSha: unknown = null;
		let expectedWidth: unknown = null;
		let expectedHeight: unknown = null;
		let canonicalDepthManifestPresent = false;
		try {
			const result = await db.execute(sql`
				SELECT source_revision, analysis_revision, source_locator, metadata
				FROM public.evidence_multimodal_vectors
				WHERE evidence_id = ${item.id}::uuid
				  AND modality = 'image'
				  AND source_locator->>'kind' = 'whole_image'
				ORDER BY created_at DESC, id DESC
				LIMIT 1
			`);
			const row = (result.rows as Array<Record<string, unknown>>)[0];
			if (pin?.success) {
				const qualified = row && parseWholeImageAnalysisRowV1(row, item.id, sourceRevision);
				if (!qualified?.relativeDepth || qualified.analysisRevision !== pin.data.analysisRevision ||
					qualified.relativeDepth.artifactSha256 !== pin.data.artifactSha256) {
					return json({ error: 'Relative depth revision changed or is unavailable' }, { status: 409 });
				}
			}
			if (row && row.source_revision === sourceRevision) {
				const metadata = asRecord(row.metadata);
				const visual = asRecord(metadata?.visualAnalysis);
				const depth = asRecord(visual?.depthMap);
				if (depth) {
					canonicalDepthManifestPresent = true;
					recordedSha = depth.artifactSha256;
					expectedWidth = depth.width;
					expectedHeight = depth.height;
					bucket = typeof depth.bucket === 'string' ? depth.bucket : null;
					key = typeof depth.objectKey === 'string' ? depth.objectKey : null;
					if (visual?.sourceRevision !== sourceRevision || depth.status !== 'ESTIMATED' || bucket !== ENV.SEAWEED_ARTIFACTS_BUCKET) {
						return json({ error: 'Canonical depth map binding is invalid' }, { status: 404 });
					}
			}
			}
		} catch {
			if (pin?.success) return json({ error: 'Depth analysis is unavailable' }, { status: 503 });
			// An absent canonical table is possible before its additive migration is applied;
			// keep legacy readback available while the canonical owner is unavailable.
		}

		if (!canonicalDepthManifestPresent) {
			if (pin?.success) return json({ error: 'Canonical relative depth is unavailable' }, { status: 409 });
			const aiAnalysis = item.aiAnalysis && typeof item.aiAnalysis === 'object'
				? item.aiAnalysis as Record<string, unknown>
				: {};
			const legacyDepth = aiAnalysis.depthAnalysis && typeof aiAnalysis.depthAnalysis === 'object'
				? aiAnalysis.depthAnalysis as Record<string, unknown>
				: null;
			if (!legacyDepth || legacyDepth.sourceRevision !== sourceRevision) {
				return json({ error: 'No source-revision-bound depth map is available' }, { status: 404 });
			}
			const location = parseDepthArtifactLocation(legacyDepth.depthMapUrl);
			if (!location) return json({ error: 'Depth map location is invalid' }, { status: 404 });
			bucket = location.bucket;
			key = location.key;
			recordedSha = legacyDepth.depthSha256;
			expectedWidth = legacyDepth.width;
			expectedHeight = legacyDepth.height;
		}
		if (!bucket || !key) return json({ error: 'Depth map location is invalid' }, { status: 404 });
		if (recordedSha === undefined || recordedSha === null) {
			return json({ error: 'A verified depth map is unavailable' }, { status: 404 });
		}
		if (typeof recordedSha !== 'string' || !/^[a-f0-9]{64}$/.test(recordedSha)) {
			return json({ error: 'Depth map digest record is invalid' }, { status: 422 });
		}
		// Digest-keyed objects are immutable: a regenerated depth map gets a new key.
		if (canonicalDepthManifestPresent) {
			const sourceHash = sourceRevision.slice('sha256:'.length);
			const expectedKey = `evidence/${item.caseId ?? 'default'}/${item.id}/${sourceHash}/depth-${recordedSha}.png`;
			if (key !== expectedKey) return json({ error: 'Canonical depth map binding is invalid' }, { status: 404 });
		} else {
			const expectedKey = `evidence/${item.caseId ?? 'default'}/${item.id}-depth-${recordedSha}.png`;
			if (key !== expectedKey) return json({ error: 'Depth map binding is invalid' }, { status: 404 });
		}
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
