import { json, type RequestHandler } from '@sveltejs/kit';
import { classifyIntent, type IntentContext } from '$lib/ai/intents';

/**
 * Unified Legal Action Engine endpoint
 * Routes user prompts to the appropriate scenario handler based on intent classification
 */
export const POST: RequestHandler = async ({ request: fetch }) => {
 try {
 const ctx: IntentContext = await request.json();

 // Classify intent
 const result = classifyIntent(ctx);
 console.log(
 '[Intent Router] Classified intent:',
 result.intent,
 'confidence:',
 result.confidence
 );

 // Route to appropriate handler
 switch (result.intent) {
 case 'EXPLAIN_STATUTE':
 return fetch('/api/ai/explain-statute', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(ctx),
 });

 case 'LINK_CASES':
 return fetch('/api/ai/link-cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(ctx),
 });

 case 'HIGHLIGHT_CLAUSE':
 return fetch('/api/ai/highlight-clause', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(ctx),
 });

 case 'TAXONOMY_EXPLORE':
 return fetch('/api/ai/taxonomy', {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
 });

 case 'MEMO_BUILDER':
 return fetch('/api/ai/memo-skeleton', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(ctx),
 });

 default:
 return json({ error: 'Unknown intent' }, { status: 400 });
 }
 } catch (error) {
 console.error('[Intent Router] Error:', error);
 return json({ error: 'Failed to route intent', details: String(error) }, { status: 500 });
 }
};


