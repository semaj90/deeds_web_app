/**
 * GET /api/synthesis/evaluation/[id]
 *
 * Unified polling endpoint for synthesis results + ACE evaluations.
 * Checks three Redis keys in order:
 *   1. synthesis:result:{id}  — full synthesis result (from RabbitMQ worker)
 *   2. synthesis:status:{id}  — progress status (pending/generating/complete/failed)
 *   3. ace:result:{id}        — ACE self-evaluation (from ACE worker)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { redis } from '$lib/server/redis.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user) return json({ synthesis: null, evaluation: null, status: 'unauthorized' }, { status: 401 });
	const { params } = event;
	const { id } = params;

	if (!id || !UUID_RE.test(id)) {
		return json({ evaluation: null, synthesis: null, status: 'invalid_id' });
	}

	try {
		// Check for full synthesis result first (RabbitMQ worker completed)
		const synthesisRaw = await redis.get(`synthesis:result:${id}`);
		if (synthesisRaw) {
			const synthesis = JSON.parse(synthesisRaw);
			// Also check if ACE evaluation has arrived
			const aceRaw = await redis.get(`ace:result:${id}`);
			const evaluation = aceRaw ? JSON.parse(aceRaw) : null;
			if (evaluation) {
				synthesis.evaluation = evaluation;
			}
			return json({ synthesis, evaluation, status: 'complete' });
		}

		// Check synthesis status (in-progress or failed)
		const statusRaw = await redis.get(`synthesis:status:${id}`);
		if (statusRaw) {
			const statusData = JSON.parse(statusRaw);
			if (statusData.status === 'failed') {
				return json({ synthesis: null, evaluation: null, status: 'failed', error: statusData.error });
			}
			if (statusData.status === 'generating' || statusData.status === 'pending') {
				return json({ synthesis: null, evaluation: null, status: statusData.status });
			}
		}

		// Check for ACE evaluation only (synthesis was synchronous, only eval was async)
		const aceRaw = await redis.get(`ace:result:${id}`);
		if (aceRaw) {
			const evaluation = JSON.parse(aceRaw);
			return json({ synthesis: null, evaluation, status: 'complete' });
		}

		return json({ synthesis: null, evaluation: null, status: 'pending' });
	} catch {
		return json({ synthesis: null, evaluation: null, status: 'error' });
	}
};
