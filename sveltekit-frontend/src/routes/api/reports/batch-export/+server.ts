import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { inArray, and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const batchExportSchema = z.object({
	ids: z.array(z.string()).min(1).max(50),
	format: z.enum(['html', 'markdown', 'json']).default('json'),
});

/**
 * Bounded-concurrency Promise.allSettled — processes items with at most `limit`
 * concurrent workers. Prevents OOM from fan-out on large HTML/markdown renders.
 */
async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < items.length) {
			const i = next++;
			try {
				results[i] = { status: 'fulfilled', value: await fn(items[i]) };
			} catch (reason) {
				results[i] = { status: 'rejected', reason };
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	return results;
}

/**
 * POST /api/reports/batch-export
 * Export multiple reports in parallel. Returns a JSON array of results.
 * Limited to 50 reports per batch. Binary formats (pdf/docx) not supported
 * in batch mode — use the per-report /api/reports/[id]/export endpoint.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const raw = await request.json();
	const parsed = batchExportSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
	}

	const { ids, format } = parsed.data;

	// Validate all IDs are UUIDs
	const validIds = ids.filter(isUuid);
	if (validIds.length === 0) {
		throw error(400, 'No valid UUIDs provided');
	}

	// Fetch all reports owned by the user in one query
	const rows = await db
		.select()
		.from(reports)
		.where(
			and(
				inArray(reports.id, validIds),
				eq(reports.createdBy, locals.user.id)
			)
		);

	const rowMap = new Map(rows.map(r => [r.id, r]));

	// Process exports with bounded concurrency (cap=2 — avoids OOM on large HTML/markdown renders)
	const EXPORT_CONCURRENCY = 2;
	const results = await mapLimit(validIds, EXPORT_CONCURRENCY, async (id) => {
		const report = rowMap.get(id);
		if (!report) return { id, error: 'Not found', status: 404 };

		try {
			let content: string;
			switch (format) {
				case 'html':
					content = `<h1>${escapeHtml(report.title)}</h1>\n${report.content || ''}`;
					break;
				case 'markdown':
					content = `# ${report.title}\n\n${stripHtml(report.content || '')}`;
					break;
				case 'json':
				default:
					content = JSON.stringify({
						id: report.id,
						title: report.title,
						status: report.status,
						content: report.content,
						metadata: report.metadata,
						createdAt: report.createdAt,
						updatedAt: report.updatedAt,
					});
					break;
			}
			return { id, title: report.title, format, content, status: 200 };
		} catch (err) {
			return { id, error: (err as Error).message, status: 500 };
		}
	});

	const exports = results.map((r) =>
		r.status === 'fulfilled' ? r.value : { id: 'unknown', error: 'Internal error', status: 500 }
	);

	return json({
		total: validIds.length,
		succeeded: exports.filter(e => e.status === 200).length,
		failed: exports.filter(e => e.status !== 200).length,
		exports,
	});
};



function escapeHtml(text: string): string {
	const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

function stripHtml(html: string): string {
	return html
		.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '## $1\n\n')
		.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
