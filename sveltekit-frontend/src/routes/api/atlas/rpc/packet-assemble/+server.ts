import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
	AtlasCustomRpcPacketV1Schema,
	type AtlasCustomRpcPacketV1
} from '$lib/server/atlas/contracts/atlas-custom-rpc-packet-v1.js';
import { getRedis } from '$lib/server/redis.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'INVALID_JSON_BODY' }, { status: 400 });
	}

	const parseResult = AtlasCustomRpcPacketV1Schema.safeParse(body);
	if (!parseResult.success) {
		return json(
			{
				ok: false,
				error: 'VALIDATION_FAILED',
				issues: parseResult.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
			},
			{ status: 400 }
		);
	}

	const packet: AtlasCustomRpcPacketV1 = parseResult.data;

	// Enforce proposal-only write policy for mutations and analyses
	if (packet.operation === 'ANALYZE' && packet.analysis.writePolicy !== 'PROPOSAL_ONLY') {
		return json(
			{ ok: false, error: 'WRITE_POLICY_VIOLATION', message: 'Only PROPOSAL_ONLY mode is admitted' },
			{ status: 403 }
		);
	}

	// Cache LUT encoding revision in Redis if present
	if (packet.registry.lutEncodingRevision) {
		try {
			const redis = getRedis();
			if (redis) {
				const cacheKey = `atlas:lut:revision:${packet.registry.lutEncodingRevision}`;
				await redis.set(
					cacheKey,
					JSON.stringify({
						lutCode: packet.registry.lutCode,
						packetClass: packet.registry.packetClass,
						cachedAt: new Date().toISOString()
					}),
					'EX',
					3600
				);
			}
		} catch (e) {
			// Non-blocking cache logging
			console.warn('[packet-assemble] Redis LUT caching non-fatal error:', e);
		}
	}

	return json({
		ok: true,
		status: 'ASSEMBLED_PROPOSAL_ONLY',
		packetKey: packet.registry.packetKey,
		rpcCallId: packet.rpcCallId,
		executionId: packet.executionId,
		operation: packet.operation,
		callerId: packet.callerId,
		lineage: packet.lineage,
		timestamp: new Date().toISOString()
	});
};
