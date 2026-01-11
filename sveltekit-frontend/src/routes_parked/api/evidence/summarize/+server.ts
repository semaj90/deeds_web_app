import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { getOllamaBaseUrl } from '$lib/utils/ollama';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { text } = await request.json();
 if (!text || typeof text !== 'string') {
 return json({ success: false, error: 'Missing text payload' }, { status: 400 });
 }

 const endpoint = getOllamaBaseUrl();
 const payload = {
 model: 'gemma3-legal:latest',
 stream: false,
 max_tokens: 400,
 messages: [
 {
 role: 'system',
 content:
 'You are Phoenix-Pro, an expert legal prosecutor. Summarize evidence, highlight contradictions, flag risks, and propose investigative next steps.',
 },
 { role: 'user', content: text },
 ],
 };

 const response = await fetch(`${endpoint}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });

 if (!response.ok) {
 const errorText = await response.text().catch(() => '');
 throw new Error(`Ollama chat failed: ${response.status} ${errorText}`);
 }

 const data = await response.json();
 const summary = data?.message?.content ?? 'No summary generated.';

 return json({ success: true, summary });
 } catch (error) {
 console.error('Phoenix summary failed:', error);
 return json(
 {
 success: false,
 summary: null,
 error: 'Summary unavailable',
 },
 { status: 200 }
 );
 }
};


