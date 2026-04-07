/**
 * GET /api/health/qdrant
 * POST /api/health/qdrant (with ?repair=true to auto-create missing collections)
 *
 * Comprehensive Qdrant collection health check
 * - Verifies all 8 required collections exist
 * - Validates vector schemas (size, distance, quantization)
 * - Reports vector counts per collection
 * - Optionally auto-creates missing collections
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ENV } from '$lib/server/env.server.js';
import {
	checkQdrantHealth,
	ensureCollections,
	getQdrantServerInfo,
	type QdrantHealthReport
} from '$lib/server/vector/qdrant-health.js';

const getQuerySchema = z.object({
	counts: z.enum(['true', 'false']).default('false'),
	timeout: z.coerce.number().int().min(1000).max(30000).default(5000)
});

const postQuerySchema = z.object({
	repair: z.enum(['true', 'false']).default('false')
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = getQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	const { counts, timeout } = parsed.success ? parsed.data : { counts: 'false', timeout: 5000 };
	const includeVectorCounts = counts === 'true';

	try {
		const client = new QdrantClient({ url: ENV.QDRANT_URL });

		// Run health check
		const health = await checkQdrantHealth(client, {
			timeout,
			includeVectorCounts
		});

		// Get server info
		const serverInfo = await getQdrantServerInfo(client);

		return json({
			success: true,
			...health,
			server: {
				version: serverInfo.version,
				url: ENV.QDRANT_URL,
				healthy: serverInfo.healthy,
				latencyMs: serverInfo.latencyMs
			}
		});
	} catch (err) {
		console.error('[QdrantHealth] Check failed:', err);
		return json(
			{
				success: false,
				error: 'Health check failed',
				healthy: false,
				collections: [],
				totalVectors: 0,
				missingCollections: [],
				schemaIssues: [],
				latencyMs: 0,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const postParsed = postQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	const repair = postParsed.success ? postParsed.data.repair === 'true' : false;

	if (!repair) {
		throw error(400, 'POST requires ?repair=true query parameter');
	}

	try {
		const client = new QdrantClient({ url: ENV.QDRANT_URL });

		// Run health check first
		const healthBefore = await checkQdrantHealth(client, {
			timeout: 3000,
			includeVectorCounts: false
		});

		if (healthBefore.healthy) {
			return json({
				success: true,
				message: 'All collections already healthy',
				created: [],
				health: healthBefore
			});
		}

		// Auto-create missing collections
		console.log('🔧 Auto-creating missing Qdrant collections...');
		const created = await ensureCollections(client);

		// Run health check again
		const healthAfter = await checkQdrantHealth(client, {
			timeout: 3000,
			includeVectorCounts: false
		});

		return json({
			success: true,
			message: `Repaired Qdrant collections`,
			created,
			healthBefore: {
				missing: healthBefore.missingCollections.length,
				schemaIssues: healthBefore.schemaIssues.length
			},
			healthAfter: {
				missing: healthAfter.missingCollections.length,
				schemaIssues: healthAfter.schemaIssues.length
			},
			health: healthAfter
		});
	} catch (err) {
		console.error('[QdrantHealth] Repair failed:', err);
		return json(
			{
				success: false,
				error: 'Repair failed',
				message: 'Failed to repair Qdrant collections'
			},
			{ status: 500 }
		);
	}
};
