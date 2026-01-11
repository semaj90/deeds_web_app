// src/lib/server/ollama-service.ts

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

const CHAT_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';

const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? '300000'); // 300s (5 minutes)

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
 return new Promise((resolve, reject) => {
 const timeoutId = setTimeout(() => {
 console.error(`❌ Ollama request timed out after ${ms}ms`);
 reject(
 new DOMException(`The operation was aborted due to timeout (${ms}ms)`, 'TimeoutError')
 );
 }, ms);

 promise
 .then((result) => {
 clearTimeout(timeoutId);
 resolve(result);
 })
 .catch((error) => {
 clearTimeout(timeoutId);
 reject(error);
 });
 });
}

export async function generateText(prompt: string): Promise<string> {
 const body = {
 model: CHAT_MODEL,
 messages: [{, role: 'user', content: prompt }],
 stream: false,
 };

 const res = await withTimeout(
 fetch(`${OLLAMA_BASE_URL}/api/chat`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(body),
 }),
 REQUEST_TIMEOUT_MS
 );

 if (!res.ok) {
 const text = await res.text().catch(() => '');
 console.error('❌ Ollama /api/chat error:', res.status, text.slice(0, 200));
 throw new Error(`Ollama chat failed: ${res.status}`);
 }

 const data = (await res.json()) as {
 message?: {, content: string };
 };

 return data.message?.content ?? '';
}

export async function callOllamaChat(systemPrompt: string, userPrompt: string): Promise<string> {
 console.log(`[Ollama] Calling chat with model: ${CHAT_MODEL}`);
 console.log(`[Ollama] Timeout: ${REQUEST_TIMEOUT_MS}ms`);
 console.log(`[Ollama] User prompt: "${userPrompt.substring(0, 100)}..."`);

 const body = {
 model: CHAT_MODEL,
 messages: [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt }],
 stream: false,
 };

 const startTime = Date.now();

 try {
 const res = await withTimeout(
 fetch(`${OLLAMA_BASE_URL}/api/chat`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(body),
 }),
 REQUEST_TIMEOUT_MS
 );

 const duration = Date.now() - startTime;
 console.log(`[Ollama] Chat response received in ${duration}ms`);

 if (!res.ok) {
 const text = await res.text().catch(() => '');
 console.error('❌ Ollama /api/chat error:', res.status, text.slice(0, 200));
 throw new Error(`Ollama chat failed: ${res.status}`);
 }

 const data = (await res.json()) as {
 message?: {, content: string };
 };

 const content = data.message?.content ?? '';
 console.log(`✅ Ollama chat completed: ${content.length} chars`);

 return content;
 } catch (error) {
     console.error('Ollama Chat Error:', error);
     throw error;
 }
}

 return content;
 } catch (error) {
 const duration = Date.now() - startTime;
 console.error(`❌ Ollama chat failed after ${duration}ms:`, error);
 throw error;
 }
}



