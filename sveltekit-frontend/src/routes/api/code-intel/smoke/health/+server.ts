import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { checkSystemHealth } from '$lib/server/ai/code-intel-service.js';

const HealthCheckSchema = z.object({}).optional();

export async function POST({ request, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	HealthCheckSchema.parse(await request.json().catch(() => ({})));
	const health = await checkSystemHealth();
	return json(health);
}
