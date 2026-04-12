/**
 * POST /api/audit/gpu — Run unified GPU codebase audit
 *
 * Orchestrates: Neo4j PageRank + community detection → Qdrant vector fetch
 * → LibTorch GPU similarity matrix + K-means clustering → Postgres report.
 *
 * Body: {
 *   caseId?: string,
 *   maxNodes?: number (default 500),
 *   clusterCount?: number (default auto),
 *   maxVectors?: number (default 500),
 *   dupThreshold?: number (default 0.92),
 *   halfPrecision?: boolean (default false),
 *   skipGraph?: boolean (default false),
 *   skipCodebase?: boolean (default false),
 *   persist?: boolean (default true)
 * }
 *
 * GET /api/audit/gpu — Retrieve latest GPU audit report
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import {
	runGpuAudit,
	persistAuditReport,
	getLatestAuditReport,
} from '$lib/server/audit/gpu-audit-orchestrator.js';

const auditSchema = z.object({
	caseId: z.string().uuid().optional(),
	maxNodes: z.number().int().min(10).max(5000).optional().default(500),
	clusterCount: z.number().int().min(2).max(50).optional(),
	maxVectors: z.number().int().min(10).max(2000).optional().default(500),
	dupThreshold: z.number().min(0.80).max(0.99).optional().default(0.92),
	halfPrecision: z.boolean().optional().default(false),
	skipGraph: z.boolean().optional().default(false),
	skipCodebase: z.boolean().optional().default(false),
	persist: z.boolean().optional().default(true),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = auditSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const report = await runGpuAudit({
			...parsed.data,
			userId: locals.user.id,
		});

		let reportId: string | undefined;
		if (parsed.data.persist) {
			try {
				reportId = await persistAuditReport(report);
			} catch (err) {
				console.warn('[/api/audit/gpu] Persist failed:', (err as Error)?.message);
			}
		}

		return json({
			success: true,
			reportId,
			report,
		});
	} catch (err) {
		console.error('[/api/audit/gpu] Audit failed:', (err as Error)?.message);
		return json({ error: 'GPU audit failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const caseId = url.searchParams.get('caseId') ?? undefined;
		const report = await getLatestAuditReport(caseId);

		const responseData = report
			? { report }
			: { report: null, message: 'No GPU audit reports found. Run POST /api/audit/gpu first.' };

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('[/api/audit/gpu] GET failed:', (err as Error)?.message);
		return json({ report: null, message: 'Failed to retrieve audit report' }, {
			headers: cacheControl.short
		});
	}
};
