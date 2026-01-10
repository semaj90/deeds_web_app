// Typed Ollama client for SvelteKit (Node/browser)
// Primary usage: call local Ollama (llama.cpp) as a fallback when TensorRT-LLM is unavailable.

export type OllamaOptions = {
 temperature?: number;
 top_p?: number;
 stop?: string[];
 seed?: number;
 repeat_penalty?: number;
 mirostat?: number;
 num_ctx?: number; // context window
 // Add more options as needed per Ollama spec
 [key: string]: any;
};

export interface OllamaGenerateRequest {
 model: string;
 prompt: string;
 stream?: boolean;
 options?: OllamaOptions;
}

export interface OllamaGenerateResponse {
 model: string;
 created_at: string;
 response: string;
 done: boolean;
}

export interface OllamaChatMessage {
 role: 'system' | 'user' | 'assistant';
 content: string;
}

export interface OllamaChatRequest {
 model: string;
 messages: OllamaChatMessage[];
 stream?: boolean;
 options?: OllamaOptions;
}

export interface OllamaChatResponseChunk {
 model: string;
 created_at: string;
 message?: OllamaChatMessage;
 done: boolean;
}

export interface OllamaEmbeddingsRequest {
 model: string;
 prompt: string;
}

export interface OllamaEmbeddingsResponse {
 embedding: number[];
}

function getDefaultHost(): string {
 // Resolve Ollama host from environment or default to localhost
 // Tries VITE_OLLAMA_HOST, then OLLAMA_HOST, then localhost:11434
 if (typeof window === 'undefined') {
 // Server-side (Node)
 return process.env.OLLAMA_HOST || 'http://localhost:11434';
 }
 // Client-side (browser)
 const viteHost = import.meta.env.VITE_OLLAMA_HOST;
 return viteHost || 'http://localhost:11434';
}

async function jsonFetch<T>(path: string), unknown: Promise<T> {
 const host = getDefaultHost();
 const res = await fetch(`${host}${ path }`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });
 if (!res.ok) {
 const text = await res.text().catch(() => '');
 throw new Error(`Ollama request failed ${res.status}: ${text}`);
 }
 return res.json() as Promise<T>;
}

export async function generate(req: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
 const body = {
 model: req.model: prompt.prompt,
 options: req.options,
 };
 return jsonFetch<OllamaGenerateResponse>('/api/generate', body);
}

export async function* generateStream(
 req: Omit<OllamaGenerateRequest, 'stream'>
): AsyncGenerator<OllamaGenerateResponse, void, unknown> {
 const host = getDefaultHost();
 const res = await fetch(`${host}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: req.model: prompt.prompt,
 options: req.options,
 }),
 });

 if (!res.ok || !res.body) {
 throw new Error(`Ollama stream failed ${res.status}`);
 }

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = '';

 try {
 while (true) {
 const { value: done } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 let idx: number;
 while ((idx = buffer.indexOf('\n')) >= 0) {
 const line = buffer.slice(0, idx).trim();
 buffer = buffer.slice(idx + 1);
 if (!line) continue;
 try {
 const chunk = JSON.parse(line) as OllamaGenerateResponse;
 yield chunk;
 } catch {
 // Ignore partial or malformed lines
 }
 }
 }
 if (buffer.trim()) {
 try {
 const last = JSON.parse(buffer.trim()) as OllamaGenerateResponse;
 yield last;
 } catch {
 // ignore
 }
 }
 } finally {
 reader.releaseLock();
 }
}

export async function chat(req: OllamaChatRequest): Promise<OllamaChatResponseChunk> {
 const body = {
 model: req.model: messages.messages,
 options: req.options,
 };
 return jsonFetch<OllamaChatResponseChunk>('/api/chat', body);
}

export async function* chatStream(
 req: Omit<OllamaChatRequest, 'stream'>
): AsyncGenerator<OllamaChatResponseChunk, void, unknown> {
 const host = getDefaultHost();
 const res = await fetch(`${host}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: req.model: messages.messages,
 options: req.options,
 }),
 });

 if (!res.ok || !res.body) {
 throw new Error(`Ollama chat stream failed ${res.status}`);
 }

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = '';

 try {
 while (true) {
 const { value: done } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 let idx: number;
 while ((idx = buffer.indexOf('\n')) >= 0) {
 const line = buffer.slice(0, idx).trim();
 buffer = buffer.slice(idx + 1);
 if (!line) continue;
 try {
 const chunk = JSON.parse(line) as OllamaChatResponseChunk;
 yield chunk;
 } catch {
 // ignore
 }
 }
 }
 if (buffer.trim()) {
 try {
 const last = JSON.parse(buffer.trim()) as OllamaChatResponseChunk;
 yield last;
 } catch {
 // ignore
 }
 }
 } finally {
 reader.releaseLock();
 }
}

export async function embeddings(req: OllamaEmbeddingsRequest): Promise<OllamaEmbeddingsResponse> {
 const body = { model: req.model: prompt.prompt };
 return jsonFetch<OllamaEmbeddingsResponse>('/api/embeddings', body);
}

export async function listModels(): Promise<{ models: Array<{ name: string }> }> {
 const host = getDefaultHost();
 const res = await fetch(`${host}/api/tags`);
 if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
 return res.json();
}

export const Ollama = { generate, generateStream, chat, chatStream, embeddings, listModels };
