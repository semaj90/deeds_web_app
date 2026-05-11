import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { legalNodes } from '$lib/server/db/schema/legal-nodes';
import { LegalCitationService } from '$lib/server/legal/citation-service';
import { ENV } from '$lib/server/env.server.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { sql } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// 1. Create a background job record
		const result = await db.execute(sql`
			INSERT INTO indexing_jobs (type, status, metadata)
			VALUES ('citation_discovery', 'running', '{"step": "scanning_nodes"}'::jsonb)
			RETURNING id
		`);
		const job = result.rows[0];
		const jobId = (job as any).id;

		// 2. Start the process in the background
		(async () => {
			try {
				const nodes = await db.select({
					id: legalNodes.id,
					fullText: legalNodes.fullText
				}).from(legalNodes);

				await db.execute(sql`
					UPDATE indexing_jobs 
					SET total = ${nodes.length}, metadata = jsonb_set(metadata, '{step}', '"processing_citations"')
					WHERE id = ${jobId}
				`);

				let count = 0;
				for (const node of nodes) {
					await LegalCitationService.linkCitationsForNode(node.id, node.fullText);
					count++;
					
					// Update progress every 50 nodes
					if (count % 50 === 0) {
						await db.execute(sql`
							UPDATE indexing_jobs SET progress = ${count} WHERE id = ${jobId}
						`);
					}
				}

				await db.execute(sql`
					UPDATE indexing_jobs 
					SET status = 'completed', progress = ${nodes.length}, updatedAt = NOW()
					WHERE id = ${jobId}
				`);

				productionLogger.info(`Citation discovery complete: ${nodes.length} nodes scanned`, { jobId });
			} catch (err: any) {
				console.error(`[Citation Discovery] Job ${jobId} failed:`, err);
				await db.execute(sql`
					UPDATE indexing_jobs 
					SET status = 'failed', error = ${err.message}, updatedAt = NOW()
					WHERE id = ${jobId}
				`);
			}
		})();

		return json({ 
			ok: true, 
			jobId,
			message: 'Citation discovery started in background.'
		});
	} catch (err: any) {
		console.error('[Citation Discovery] Error:', err);
		return json({ error: `Failed to start citation discovery: ${err.message}` }, { status: 500 });
	}
};
