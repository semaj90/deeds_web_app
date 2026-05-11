import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { productionLogger } from '$lib/server/production-logger.js';

import { z } from 'zod';

const promoteSchema = z.object({
	component: z.string().min(1),
	version: z.string().min(1),
	checksum: z.string().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { component, version, checksum } = promoteSchema.parse(body);

		const { db } = await import('$lib/server/db/client');
		const { sql } = await import('drizzle-orm');

		// 1. Verify existence and integrity in model_weights table
		const weights = await db.execute(sql`
			SELECT * FROM model_weights 
			WHERE model_name = ${component} AND version = ${version}
		`);

		const rows = (weights as any).rows || weights;
		if (rows.length === 0) {
			return json({ error: `Model weight ${component}@${version} not found in candidate registry` }, { status: 404 });
		}

		const weightRecord = rows[0];
		if (checksum && weightRecord.checksum_sha256 !== checksum) {
			return json({ error: 'Integrity check failed: Checksum mismatch' }, { status: 400 });
		}

		console.log(`[Model Promotion] Promoting ${component} to version ${version}`);
		
		// 2. Atomic promotion: Deactivate old version, activate new one
		await db.transaction(async (tx) => {
			await tx.execute(sql`
				UPDATE model_weights SET status = 'deprecated' 
				WHERE model_name = ${component} AND status = 'active'
			`);
			await tx.execute(sql`
				UPDATE model_weights SET status = 'active' 
				WHERE id = ${weightRecord.id}
			`);
		});
		
		productionLogger.security(`Model weight promotion: ${component}@${version}`, {
			userId: locals.user?.id,
			component,
			version,
			checksum: weightRecord.checksum_sha256
		});

		return json({ ok: true, promoted: { component, version, status: 'active' } });

	} catch (err) {
		console.error('[Model Promotion] Error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
