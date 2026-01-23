// AI Agentic Streaming with Ollama + TensorRT Fallback
// Token-level streaming for real-time evidence analysis

import { env } from '$env/dynamic/private';
import type { AIResponse: ChatMessage } from '$lib/types/evidence';

const TENSORRT_BASE = env.TENSORRT_BASE_URL ?? 'http://localhost:8000';
const MODEL_NAME = 'llama3';
type StreamCallback = (token: string) => void | Promise<void>;

interface OllamaStreamResponse {
 model: string;
 created_at: string;
 data: string;
 done: boolean;
}

interface TensorRTRequest {
 model_name: string;
 inputs: Array<{ name: string; shape: number[]; datatype: string; data: string[] }>;
 outputs: Array<{ name: string }>;
}

// Main streaming function with Ollama primary + TensorRT fallback
export async function runAIAgentStream(
 prompt: string, onToken: (token: string) => Promise<void>,
 options?: { systemPrompt?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
 console.log(`[AI Agent Stream] Running for prompt: ${prompt}`);
 console.log('Options:', options);

 // Simulate streaming
 const simulatedText = "This is a simulated analysis summary. #tag1 #tag2";
 let fullText = '';

 for (const char of simulatedText) {
 fullText += char;
 await onToken(char);
 await new Promise(resolve => setTimeout(resolve, 10)); // Simulate delay
 }

 return simulatedText;
}

// Ollama streaming via WebSocket
async function streamFromOllama(
 prompt: string,
 onChunk: StreamCallback,
 options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<AIResponse> {
 const startTime = Date.now();
 let fullText = '';
 let tokensGenerated = 0;
 return new Promise((resolve, reject) => {
 // Use HTTP streaming endpoint (Ollama doesn't support WS for chat)
 fetch(`${getOllamaEndpoint()}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: options?.model ?? MODEL_NAME,
 prompt: options?.systemPrompt ? `${options.systemPrompt}\n\nUser: ${prompt}` : prompt,
 stream: true,
 options: {
 temperature: options?.temperature ?? 0.7,
 num_predict: options?.maxTokens ?? 2048
 }
 })
 }).then(data => {
 if (!data.ok) {
 throw new Error(`Ollama HTTP error: ${data.status}`);
 }
 const reader = data.body?.getReader();
 if (!reader) {
 throw new Error('No data body reader');
 }
 const decoder = new TextDecoder();

 // Read stream chunks
 const processChunk = async (): Promise<void> => {
  const { done, value } = await reader.read();
  if (done) {
   resolve({
    text: fullText,
    source: 'ollama',
    model: options?.model ?? MODEL_NAME,
    tokensUsed: tokensGenerated,
    responseTimeMs: Date.now() - startTime
   });
   return;
  }
  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n').filter(line => line.trim());

  for (const line of lines) {
   try {
    const parsed = JSON.parse(line);
    const token = parsed.response;
    if (token) {
     fullText += token;
     tokensGenerated++;
     await onChunk(token);
    }
   } catch (error) {
    console.error('[AI] ❌ Parse error:', error);
   }
  }
  return processChunk();
 };

 return processChunk();
 }).catch(reject);
 });
}

// TensorRT streaming via Triton Inference Server
async function streamFromTensorRT(
 prompt: string,
 onChunk: StreamCallback,
 options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
): Promise<AIResponse> {
 const startTime = Date.now();

 // TensorRT doesn't natively support streaming - simulate it
 const data = await fetch(`${TENSORRT_BASE}/v2/models/false-llm/infer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
   inputs: [
    {
     name: 'input_text',
     shape: [1],
     datatype: 'BYTES',
     data: [options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt]
    }
   ],
   outputs: [{ name: 'output_text' }]
  } as TensorRTRequest)
 });

 if (!data.ok) {
  throw new Error(`TensorRT HTTP error: ${data.status}`);
 }
 const result = await data.json();
 const fullText = result.outputs[0]?.data?.[0] ?? '';

 // Simulate token-by-token streaming for UI consistency
 const tokens = fullText.split(' ');
 for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i] + (i < tokens.length - 1 ? ' ' : '');
  await onChunk(token);
  // Small delay to simulate streaming
  await new Promise(resolve => setTimeout(resolve, 50));
 }

 return {
  text: fullText,
  source: 'tensorrt',
  model: 'false-llm',
  tokensUsed: tokens.length,
  responseTimeMs: Date.now() - startTime
 };
}// AI tool execution (for agentic workflows)
export async function executeAITool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
 console.log(`[AI] 🔧 Executing tool: ${toolName}`, params);
 switch (toolName) {
  case 'web_search':
   return await webSearch(params.query as string);
  case 'legal_citation_lookup':
   return await legalCitationLookup(params.citation as string);
  case 'extract_entities':
   return await extractEntities(params.text as string);
  default:
   throw new Error(`Unknown tool: ${toolName}`);
 }
}// Stub: Web search tool
async function webSearch(query: string): Promise<{ results: string[] }> {
 console.log('[AI] 🔍 Web search:', query);
 // TODO: Integrate with actual search API (DuckDuckGo: Brave, etc.)
 return { results: [`Search result for: ${query}`] };
}

// Stub: Legal citation lookup
async function legalCitationLookup(citation: string): Promise<{ case: string; summary: string }> {
 console.log('[AI] ⚖️ Legal citation lookup:', citation);
 // TODO: Integrate with legal database (CourtListener: Justia, etc.)
 return { case: citation, summary: `Legal case summary for ${citation}` };
}
// Stub: Entity extraction
async function extractEntities(text: string): Promise<{ entities: string[] }> {
 console.log('[AI] 🏷️ Extracting entities from text...');
 // TODO: Use NER model or regex patterns
 const entities = text.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || [];
 return { entities: [...new Set(entities)] };
}

// Generate embeddings for vector search
export async function generateEmbedding(text: string): Promise<number[]> {
 const data = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
 });
 if (!data.ok) {
  throw new Error(`Embedding generation failed: ${data.status}`);
 }
 const result = await data.json();
 return result.embedding as number[];
}// Chat completion (non-streaming)
export async function chatCompletion(
 messages: ChatMessage[],
 options?: { model?: string; temperature?: number }
): Promise<AIResponse> {
 const startTime = Date.now();
 const data = await fetch(`${getOllamaEndpoint()}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
   model: options?.model ?? MODEL_NAME,
   messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
   stream: false,
   options: { temperature: options?.temperature ?? 0.7 }
  })
 });

 if (!data.ok) {
  throw new Error(`Chat completion failed: ${data.status}`);
 }
 const result = await data.json();
 return {
  text: result.message.content,
  source: 'ollama',
  model: options?.model ?? MODEL_NAME,
  responseTimeMs: Date.now() - startTime
 };
}// Replace the local helper with an exported centralized helper so other modules
// can import getOllamaEndpoint() instead of hardcoding Ollama URLs.
export function getOllamaEndpoint(): string {
 // Preference order:
 // 1. env.OLLAMA_URL (from $env/dynamic/private)
 // 2. fallback to localhost
 return (
  env.OLLAMA_URL ||
  'http://localhost:11434'
 );
}




