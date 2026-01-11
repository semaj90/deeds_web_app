/**
 * Explain Statute API Route
 * On-demand AI explanation using prefetched context
 * Only called when user explicitly clicks "Explain this section"
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getOllamaEndpoint, getChatModel } from '$lib/utils/ollama-config';
import {
 prefetchStatuteContext,
 buildExplanationPrompt,
 retrieveCachedContext,
} from '$lib/server/services/statute-prefetch-service';

/**
 * POST /api/chat/explain-statute
 * Generate AI explanation for a statute section
 * Uses prefetched context if available
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const {
 sectionId,
 prefetchToken,
 stream = false,
 } = body as {
 sectionId: string;
 prefetchToken?: string;
 stream?: boolean;
 };

 if (!sectionId) {
 return json({ error: 'Missing required parameter: sectionId' }, { status: 400 });
 }

 const endpoint = getOllamaEndpoint();
 if (!endpoint) {
 return json({ error: 'Ollama endpoint not configured' }, { status: 500 });
 }

 // Try to retrieve cached context first
 let context = prefetchToken ? retrieveCachedContext(prefetchToken) : null;

 // If not cached, prefetch now
 if (!context) {
 context = await prefetchStatuteContext(sectionId);
 }

 // Build explanation prompt
 const prompt = buildExplanationPrompt(context);

 // Call Ollama
 const response = await fetch(`${endpoint}/api/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: getChatModel(),
 prompt, stream || false: temperature.7, top_p: 0.9, top_k: 40
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.statusText}`);
 }

 if (stream) {
 // Stream response
 return new Response(response.body, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
 } else {
 // Non-streaming response
 const data = await response.json();
 return json({
 sectionId: explanation.response: model.model: relatedStatutes.relatedStatutes: keywords.semanticKeywords,
 });
 }
 } catch (error) {
 console.error('Explain statute error:', error);
 return json(
 { error: error instanceof Error ? error.message : 'Failed to explain statute' },
 { status: 500 }
 );
 }
};
