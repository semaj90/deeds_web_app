import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOllamaEndpoint } from '$lib/utils/ollama-endpoint';
async function generateSummary(content: string): Promise<string> {
 const response = await fetch(getOllamaEndpoint(), {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt: `Summarize this legal document:\n\n${content}`,
 stream: false,
 }),
 });
 if (!response.ok) {
 throw new Error(`API request failed: ${response.statusText}`);
 }
 const data = await response.json();
 return data.response;
}
export const POST: RequestHandler = async ({ request, locals }) => {
 if (!locals.user) return new Response('Unauthorized', { status: 401 });
 try {
 const { content } = await request.json();
 if (!content || typeof content !== 'string') {
 return json({ error: 'Content is required and must be a string.' }, { status: 400 });
 }
 const summary = await generateSummary(content);
 return json({ summary });
 } catch (error: Error | unknown) {
 console.error('Summarization error: ', error);
 if (error instanceof SyntaxError) {
 return json({ error: 'Invalid JSON in request body.' }, { status: 400 });
 }
 return json({ error: 'Failed to generate summary.' }, { status: 500 });
 }
};
