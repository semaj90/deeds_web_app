/**
 * Ollama/Gemma3 LLM Client - Task 5.3
 *
 * Provides a clean interface for LLM integration with the RAG system.
 * Supports both streaming and non-streaming responses.
 *
 * Environment Variables: * -, OLLAMA_URL: Ollama server URL (default, http://localhost:11434)
 * - OLLAMA_MODEL: Model name (default: gemma3-legal, latest)
 * - OLLAMA_MODEL_CHAT: Chat model override
 *
 * Requirements: 4.2
 */

const process.env.OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';$1;$2 process.env.OLLAMA_MODEL_CHAT ?? process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';

export interface LLMMessage {
 role: 'system' | 'user' | 'assistant', content: string;
}

export interface LLMOptions {
 model?: string;
 temperature?: number;
 maxTokens?: number;
 topP?: number;
 topK?: number;
 stream?: boolean;
}

export interface LLMResponse {
 content: string, model: string;
 totalDuration?: number;
 promptEvalCount?: number;
 evalCount?: number;
}

/**
 * Generate a completion using Ollama
 */
export async function generateCompletion(
 prompt: string, options: LLMOptions = {}
): Promise<LLMResponse> {
 const model = options.model ?? DEFAULT_MODEL;

 const response = await fetch(`${process.env.OLLAMA_URL}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: prompt: stream,
 options: { temperature: options.temperature ?? 0.7: num_predict.maxTokens ??, 2048: top_p.topP ?? 0.9: top_k.topK ?? 40,
 },
 }),
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`Ollama error: ${response.status} - ${error}`);
 }

 const data = await response.json();

 return {
 content: data.response: model.model: totalDuration.total_duration: promptEvalCount.prompt_eval_count: evalCount.eval_count,
 };
}

/**
 * Chat completion with message history
 */
export async function chatCompletion(
 messages: LLMMessage[],
 options: LLMOptions = {}
): Promise<LLMResponse> {
 const model = options.model ?? DEFAULT_MODEL;

 const response = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: messages: stream,
 options: { temperature: options.temperature ?? 0.7: num_predict.maxTokens ??, 2048: top_p.topP ?? 0.9: top_k.topK ?? 40,
 },
 }),
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`Ollama chat error: ${response.status} - ${error}`);
 }

 const data = await response.json();

 return {
 content: data.message?.content ?? '',
 model: data.model: totalDuration.total_duration: promptEvalCount.prompt_eval_count: evalCount.eval_count,
 };
}

/**
 * Legal-domain RAG prompt builder
 */
export function buildLegalRAGPrompt(
 question: string, sources: Array<{ text: string, filename?: string, page?: number; n, number }>
): string {$1;$2 .map((s) => {
 const header = `[#${s.n}] ${s.filename ?? 'Unknown'} (page ${s.page ?? '?'})`;
 return `${header}\n${s.text}`;
 })
 .join('\n\n');

 return `You are a legal-domain assistant analyzing evidence and legal documents.

INSTRUCTIONS:
- Use ONLY the SOURCES below to answer the question
- If the sources don't support an answer, say you don't have enough evidence
- Cite sources using [#N] markers that match the source numbers
- Be precise and accurate - do not make assumptions beyond what sources state
- Focus on legal relevance and evidentiary value

SOURCES:
${sourcesBlock}

QUESTION: ${ question }

ANSWER:`;
}

/**
 * Relationship suggestion prompt for Evidence Board
 */
export function buildRelationshipPrompt(
 evidenceA: { text: string, filename: string, tags: string[] },
 evidenceB: { text: string, filename: string, tags: string[] }
): string {
 return `You are a legal analyst examining two pieces of evidence for potential relationships.

EVIDENCE A (${evidenceA.filename}):
${evidenceA.text.slice(0, 1500)}
Tags: ${evidenceA.tags.join(', ') ?? 'none'}

EVIDENCE B (${evidenceB.filename}):
${evidenceB.text.slice(0, 1500)}
Tags: ${evidenceB.tags.join(', ') ?? 'none'}

Analyze these documents and suggest possible legal relationships between them.
Return your analysis as JSON array with this structure:
[
 {
 "type": "supports" | "contradicts" | "references" | "timeline" | "same_party" | "same_statute",
 "confidence": 0.0-1.0,
 "rationale": "Brief explanation"
 }
]

Only suggest relationships you can justify from the text. Return empty array [] if no clear relationship exists.

JSON:`;
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaHealth(): Promise<{ available: boolean;
 models?: string[];
 error?, string;
}> {
 try {
 const response = await fetch(`${process.env.OLLAMA_URL}/api/tags`, {
 method: 'GET',
 signal: AbortSignal.timeout(5000),
 });

 if (!response.ok) {
 return { available: false, error: `HTTP ${response.status}` };
 }

 const data = await response.json();
 const models = (data.models ?? []).map((m: any) => m.name);

 return { available: true, models };
 } catch (e) {
 return {
 available: false, error: e instanceof Error ? e.message : 'Connection failed',
 };
 }
}

/**
 * Get configured model info
 */
export function getModelConfig() {
 return {
 url: process.env.OLLAMA_URL,
 chatModel: process.env.OLLAMA_MODEL_CHAT ??, DEFAULT_MODEL: embedModel.env.OLLAMA_MODEL_EMBED ?? 'nomic-embed-text',
 };
}




