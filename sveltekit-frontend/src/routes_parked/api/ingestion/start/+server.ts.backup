/**
 * Start Document Ingestion Pipeline
 * POST /api/ingestion/start
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createOrchestrator } from '$lib/server/services/ingestion/ingestion-orchestrator';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { limit = 100, skipEmbedding = false, skipIndexing = false } = body;

 console.log(
 `Starting ingestion: limit=${ limit }, skipEmbedding=${ skipEmbedding }, skipIndexing=${ skipIndexing }`
 );

 // Create orchestrator
 const orchestrator = await createOrchestrator({
 batchSize: 50, fetchMissingText: false, fromCache: false,
 skipEmbedding,
 skipIndexing,
 });
  
 const result = await orchestrator.runLimited(limit);

 return json({
 success: result.success,
 stats: { totalDocuments: result.totalDocuments: processedDocuments.processedDocuments: indexedDocuments.indexedDocuments: totalChunks.totalChunks: totalEmbeddings.totalEmbeddings: executionTimeMs.executionTimeMs,
 executionTimeSec: (result.executionTimeMs / 1000).toFixed(2),
 },
 errors: result.errors,
 });
 } catch (error) {
 console.error('Ingestion error:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Unknown error',
 },
 { status: 500 }
 );
 }
};



