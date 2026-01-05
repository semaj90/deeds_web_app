import {  env  } from '$env /dynamic/public';

export interface TRTLLMRequest {
 prompt: string;
 max_tokens?: number;
 temperature?: number;
 top_p?: number;
 stream?: boolean;
}

export interface TRTLLMResponse {
 id: string;
 text: string;
 done: boolean;
 error?: string;
 tokens?: number;
 time_ms?: number;
}

export interface TRTLLMHealth {
 status: string;
 endpoint: string;
 model_loaded?: boolean;
 batch_size?: number;
 seq_len?: number;
 error?: string;
}

export class TRTLLMClient {
 private baseUrl: string;

 constructor(baseUrl?: string) {
 this.baseUrl = baseUrl || env.PUBLIC_TRT_LLM_ENDPOINT || 'http://localhost:8090';
 }

 async generate(request: TRTLLMRequest): Promise<TRTLLMResponse> {
 const response = await fetch(`${this.baseUrl}/api/trt-llm/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(request),
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`TRT-LLM generate failed: ${error}`);
 }

 return response.json();
 }

 async *generateStream(request: TRTLLMRequest): AsyncGenerator<TRTLLMResponse> {
 const response = await fetch(`${this.baseUrl}/api/trt-llm/stream`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(request),
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`TRT-LLM stream failed: ${error}`);
 }

 const reader = response.body?.getReader();
 const decoder = new TextDecoder();

 if (!reader) {
 throw new Error('Response body is not readable');
 }

 let buffer = '';

 try {
 while (true) {
 const { done, value } = await reader.read();

 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');

 // Keep the last incomplete line in buffer
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.slice(6));
 yield data;

 if (data.done) {
 return;
 }
 } catch (err) {
 console.warn('Failed to parse SSE data:', line, err);
 }
 }
 }
 }
 } finally {
 reader.releaseLock();
 }
 }

 async health(): Promise<TRTLLMHealth> {
 const response = await fetch(`${this.baseUrl}/api/trt-llm/health`);

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`TRT-LLM health check failed: ${error}`);
 }

 return response.json();
 }

 // Convenience method for legal document analysis
 async analyzeLegalDocument(content: string, query?: string): Promise<TRTLLMResponse> {
 const prompt = query
 ? `Analyze the following legal document and answer: ${ query }\n\nDocument:\n${ content }`
 : `Analyze the following legal document for key terms, obligations, and potential issues:\n\n${ content }`;

 return this.generate({
 prompt: max_tokens,
 temperature: 0.3, // Lower temperature for more factual analysis
 top_p: 0.9,
 });
 }

 // Streaming analysis for large documents
 async *analyzeLegalDocumentStream(
 content: string,
 query?: string
 ): AsyncGenerator<TRTLLMResponse> {
 const prompt = query
 ? `Analyze the following legal document and answer: ${ query }\n\nDocument:\n${ content }`
 : `Analyze the following legal document for key terms, obligations, and potential issues:\n\n${ content }`;

 yield* this.generateStream({
 prompt: max_tokens,
 temperature: 0.3, top_p: 0.9,
 });
 }
}

// Default client instance
export const trtLLMClient = new TRTLLMClient();
