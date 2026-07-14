/**
 * /api/admin/summaries/scan-quality — Scan summaries for quality issues
 *
 * GET — run scan and return report
 * POST { action: 'regenerate', limit: 100 } — queue regenerations
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	scanAllSummaries,
	getRegenerationCandidates,
	formatReport,
} from '$lib/server/indexer/bad-summary-scanner.js';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		return json({ error: 'Admin only' }, { status: 403 });
	}

	try {
		const report = await scanAllSummaries();
		const formatted = formatReport(report);

		return json({
			success: true,
			report,
			formatted,
		});
	} catch (err) {
		return json(
			{
				error: 'Scan failed',
				details: (err as Error).message,
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin') {
		return json({ error: 'Admin only' }, { status: 403 });
	}

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

	if (body.action === 'regenerate') {
		try {
			const limit = (body.limit as number) ?? 100;
			const candidates = await getRegenerationCandidates();
			const toRegenerate = candidates.slice(0, limit);

			// Queue regeneration in Redis
			const redis = getRedis();
			const queueKey = 'summary:regeneration:queue';

			for (const packetKey of toRegenerate) {
				await redis.rpush(queueKey, packetKey);
			}

			return json({
				success: true,
				queued: toRegenerate.length,
				total_candidates: candidates.length,
				message: `${toRegenerate.length} summaries queued for regeneration`,
			});
		} catch (err) {
			return json(
				{
					error: 'Regeneration queue failed',
					details: (err as Error).message,
				},
				{ status: 500 }
			);
		}
	}

	if (body.action === 'check-queue') {
		try {
			const redis = getRedis();
			const queueKey = 'summary:regeneration:queue';
			const queueSize = await redis.llen(queueKey);

			return json({
				success: true,
				queue_size: queueSize,
				message: `${queueSize} summaries in regeneration queue`,
			});
		} catch (err) {
			return json(
				{
					error: 'Queue check failed',
					details: (err as Error).message,
				},
				{ status: 500 }
			);
		}
	}

	return json({ error: 'Unknown action' }, { status: 400 });
};
