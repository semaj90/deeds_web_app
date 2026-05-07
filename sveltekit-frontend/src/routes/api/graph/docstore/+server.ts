/**
 * GET /api/graph/docstore
 *
 * Query the agentic codebase document store indexed by
 * `scripts/wiki/index-codebase-to-docstore.mjs`.
 *
 * Query params:
 *   type=cluster|reltype|edge_summary|ace_spine  (default: all)
 *   cluster=cluster:gpu:6                         (filter by cluster key)
 *   reltype=READS_REDIS_KEY                       (filter by relation type)
 *   files=true                                    (include per-cluster file list)
 *   limit=20                                      (default 20)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const type       = url.searchParams.get('type') ?? 'all';
	const clusterKey = url.searchParams.get('cluster');
	const relType    = url.searchParams.get('reltype');
	const withFiles  = url.searchParams.get('files') === 'true';
	const limit      = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

	const redis = getRedis();

	try {
		// Single cluster card
		if (clusterKey) {
			const raw = await redis.get(`codebase:docstore:cluster:${clusterKey}`);
			if (!raw) return json({ card: null, source: 'redis-miss' });
			const card = JSON.parse(raw);
			if (withFiles) {
				const filesRaw = await redis.get(`codebase:docstore:files:${clusterKey}`);
				card.all_files = filesRaw ? JSON.parse(filesRaw) : card.all_files;
			}
			return json({ card, source: 'redis' });
		}

		// Single relation type card
		if (relType) {
			const raw = await redis.get(`codebase:docstore:reltype:${relType}`);
			if (!raw) return json({ card: null, source: 'redis-miss' });
			return json({ card: JSON.parse(raw), source: 'redis' });
		}

		// List all cards of a type
		const results: unknown[] = [];

		if (type === 'all' || type === 'edge_summary') {
			const raw = await redis.get('codebase:docstore:edge_summary');
			if (raw) results.push(JSON.parse(raw));
		}

		if (type === 'all' || type === 'ace_spine') {
			const raw = await redis.get('codebase:docstore:ace_spine');
			if (raw) results.push(JSON.parse(raw));
		}

		if (type === 'all' || type === 'cluster') {
			const keys = await redis.keys('codebase:docstore:cluster:*');
			const batch = await Promise.all(
				keys.slice(0, limit).map(k => redis.get(k))
			);
			for (const raw of batch) {
				if (raw) results.push(JSON.parse(raw));
			}
		}

		if (type === 'all' || type === 'reltype') {
			const keys = await redis.keys('codebase:docstore:reltype:*');
			const batch = await Promise.all(keys.map(k => redis.get(k)));
			for (const raw of batch) {
				if (raw) results.push(JSON.parse(raw));
			}
		}

		// Last run metadata
		const lastRun = await redis.get('codebase:docstore:last_run').then(r => r ? JSON.parse(r) : null);

		return json({
			cards: results.slice(0, limit),
			total: results.length,
			lastRun,
			source: 'redis',
		});

	} catch (err) {
		return json({ cards: [], total: 0, lastRun: null, source: 'error', error: String(err) });
	}
};
