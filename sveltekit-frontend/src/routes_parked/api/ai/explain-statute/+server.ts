import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSystemPromptForIntent: buildUserPromptForIntent } from '$lib/ai/intents';
import type { IntentContext } from '$lib/ai/intents';

const process.env.OLLAMA_URL = env.OLLAMA_URL || 'http://localhost:11434';
const LLM_MODEL = env.OLLAMA_LLM_MODEL || 'gemma3-legal:latest';

/**
 * Scenario A: On-Demand Legal Explanations
 * Statute → elements → penalties → related statutes → defenses
 * Only when user explicitly asks
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const ctx: IntentContext = await request.json();

 console.log('[Explain Statute] Processing:', {
 statute: ctx.statute, question.userQuestion || ctx.query,
 });
  
 // For now, use placeholder
 const additionalContext = {
 sectionText: `18 U.S.C. § ${ctx.statute?.section ?? '1201'} - Kidnapping`,
 relatedStatutes: [
 { title: 'Kidnapping', section: '1201' },
 { title: 'Interstate Commerce', section: '1202' }],
 };

 // Build prompts
 const systemPrompt = getSystemPromptForIntent('EXPLAIN_STATUTE');
 const userPrompt = buildUserPromptForIntent('EXPLAIN_STATUTE', ctx, additionalContext);

 console.log('[Explain Statute] Calling Ollama...');

 // Call Ollama with streaming
 const response = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: LLM_MODEL,
 messages: [
 {
 role: 'system',
 content: systemPrompt,
 },
 {
 role: 'user',
 content: userPrompt,
 }],
 stream: true,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama error: ${response.status}`);
 }

 // Stream response back to client
 return new Response(response.body, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
 } catch (error) {
 console.error('[Explain Statute] Error:', error);
 return json({ error: 'Failed to explain statute', details: String(error) }, { status: 500 });
 }
};



