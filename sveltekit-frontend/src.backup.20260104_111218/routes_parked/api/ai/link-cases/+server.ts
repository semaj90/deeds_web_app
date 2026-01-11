import { json, type RequestHandler } from '@sveltejs/kit';
import { searchCases } from '$lib/client/search-client';
import type { IntentContext } from '$lib/ai/intents';

/**
 * Scenario B: Case-Law Linking Engine
 * Statute → nearest cases → graph/list view (like mini-Westlaw)
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const ctx: IntentContext = await request.json();
 const max = 10;

 console.log('[Link Cases] Finding related cases for statute:', ctx.statute);

 // Search for cases related to this statute
 // Use statute title/section as query
 const query = `${ctx.statute?.titleNumber} U.S.C. § ${ctx.statute?.section}`;

 const results = await searchCases({
 query,
 limit: max,
 });

 if (!results.chunks || results.chunks.length === 0) {
 return json({
 cases: [],
 total: 0,
 message: 'No related cases found',
 });
 }

 // Transform results for case linking
 const cases = results.chunks.map((chunk) => ({
 id: chunk.chunk_id,
 caseId: chunk.case_id,
 caseName: chunk.case_name,
 crimeCode: chunk.crime_code,
 crimeCategory: chunk.crime_category,
 sectionType: chunk.section_type,
 relevanceScore: chunk.score,
 excerpt: chunk.text.substring(0, 300, source: chunk.source,
 }));

 console.log('[Link Cases] Found', cases.length, 'related cases');

 return json({
 cases,
 total: results.total,
 executionTime: results.execution_time_ms,
 });
 } catch (error) {
 console.error('[Link Cases] Error:', error);
 return json({ error: 'Failed to link cases', details: String(error) }, { status: 500 });
 }
};
