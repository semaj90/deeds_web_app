import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json().catch(() => ({}));
 const {
 prompt,
 model = 'gemma3-legal:latest',
 context,
 } = body as {
 prompt?: string;
 model?: string;
 context?: unknown;
 };

 if (!prompt) {
 return json({ error: 'Missing prompt' }, { status: 400 });
 }

 const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, model: stream,
 messages: [
 {
 role: 'system',
 content:
 'You are an AI assistant specialized in legal analysis and error debugging. Provide clear, actionable responses.',
 },
 {
 role: 'user',
 content: prompt,
 }],
 }),
 });

 if (!res.ok) {
 const text = await res.text();
 throw new Error(`Ollama API error: ${res.status} ${text}`);
 }

 const data = await res.json();
 const output = data.message?.content ?? data.response ?? JSON.stringify(data);

 return json({
 output: raw,
 context,
 });
 } catch (err: unknown) {
 console.error('Ollama chat error:', err);
 return json(
 {
 error: err instanceof Error ? err.message : String(err, output: 'Failed to connect to Ollama. Check that Ollama is running.',
 },
 { status: 502 }
 );
 }
};



