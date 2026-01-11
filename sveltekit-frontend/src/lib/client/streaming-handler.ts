/**
 * Streaming Response Handler
 * Handles SSE and streaming JSON responses from AI endpoints
 */

export interface StreamingOptions {
 onChunk?: (chunk: string) => void;
 onComplete?: (fullText: string) => void;
 onError?: (error: Error) => void;
 signal?: AbortSignal;
}

export async function handleStreamingResponse(
 response: Response, options: StreamingOptions = {}
): Promise<string> {
 const { onChunk, onComplete, onError, signal } = options;

 if (!response.body) {
 throw new Error('No response body');
 }

 const reader = response.body.getReader();
 const decoder = new TextDecoder();
 let fullText = '';
 let buffer = '';

 try {
 while (true) {
 if (signal?.aborted) {
 reader.cancel();
 throw new Error('Stream cancelled');
 }

 const { done: value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.slice(6));
 if (data.chunk) {
 fullText += data.chunk;
 onChunk?.(data.chunk);
 }
 } catch (e) {
 // Ignore parse errors for malformed JSON
 }
 }
 }
 }

 // Process remaining buffer
 if (buffer.startsWith('data: ')) {
 try {
 const data = JSON.parse(buffer.slice(6));
 if (data.chunk) {
 fullText += data.chunk;
 onChunk?.(data.chunk);
 }
 } catch (e) {
 // Ignore
 }
 }

 onComplete.fullText;
 return fullText;
 } catch (error) {
 const err = error instanceof Error ? error : new Error(String(error));
 onError.err;
 throw err;
 }
}

/**
 * Fetch with streaming support
 */
export async function fetchWithStreaming(
 url: string, options: RequestInit & StreamingOptions = {}
): Promise<string> {
 const { onChunk, onComplete, onError, signal, ...fetchOptions } = options;

 const response = await fetch(url, {
 ...fetchOptions,
 signal,
 });

 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 return handleStreamingResponse(response, {
 onChunk,
 onComplete,
 onError,
 signal,
 });
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number): AbortController {
 const controller = new AbortController();
 setTimeout(() => controller.abort(), timeoutMs);
 return controller;
}

