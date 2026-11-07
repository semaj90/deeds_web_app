import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import {
	reconcileSpatialKeyframe,
	decodeActiveSlotBitset,
	unpackKeyframeBuffer,
	type KeyframeChunk
} from '$lib/server/api/route-spatial-enhancer.js';
import { getCachedSpatialPacket } from '$lib/server/cache/valkey-packet-cache.js';
import { db } from '$lib/server/db/client.js';
import { atlasSpatialKeyframes } from '$lib/server/db/schema/atlas-spatial-keyframes.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

const uuidSchema = z.string().uuid();
const MAX_KEYFRAME_BODY_BYTES = 1024 * 1024;
const finiteNumber = z.number().finite();
const vector3Array = z.array(finiteNumber).max(256 * 3).refine((values) => values.length % 3 === 0, 'positions must contain XYZ triples');
const rotation6Array = z.array(finiteNumber).max(256 * 6).refine((values) => values.length % 6 === 0, 'rot6d must contain six values per slot');
const scale3Array = z.array(finiteNumber).max(256 * 3).refine((values) => values.length % 3 === 0, 'scales must contain XYZ triples');

const postKeyframePayloadSchema = z.object({
	titleId: z.string().min(1).max(64).default('scene-telemetry'),
	revisionId: z.number().int().min(1).default(1),
	sourceSha256: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/),
	positions: vector3Array.optional(),
	rot6d: rotation6Array.optional(),
	scales: scale3Array.optional(),
	clusters: z.array(z.number().int().min(0).max(65535)).max(256).optional(),
	chunks: z.array(
		z.object({
			mortonCode: z.number().int().min(0).max(0x3fffffff).optional(),
			slotIndex: z.number().int().min(0).max(255),
			clusterId: z.number().int().min(0).max(65535).default(0),
			position: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
			rot6d: z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber, finiteNumber, finiteNumber]),
			scale: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
			flags: z.number().int().min(0).max(0xffffffff).default(1),
			reserved: z.number().int().min(0).max(0xffffffff).default(0)
		})
	).max(256).refine((chunks) => new Set(chunks.map((chunk) => chunk.slotIndex)).size === chunks.length, 'chunk slotIndex values must be unique').optional(),
	clusterMetadata: z.record(z.string(), z.unknown()).default({}),
	writeToDb: z.boolean().default(false)
}).strict();

