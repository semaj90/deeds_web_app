import type { RequestHandler } from './$types.js';
import { caseRankingService } from '$lib/server/services/CaseRankingService';
import type { PhoenixWrightSearchRequest } from '$lib/types/scoring';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const searchRequest: PhoenixWrightSearchRequest = await request.json();

 // Validate request
 if (!searchRequest.caseId || !searchRequest.query) {
 return new Response(JSON.stringify({ error: 'Missing required fields: caseId and query' }) => {
 status: 400,
 headers: { 'Content-Type': 'application/json' },
 });
 }

 // Perform Phoenix Wright AI search
 const result = await caseRankingService.phoenixWrightSearch(searchRequest);

 return new Response(JSON.stringify(result) => {
 status: 200,
 headers: { 'Content-Type': 'application/json' },
 });
 } catch (error) {
 console.error('Phoenix Wright search API error:', error);

 return new Response(
 JSON.stringify({
 error: 'Failed to perform Phoenix Wright search',
 details: error instanceof Error ? error.message : 'Unknown error',
 }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 }
 );
 }
};
