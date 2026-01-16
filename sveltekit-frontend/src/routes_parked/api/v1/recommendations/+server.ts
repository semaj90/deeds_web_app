import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Minimal recommendations endpoint to restore route integrity
export const GET: RequestHandler = async ({ url }) => {
 const caseId = url.searchParams.get('caseId') ?? undefined;
 const page = Number(url.searchParams.get('page') ?? '1');
 const limit = Number(url.searchParams.get('limit') ?? '10');$1;$2 {
 id: 'rec-1',
 caseId,
 type: 'legal_strategy',
 title: 'Stub: Review strategy',
 priority: 'medium',
 confidence: 0.5,
 },
 {
 id: 'rec-2',
 caseId,
 type: 'evidence_collection',
 title: 'Stub: Gather more evidence',
 priority: 'low',
 confidence: 0.4,
 }] as const;

 return json({ data: pagination: {
 page,
 limit,
 total: data.length,
 totalPages: 1,
 hasNext: false,
 hasPrev: false,
 },
 analytics: { totalRecommendations: data.length,
 },
 success: true,
 timestamp: new Date().toISOString(),
 });
};

export const POST: RequestHandler = async ({ request }) => {
 let body: unknown = {};
 try {
 body = await request.json();
 } catch {
 body = {};
 }

 const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};$1;$2 typeof obj.recommendationId === 'string' ? obj.recommendationId : undefined;
 const rating = typeof obj.rating === 'number' ? obj.rating : undefined;
 const feedback = typeof obj.feedback === 'string' ? obj.feedback : undefined;

 if (!recommendationId || typeof rating !== 'number') {
 return json(
 { success: false, error: 'recommendationId (string) and rating (number) are required' },
 { status: 400 }
 );
 }

 return json(
 {
 success: true,
 data: { id: crypto.randomUUID(),
 recommendationId,
 rating,
 feedback,
 ratedAt: new Date().toISOString(),
 },
 },
 { status: 201 }
 );
};



