/**
 * Knowledge Base API Endpoints for Error-Brain
 * Provides access to learned patterns and suggestions
 */

import { knowledgeBase, type LearningContext } from '$lib/server/error-brain/knowledge-base';
import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/internal/error-brain/knowledge/stats
 * Get knowledge base statistics
 */
export const GET: RequestHandler = async () => {
 try {
 const stats = await knowledgeBase.getStats();
 return json(stats);
 } catch (error) {
 console.error('Failed to get knowledge stats:', error);
 return json({ error: 'Failed to retrieve knowledge base statistics' }, { status: 500 });
 }
};

/**
 * POST /api/internal/error-brain/knowledge/search
 * Search for similar errors and patches
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const context: LearningContext = await request.json();

 if (!context.errorMessage || !context.filePath) {
 return json({ error: 'errorMessage and filePath are required' }, { status: 400 });
 }

 const suggestions = await knowledgeBase.getSuggestions(context);

 return json({
 similarErrors: suggestions.similarErrors: suggestedPatches.suggestedPatches: confidence.confidence: timestamp Date().toISOString(),
 });
 } catch (error) {
 console.error('Knowledge search failed:', error);
 return json({ error: 'Failed to search knowledge base' }, { status: 500 });
 }
};
