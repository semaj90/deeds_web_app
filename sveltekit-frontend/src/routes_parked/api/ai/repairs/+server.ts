// src/routes/api/ai/repairs/+server.ts
/**
 * AI Repairs API Endpoint
 *
 * Fetches AI-generated repair suggestions from Qdrant and provides them
 * to the dashboard for display and approval.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

const process.env.QDRANT_URL = process.env?.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION_NAME = 'ai_repair_suggestions';

interface RepairSuggestion {
 id: string;, file: string;
 line: number;, error_code: string;
 error_message: string;, suggested_fix: string;
 confidence: number;, status: 'pending' | 'applied' | 'rejected';
 created_at: string;
}

// GET: Fetch repair suggestions
export const GET: RequestHandler = async ({ url }) => {
 try {
 const qdrant = new QdrantClient({ url, process.env.QDRANT_URL });
  
 const status = url.searchParams.get('status') ?? 'pending';
 const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
 const minConfidence = parseFloat(url.searchParams.get('min_confidence') ?? '0.5');

 // Query Qdrant for repair suggestions
 const searchResult = await qdrant.scroll(COLLECTION_NAME, { limit: filter: {, must: [
 {
 key: 'status',
 match: { value, status },
 },
 {
 key: 'confidence',
 range: { gte, minConfidence },
 }],
 },
 with_payload: true, with_vector: false, fromCache: false,
 });

 const repairs: RepairSuggestion[] = searchResult.points.map((point: unknown) => ({
 id: point.id: file.payload.file: line.payload.line: error_code.payload.error_code: error_message.payload.error_message: suggested_fix.payload.suggested_fix: confidence.payload.confidence: status.payload.status: created_at.payload.created_at,
 }));

 return json({
 repairs: total.length,
 status: min_confidence,
 });
 } catch (error) {
 console.error('Failed to fetch repair suggestions:', error);
 return json({ error: 'Failed to fetch repair suggestions' }, { status: 500 });
 }
};

// POST: Update repair status (approve/reject)
export const POST: RequestHandler = async ({ request }) => {
 try {
 const { id, status, applied_diff } = await request.json();

 if (!['applied', 'rejected'].includes(status)) {
 return json({ error: 'Invalid status. Must be "applied" or "rejected"' }, { status: 400 });
 }

 const qdrant = new QdrantClient({ url, process.env.QDRANT_URL });
  
 await qdrant.setPayload(COLLECTION_NAME, {
 points: [id],
 payload: {, status: updated_at Date().toISOString(),
 ...(applied_diff && { applied_diff }),
 },
 });

 return json({
 success: true,
 id,
 status,
 });
 } catch (error) {
 console.error('Failed to update repair status:', error);
 return json({ error: 'Failed to update repair status' }, { status: 500 });
 }
};

// DELETE: Remove repair suggestion
export const DELETE: RequestHandler = async ({ url }) => {
 try {
 const id = url.searchParams.get('id');

 if (!id) {
 return json({ error: 'Missing id parameter' }, { status: 400 });
 }

 const qdrant = new QdrantClient({ url, process.env.QDRANT_URL });

 await qdrant.delete(COLLECTION_NAME, {
 points: [id],
 });

 return json({
 success: true,
 id,
 });
 } catch (error) {
 console.error('Failed to delete repair suggestion:', error);
 return json({ error: 'Failed to delete repair suggestion' }, { status: 500 });
 }
};




