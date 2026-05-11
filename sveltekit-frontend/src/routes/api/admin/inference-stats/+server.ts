import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// 1. Get recent inferences by hour (last 24h)
		const byHourResult = await db.execute(sql`
			SELECT 
				date_trunc('hour', timestamp) as hour,
				count(*) as count,
				avg((data->>'duration')::float) as avg_latency
			FROM admin_telemetry
			WHERE type = 'inference' 
			  AND timestamp > NOW() - INTERVAL '24 hours'
			GROUP BY hour
			ORDER BY hour DESC
		`);

		// 2. Get active model weights (from config or a dedicated table)
		// For now, we'll return some baseline info from ENV and what's in the DB
		const modelWeights = [
			{ component: 'llm:gemma4-legal', version: '1.4.0', status: 'active' },
			{ component: 'embedding:gemma', version: '1.2.1', status: 'active' },
			{ component: 'vlm:yolo-v8', version: '0.9.4', status: 'candidate' },
			{ component: 'audio:whisper-v3', version: '1.0.0', status: 'active' }
		];

		// 3. Get context timeline events (RL feedback signals)
		const timelineEvents = await db.execute(sql`
			SELECT id, event_type, signal, pipeline, grpo_reward, created_at
			FROM context_timeline
			ORDER BY created_at DESC
			LIMIT 15
		`);

		// 4. Get context compression events
		const compressionEvents = await db.execute(sql`
			SELECT id, data, timestamp
			FROM admin_telemetry
			WHERE type = 'context_compression'
			ORDER BY timestamp DESC
			LIMIT 10
		`);

		// 4. Get total counts and P95 latency
		const totals = await db.execute(sql`
			SELECT 
				count(*) filter (where type = 'inference') as total_inferences,
				count(*) filter (where type = 'error' OR (data->>'status') = 'error') as total_errors,
				avg((data->>'duration')::float) filter (where type = 'inference') as avg_latency,
				PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'duration')::float) filter (where type = 'inference') as p95_latency
			FROM admin_telemetry
			WHERE timestamp > NOW() - INTERVAL '24 hours'
		`);

		const totalRows = extractRows(totals)[0];

		return json({
			queriedAt: new Date().toISOString(),
			byHour: extractRows(byHourResult).map(r => ({ hour: r.hour, value: { count: parseInt(r.count), avg_latency: parseFloat(r.avg_latency) } })),
			modelWeights,
			timelineEvents: extractRows(timelineEvents),
			compressionEvents: extractRows(compressionEvents),
			totals: {
				total_inferences: parseInt(totalRows.total_inferences || 0),
				total_errors: parseInt(totalRows.total_errors || 0),
				avg_latency: parseFloat(totalRows.avg_latency || 0),
				p95_latency: parseFloat(totalRows.p95_latency || 0)
			}
		});

	} catch (err) {
		console.error('[Inference Stats] Error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

function extractRows(result: any) {
	return Array.isArray(result) ? result : (result.rows || []);
}
