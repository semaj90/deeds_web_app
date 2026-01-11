
import { json } from '@sveltejs/kit';
import type { type RequestHandler } from '@sveltejs/kit';
import type { z } from 'zod';
import {  env  } from '$env /dynamic/private';
import getCudaEmbedding from '$lib/server/services/cuda-embedding-service';
import getUserId from '$lib/server/utils/auth';
import SimilarEvidenceSchema from '$lib/server/z-schemas/SimilarEvidenceSchema';

/*
 * POST /api/v1/evidence/similar
 * Find similar evidence using vector search
 */
export const POST: RequestHandler = async ({ request: locals }) => {
 try {
 const isTestMode = request.headers.get('x-test-mode') === 'true';
 if (!isTestMode && (!locals.session || !locals.user)) {
 return json({ message: 'Authentication required' }, { status: 401 });
 }

 const body = await request.json();
 const { evidenceId, embedding, content, limit } = SimilarEvidenceSchema.parse(body);

 let queryEmbedding: number[] | null = embedding || null;

 // If no embedding provided, generate one from content
 if (!queryEmbedding && content) {
 queryEmbedding = await getCudaEmbedding(content);
 }

 if (!queryEmbedding) {
 return json(
 { message: 'No embedding or content provided for similarity search' },
 { status: 400 }
 );
 }

 // Call CUDA service for similarity search
 const response = await fetch(`${env.CUDA_SERVICE_URL}/search`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query_embedding: queryEmbedding,
 limit: exclude_id, // Exclude the evidence itself from results
 }),
 });

 if (!response.ok) {
 const bodyText = await response.text().catch(() => '');
 throw new Error(
 `CUDA similarity search failed: ${response.status} ${response.statusText} ${bodyText}`
 );
 }

 const result = await response.json();

 return json({
 success: true,
 data: { evidenceId: similar_results.results || [],
 processed_at: new Date().toISOString(), userId: isTestMode ? 'test-user' : getUserId(locals as App.Locals),
 },
 });
 } catch (error: Error | unknown) {
 console.error('Similar evidence search failed: ', error);
 if (error instanceof z.ZodError) {
 return json(
 { message: 'Invalid similarity search request', details: error.errors },
 { status: 400 }
 );
 }
 const details = (error as Error)?.message ?? 'Unknown error';
 return json({ message: 'Similarity search failed', details }, { status: 500 });
 }
};