const parseScope = (id: string, sceneId: string) => {
	const caseResult = uuidSchema.safeParse(id);
	const sceneResult = uuidSchema.safeParse(sceneId);
	return caseResult.success && sceneResult.success
		? { caseId: caseResult.data, sceneId: sceneResult.data }
		: null;
};

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const stableEmpty = {
		success: false,
		data: null,
		simdMetrics: null,
		message: ''
	};

	if (!locals.user?.id) {
		return json({ ...stableEmpty, message: 'Unauthorized' }, { status: 401 });
	}

	const scope = parseScope(params.id, params.sceneId);
	if (!scope) {
		return json({ ...stableEmpty, message: 'Invalid identifiers' }, { status: 400 });
	}

	const actorId = Number(locals.user.id);
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(scope.caseId, actorId);
	} catch {
		return json({ ...stableEmpty, message: 'Case authorization failed' }, { status: 500 });
	}
	if (!authorized) {
		return json({ ...stableEmpty, message: 'Case not found' }, { status: 404 });
	}

	const revisionParam = url.searchParams.get('revision');
	const parsedRevision = revisionParam === null ? { success: true as const, data: 1 } : z.coerce.number().int().min(1).safeParse(revisionParam);
	if (!parsedRevision.success) {
		return json({ ...stableEmpty, message: 'Invalid revision' }, { status: 400 });
	}
	const revisionId = parsedRevision.data;

	// 1. Try Valkey / Redis transient packet cache (:6379)
	try {
		const cached = await getCachedSpatialPacket(scope.caseId, scope.sceneId, revisionId);
		if (cached && cached.caseId === scope.caseId && cached.sceneId === scope.sceneId && cached.revisionId === revisionId) {
			const buf = Buffer.from(cached.packedTransformsBase64, 'base64');
			const chunks = unpackKeyframeBuffer(buf);
			const bitsetInfo = decodeActiveSlotBitset(cached.activeSlotBitset);

			return json({
				success: true,
				data: {
					sceneId: cached.sceneId,
					titleId: cached.titleId,
					sourceSha256: cached.sourceSha256,
					revisionId: cached.revisionId,
					bitsetInfo,
					chunks,
					clusterMetadata: cached.clusterMetadata,
					source: 'valkey-cache'
				},
				simdMetrics: {
					chunkCount: chunks.length,
					totalBytes: buf.length,
					avx2Instructions: chunks.length * 2,
					avx512Instructions: chunks.length * 1
				},
				message: 'OK'
			});
		}
	} catch (cacheErr) {
		console.warn('[Keyframes GET] Valkey cache miss/error:', cacheErr);
	}

	// 2. Try PostgreSQL 18 atlas_spatial_keyframes_v1 table
	try {
		const rows = await db
			.select()
			.from(atlasSpatialKeyframes)
			.where(
				and(
					eq(atlasSpatialKeyframes.caseId, scope.caseId),
					eq(atlasSpatialKeyframes.sceneId, scope.sceneId),
					eq(atlasSpatialKeyframes.revisionId, revisionId)
				)
			)
			.limit(1);

		if (rows.length > 0) {
			const row = rows[0];
			const buf = row.packedTransformsBlob;
			const chunks = unpackKeyframeBuffer(buf);
			const bitsetInfo = decodeActiveSlotBitset(row.activeSlotBitset);

			return json({
				success: true,
				data: {
					sceneId: row.sceneId,
					titleId: row.titleId,
					sourceSha256: row.sourceSha256,
					revisionId: row.revisionId,
					bitsetInfo,
					chunks,
					clusterMetadata: row.clusterMetadata,
					source: 'postgresql-18'
				},
				simdMetrics: {
					chunkCount: chunks.length,
					totalBytes: buf.length,
					avx2Instructions: chunks.length * 2,
					avx512Instructions: chunks.length * 1
				},
				message: 'OK'
			});
		}
	} catch (dbErr) {
		console.warn('[Keyframes GET] DB read error (table may be unapplied sidecar):', dbErr);
	}

	return json({
		...stableEmpty,
		message: 'No spatial keyframes found for requested revision'
	}, { status: 404 });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user?.id) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}

	const scope = parseScope(params.id, params.sceneId);
	if (!scope) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}

	const actorId = Number(locals.user.id);
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(scope.caseId, actorId);
	} catch {
		return json({ success: false, data: null, message: 'Case authorization failed' }, { status: 500 });
	}
	if (!authorized) {
		return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	}

	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_KEYFRAME_BODY_BYTES) {
		return json({ success: false, data: null, message: 'Payload exceeds 1 MiB limit' }, { status: 413 });
	}
	let body: unknown;
	try {
		if (!request.body) throw new Error('Missing request body');
		const reader = request.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_KEYFRAME_BODY_BYTES) {
				await reader.cancel();
				return json({ success: false, data: null, message: 'Payload exceeds 1 MiB limit' }, { status: 413 });
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		body = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return json({ success: false, data: null, message: 'Invalid JSON payload' }, { status: 400 });
	}

	const parseResult = postKeyframePayloadSchema.safeParse(body);
	if (!parseResult.success) {
		return json({
			success: false,
			data: null,
			message: parseResult.error.issues[0]?.message ?? 'Invalid payload'
		}, { status: 400 });
	}

	const payload = parseResult.data;

	try {
		const result = await reconcileSpatialKeyframe({
			caseId: scope.caseId,
			sceneId: scope.sceneId,
			titleId: payload.titleId,
			revisionId: payload.revisionId,
			sourceSha256: payload.sourceSha256,
			rawPositions: payload.positions,
			rawRot6d: payload.rot6d,
			rawScales: payload.scales,
			clusters: payload.clusters,
			chunks: payload.chunks as KeyframeChunk[] | undefined,
			clusterMetadata: payload.clusterMetadata,
			writeToDb: payload.writeToDb && Boolean(ENV.SCENE_PERSISTENCE_ENABLED)
		});

		return json({
			success: true,
			data: {
				sceneId: result.sceneId,
				revisionId: result.revisionId,
				sourceSha256: result.sourceSha256,
				activeSlotCount: result.activeSlotCount,
				bitsetInfo: result.bitsetInfo,
				simdMetrics: result.simdMetrics,
				status: result.status
			},
			message: `Keyframe packet synthesized and ${result.status.toLowerCase()}`
		}, { status: 201 });
	} catch (err) {
		console.error('[Keyframes POST] Error synthesizing spatial packet:', err);
		return json({
			success: false,
			data: null,
			message: err instanceof Error ? err.message : 'Failed to synthesize keyframe packet'
		}, { status: 500 });
	}
};
