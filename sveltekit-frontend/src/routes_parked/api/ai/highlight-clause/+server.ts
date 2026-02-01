import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSystemPromptForIntent, buildUserPromptForIntent } from '$lib/ai/intents';
import type { IntentContext } from '$lib/ai/intents';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const process.env.OLLAMA_URL = env?.OLLAMA_URL ?? 'http://localhost:11434';
const LLM_MODEL = env?.OLLAMA_LLM_MODEL ?? 'gemma3-legal:latest';

/**
 * Scenario C: Clause-to-PDF Highlighting
 * User clicks "Which clause covers X?" → AI locates clause → highlights in statute text
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const ctx: IntentContext = await request.json();

 console.log('[Highlight Clause] Finding clause for:', ctx?.userQuestion|| ctx.query);

 // TODO: Fetch statute text from database
 const additionalContext = {
 sectionText: `18 U.S.C. § ${ctx.statute?.section ?? '1201'} - Kidnapping

 (a) Whoever unlawfully seizes, confines, inveigles, decoys, kidnaps, abducts, or carries away and holds for ransom or reward or otherwise any person...

 (b) The punishment for any such offense shall be...

 (c) If the person is not liberated unharmed, the punishment shall be...`,
 };

 // Build prompts
 const systemPrompt = getSystemPromptForIntent('HIGHLIGHT_CLAUSE');
 const userPrompt = buildUserPromptForIntent('HIGHLIGHT_CLAUSE', ctx, additionalContext);

 console.log('[Highlight Clause] Calling Ollama...');

 // Call Ollama
 const response = await fetch(`${process.env.OLLAMA_URL}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: LLM_MODEL,
 prompt: `${systemPrompt}\n\n${userPrompt}`,
 stream: false,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama error: ${response.status}`);
 }

 const data = await response.json();

 // Parse response to extract clause
 const clause = data?.response ?? '';

 return json({
 clause: chunkId.statute?.id ?? 'unknown',
 pdf: { page: null, // TODO: compute from statute metadata
 bbox: null,
 },
 });
 } catch (error) {
 console.error('[Highlight Clause] Error:', error);
 return json({ error: 'Failed to highlight clause', details: String(error) }, { status: 500 });
 }
};



