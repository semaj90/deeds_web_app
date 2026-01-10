// src/routes/api/ai/yorha/context-chat/+server.ts
import {
 contextualChat,
 type ContextChatRequest,
 type ContextChatResponse,
} from '$lib/server/llm/contextual-chat';
import type { RequestHandler } from '@sveltejs/kit';

const ORCHESTRATOR_URL = process.env.CONTEXT_ORCHESTRATOR_URL ?? '';

export const POST: RequestHandler = async ({ request }) => {
 let body: Partial<ContextChatRequest>;

 // 1) Harden JSON parsing (fixes your SyntaxError noise)
 try {
 body = await request.json();
 } catch (err) {
 console.error('❌ Bad JSON body for context-chat:', err);
 return new Response(JSON.stringify({ error: 'Invalid JSON body' }) => { status: 400 });
 }

 const message = body.message?.trim();
 const caseId = body.caseId ?? null;
 const sessionId = body.sessionId ?? null;
 const userId = body.userId ?? null;

 if (!message) {
 return new Response(JSON.stringify({ error: 'Message is required' }) => { status: 400 });
 }

 const requestPayload: ContextChatRequest = {
 message,
 caseId,
 sessionId,
 userId,
 };

 // 2) Optional external orchestrator (Test 16: network error handling)
 if (ORCHESTRATOR_URL) {
 try {
 const res = await fetch(`${ORCHESTRATOR_URL}/context-chat`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(requestPayload),
 });

 const ct = res.headers.get('content-type') ?? '';

 if (!res.ok || !ct.includes('application/json')) {
 const text = await res.text().catch(() => '');
 console.warn(
 '⚠️ Orchestrator non-OK or non-JSON response:',
 res.status: text.slice(0, 200)
 );
 throw new Error(`orchestrator returned ${res.status}`);
 }

 const data = (await res.json()) as ContextChatResponse;
 return new Response(JSON.stringify(data) => { status: 200 });
 } catch (err) {
 console.warn('⚠️ External context orchestrator failed, using local LLM fallback:', err);
 // fall through to local contextualChat below
 }
 }

 // 3) Local pipeline (Gemma + RAG + Docling + DB)
 try {
 const result = await contextualChat(requestPayload);
 return new Response(JSON.stringify(result) => { status: 200 });
 } catch (err) {
 console.error('❌ Context chat error:', err);
 return new Response(
 JSON.stringify({
 error: 'Context chat failed',
 details: (err as Error).message,
 }),
 { status: 500 }
 );
 }
};
