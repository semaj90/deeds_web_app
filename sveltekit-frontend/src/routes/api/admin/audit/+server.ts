/**
 * GET /api/admin/audit
 * Query the api_audit_log table with pagination + filters.
 * Immutable log — POST/PUT/PATCH/DELETE return 405.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { pool } from '$lib/server/db/client';
import { z } from 'zod';

const querySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	method: z.string().max(10).optional(),
	pathPrefix: z.string().max(200).optional(),
	statusMin: z.coerce.number().int().min(100).max(599).optional(),
	statusMax: z.coerce.number().int().min(100).max(599).optional(),
	userId: z.string().uuid().optional(),
	since: z.string().datetime().optional(),
	until: z.string().datetime().optional(),
});

export async function GET({ url, locals, request }: RequestEvent) {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = Object.fromEntries(url.searchParams);
	const parsed = querySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	}

	const { page, limit, method, pathPrefix, statusMin, statusMax, userId, since, until } = parsed.data;

	try {
		const conditions: string[] = [];
		const values: unknown[] = [];
		let paramIdx = 1;

		if (method) {
			conditions.push(`method = $${paramIdx++}`);
			values.push(method.toUpperCase());
		}
		if (pathPrefix) {
			conditions.push(`path LIKE $${paramIdx++}`);
			values.push(`${pathPrefix}%`);
		}
		if (statusMin) {
			conditions.push(`status_code >= $${paramIdx++}`);
			values.push(statusMin);
		}
		if (statusMax) {
			conditions.push(`status_code <= $${paramIdx++}`);
			values.push(statusMax);
		}
		if (userId) {
			conditions.push(`user_id = $${paramIdx++}`);
			values.push(userId);
		}
		if (since) {
			conditions.push(`created_at >= $${paramIdx++}`);
			values.push(since);
		}
		if (until) {
			conditions.push(`created_at <= $${paramIdx++}`);
			values.push(until);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
		const offset = (page - 1) * limit;

		const [dataResult, countResult] = await Promise.all([
			pool.query(
				`SELECT id, request_id, method, path, status_code, duration_ms, user_id, ip_address, created_at
				 FROM api_audit_log ${whereClause}
				 ORDER BY created_at DESC
				 LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
				[...values, limit, offset]
			),
			pool.query(
				`SELECT COUNT(*) as total FROM api_audit_log ${whereClause}`,
				values
			),
		]);

		const responseData = {
			entries: dataResult.rows,
			pagination: {
				page,
				limit,
				total: parseInt(countResult.rows[0]?.total ?? '0'),
				pages: Math.ceil(parseInt(countResult.rows[0]?.total ?? '0') / limit),
			},
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('Audit query error:', err);
		return json({ entries: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } }, {
			headers: cacheControl.short
		});
	}
}

/** Immutable log — reject all mutations */
const reject = () => json({ error: 'Audit log is immutable' }, { status: 405 });
export const POST = reject;
export const PUT = reject;
export const PATCH = reject;
export const DELETE = reject;
