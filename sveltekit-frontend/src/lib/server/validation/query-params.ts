/**
 * Reusable Zod schemas for common URL query parameters
 * Use with url.searchParams in GET route handlers
 */
import { z } from 'zod';

/**
 * Pagination parameters (limit, offset)
 * Usage: paginationSchema.parse({ limit: '10', offset: '0' })
 */
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
	offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * Search query parameter
 * Usage: searchQuerySchema.parse({ q: 'search term' })
 */
export const searchQuerySchema = z.object({
	q: z.string().min(1).max(500).optional(),
	query: z.string().min(1).max(500).optional(),
}).refine(data => data.q || data.query, {
	message: 'Either q or query parameter is required',
});

/**
 * Optional search query (doesn't require q/query to be present)
 */
export const optionalSearchSchema = z.object({
	q: z.string().min(1).max(500).optional(),
	query: z.string().min(1).max(500).optional(),
});

/**
 * Filter parameters
 */
export const filterSchema = z.object({
	filter: z.string().max(200).optional(),
	type: z.string().max(50).optional(),
	status: z.string().max(50).optional(),
});

/**
 * Date range parameters
 */
export const dateRangeSchema = z.object({
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

/**
 * Sort parameters
 */
export const sortSchema = z.object({
	sortBy: z.string().max(50).optional(),
	sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
	orderBy: z.string().max(50).optional(),
	order: z.enum(['asc', 'desc']).optional(),
});

/**
 * UUID parameter (for route parameters like [id])
 */
export const uuidSchema = z.string().uuid();

/**
 * Similarity search with query and limit
 */
export const similaritySearchSchema = z.object({
	q: z.string().min(1).max(500),
	limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

/**
 * Combined pagination + search + filter
 */
export const listQuerySchema = paginationSchema.merge(optionalSearchSchema).merge(filterSchema).merge(sortSchema);

/**
 * Helper to parse URLSearchParams into object for Zod validation
 */
export function parseSearchParams(searchParams: URLSearchParams): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of searchParams.entries()) {
		result[key] = value;
	}
	return result;
}

/**
 * Type-safe URL param parser with Zod validation
 * Usage:
 *   const { limit, offset } = validateSearchParams(url.searchParams, paginationSchema);
 */
export function validateSearchParams<T extends z.ZodTypeAny>(
	searchParams: URLSearchParams,
	schema: T
): z.infer<T> {
	const params = parseSearchParams(searchParams);
	return schema.parse(params);
}