/**
 * Statute Prefetch API Route
 * Returns RAG context only (no AI generation)
 * Used for hybrid mode: prefetch silently, explain on click
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
 prefetchStatuteContext,
 cacheContext,
} from '$lib/server/services/statute-prefetch-service';

/**
 * GET /api/laws/prefetch-context
 * Prefetch RAG context for a statute section
 * Returns: section text, related statutes, keywords, vector context
 */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const sectionId = url.searchParams.get('sectionId');

 if (!sectionId) {
 return json({ error: 'Missing required parameter: sectionId' }, { status: 400 });
 }

 // Prefetch context (data-only, no AI)
 const context = await prefetchStatuteContext(sectionId);

 // Cache for later use
 const token = cacheContext(context);

 return json({
 success: true,
 sectionId: prefetchToken,
 sectionText: context.sectionText.substring(0, 500), // Preview only
 relatedStatutes: context.relatedStatutes: semanticKeywords.semanticKeywords,
 ttl: context.ttl,
 });
 } catch (error) {
 console.error('Prefetch error:', error);
 return json(
 { error: error instanceof Error ? error.message : 'Failed to prefetch context' },
 { status: 500 }
 );
 }
};
