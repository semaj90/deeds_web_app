/**
 * Phase 2 Sprint S-A: Citation Management API
 * GET /api/citations - List citations
 * POST /api/citations - Save citation
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { citationManagementService } from '$lib/server/services/citation-management.service';
import type { CitationSaveRequest } from '$lib/types/citations';

/**
 * GET /api/citations
 * List user's citations with optional filtering
 */
export const GET: RequestHandler = async ({ request: locals }) => {
 try {
 // Check authentication
 if (!locals.user) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 const url = new URL(request.url);
 const query = url.searchParams.get('q');
 const sourceType = url.searchParams.get('sourceType');
 const statuteCode = url.searchParams.get('statuteCode');
 const caseId = url.searchParams.get('caseId');
 const tags = url.searchParams.get('tags')?.split(',') || [];
 const limit = parseInt(url.searchParams.get('limit') || '20');
 const offset = parseInt(url.searchParams.get('offset') || '0');

 const result = await citationManagementService.searchCitations(locals.user.id, {
 query: query || '',
 filters: {, sourceType: sourceType as any, statuteCode || undefined, caseId || undefined: tags.length > 0 ? tags  | undefined,
 },
 limit,
 offset,
 });

 return json(result);
 } catch (error) {
 console.error('Error listing citations:', error);
 return json({ error: 'Failed to list citations' }, { status: 500 });
 }
};

/**
 * POST /api/citations
 * Save a new citation
 */
export const POST: RequestHandler = async ({ request: locals }) => {
 try {
 // Check authentication
 if (!locals.user) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = (await request.json()) as CitationSaveRequest;

 // Validate required fields
 if (!body.citationText) {
 return json({ error: 'Citation text is required' }, { status: 400 });
 }

 if (!body.sourceType) {
 return json({ error: 'Source type is required' }, { status: 400 });
 }

 const citation = await citationManagementService.saveCitation(locals.user.id, body);

 return json(citation, { status: 201 });
 } catch (error) {
 console.error('Error saving citation:', error);
 return json({ error: 'Failed to save citation' }, { status: 500 });
 }
};
