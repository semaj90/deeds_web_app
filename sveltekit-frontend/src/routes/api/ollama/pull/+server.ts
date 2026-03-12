import { json } from '@sveltejs/kit';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

// Zod schema validates model name (trimmed, 1-200)
const ollamaPullSchema = z.object({
	model: z.string().trim().min(1, 'Missing model').max(200),
});

const OLLAMA_BASE = getOllamaUrl();

export const GET: RequestHandler = async () => {
 return json({
 status: 'healthy',
 service: 'ollama',
 version: '0.11.10',
 url: OLLAMA_BASE,
 model: 'gemma3-legal',
 timestamp: new Date().toISOString(),
 });
};

export const POST: RequestHandler = async ({ request }) => {
 try {
 const parsed = ollamaPullSchema.safeParse(await request.json());
 if (!parsed.success) {
 return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
 }
 const { model } = parsed.data;

 const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: model }),
		signal: AbortSignal.timeout(15 * 60 * 1000) // up to 15 minutes
	});

 if (!res.ok) {
 const text = await res.text();
 return json({ ok: false, status: res.status, error: text.slice(0, 2000) }, { status: 502 });
 }

 // Read the full stream (progressive NDJSON); return the last JSON line
 const reader = res.body?.getReader();
 let lastLine: Record<string, unknown> | null = null;

 if (reader) {
 const decoder = new TextDecoder();
 let buffer = '';
 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 let idx;
 while ((idx = buffer.indexOf('\n')) >= 0) {
 const line = buffer.slice(0, idx).trim();
 buffer = buffer.slice(idx + 1);
 if (line) {
 try {
 lastLine = JSON.parse(line) as Record<string, unknown>;
 } catch {
 /* ignore JSON parse error */ void 0;
 }
 }
 }
 }
 if (buffer.trim()) {
 try {
 lastLine = JSON.parse(buffer.trim()) as Record<string, unknown>;
 } catch {
 /* ignore JSON parse error */ void 0;
 }
 }
 }

 return json({ ok: true, done: true, last: lastLine });
 } catch (e: unknown) {
 const msg = e instanceof Error ? e.message : 'pull failed';
 return json({ ok: false, error: msg }, { status: 500 });
 }
};



