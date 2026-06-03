import type { PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/client';
import { taskSemanticPackets, agentPickupQueue } from '$lib/server/db/schema/tasks.js';
import { desc, sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.id) throw redirect(303, '/login?redirect=/demos/gpu-pipeline');

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	// Packet counts by status + queue depth in parallel
	const [statusCounts, queueItems, karpathyData] = await Promise.all([
		safe(
			db
				.select({
					status: taskSemanticPackets.status,
					count: sql<number>`count(*)::int`,
				})
				.from(taskSemanticPackets)
				.groupBy(taskSemanticPackets.status),
			[]
		),
		safe(
			db
				.select({
					id: agentPickupQueue.id,
					packet_id: agentPickupQueue.packet_id,
					lane: agentPickupQueue.lane,
					status: agentPickupQueue.status,
					attempts: agentPickupQueue.attempts,
					created_at: agentPickupQueue.created_at,
					picked_up_at: agentPickupQueue.picked_up_at,
				})
				.from(agentPickupQueue)
				.orderBy(desc(agentPickupQueue.created_at))
				.limit(10),
			[]
		),
		safe(
			(async () => {
				const redis = getRedis();
				const [summaryRaw, topScores] = await Promise.all([
					redis.get('gpu:karpathy:summary'),
					redis.hrandfield('gpu:karpathy:scores', 10, 'WITHVALUES'),
				]);
				const summary = summaryRaw ? JSON.parse(summaryRaw) : null;
				// hrandfield WITHVALUES returns [key, val, key, val, ...]
				const scores: { file: string; pr: number; attention: number; authority: number; blend: number }[] = [];
				if (Array.isArray(topScores)) {
					for (let i = 0; i < topScores.length; i += 2) {
						try {
							const parsed = JSON.parse(String(topScores[i + 1]));
							scores.push({ file: String(topScores[i]), ...parsed });
						} catch {
							// skip malformed
						}
					}
				}
				scores.sort((a, b) => b.blend - a.blend);
				return { summary, scores };
			})(),
			{ summary: null, scores: [] }
		),
	]);

	// Build status map
	const statusMap: Record<string, number> = { todo: 0, doing: 0, blocked: 0, done: 0 };
	for (const row of statusCounts) {
		if (row.status && row.status in statusMap) statusMap[row.status] = row.count;
	}
	const totalPackets = Object.values(statusMap).reduce((a, b) => a + b, 0);

	return {
		statusMap,
		totalPackets,
		queueItems,
		queueDepth: queueItems.filter((q) => !q.picked_up_at).length,
		karpathy: karpathyData,
	};
};
