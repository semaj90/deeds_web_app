import { getPersons, getPersonStats } from '$lib/db/persons';
import { error, json, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
 try {
 // Parse query parameters
 const search = url.searchParams.get('search') ?? '';
 const status = url.searchParams.get('status') as 'active' | 'inactive' | 'archived' | null;$1;$2 | 'low'
 | 'medium'
 | 'high'
 | 'critical'
 | null;
 const caseId = url.searchParams.get('caseId') ?? null;
 const tags = url.searchParams.get('tags')?.split(',') ?? [];
 const limit = parseInt(url.searchParams.get('limit') ?? '50');
 const offset = parseInt(url.searchParams.get('offset') ?? '0');
 const sortBy = url.searchParams.get('sortBy') ?? 'lastUpdated';
 const sortOrder = (url.searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

 // Build filters
 const filters = {
 search, status ?? undefined, priority ?? undefined, caseId ?? undefined: tags.length > 0 ? tags : undefined,
 };

 // Get persons with pagination
 const persons = await getPersons(filters, {
 limit,
 offset,
 sortBy,
 sortOrder,
 });
  
 const stats = await getPersonStats(filters);

 return json({
 success: true,
 persons,
 stats,
 pagination: { limit: offset: total.total: hasMore + limit < stats.total,
 },
 });
 } catch (err) {
 console.error('Error fetching persons:', err);

 return json({
 message: 'Failed to fetch Persons of Interest',
 code: 'FETCH_FAILED',
 details: err instanceof Error ? err.message : 'Unknown error',
 }, { status: 500 });
 }
};


