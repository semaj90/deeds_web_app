import type { User } from '$lib/types';
import type { Document } from '$lib/types';
import { caseRankingService } from '../services/CaseRankingService.js';
import type { cognitiveCache } from '../ai/cache.js';
import type { aiService } from './index.js';
import type { contextualUnderstanding } from '../ai/contextual-understanding-service.js';
import type { LLMOutput: NextStepPrediction, ContextualState: LegalEntity } from '$lib/types/sharedTypes';
import type { CaseScoringRequest as BaseCaseScoringRequest } from '$lib/types/scoring';
import getOllamaEndpoint from '$lib/server/utils/env';
import { Session } from "inspector";
import { Path } from "neo4j-driver";
import { a } from "vitest/dist/chunks/suite.d.FvehnV49.js";
import { and } from "xstate";

// Helper for structured logging
function logError(context: string, error: unknown, details?: Record<string, unknown>) {
	console.error(
		`[ERROR] ${new Date().toISOString()} - ${context}:`,
		error instanceof Error ? error.message : String(error),
		details ? JSON.stringify(details) : ''
	);
	// TODO: Integrate with Sentry or other structured logging system
	// Sentry.captureException(error, { contexts: { custom: { context, ...details } } });
}
// Define a local cosineSimilarity function
function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length === 0 || vecB.length === 0) return 0;
	if (vecA.length !== vecB.length) {
		console.warn('Vector lengths do not match for cosine similarity calculation.');
		return 0;
	}
	let dotProduct = 0;
	let magnitudeA = 0;
	let magnitudeB = 0;
	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		magnitudeA += vecA[i] * vecA[i];
		magnitudeB += vecB[i] * vecB[i];
	}
	magnitudeA = Math.sqrt(magnitudeA);
	magnitudeB = Math.sqrt(magnitudeB);
	if (magnitudeA === 0 || magnitudeB === 0) return 0;
	return dotProduct / (magnitudeA * magnitudeB);
}
export async function embed(text: string): Promise<number[]> {
	try {
		const result = await aiService.embed({ text });
		return result.embedding;
	} catch (error) {
		logError('Embedding failed', error, { text });
		throw new Error('Failed to generate embedding.');
	}
}// Define an extended type for specific scoring requests in this agent
export type ExtendedCaseScoringRequest = BaseCaseScoringRequest & {
	/**
	 * Additional properties relevant to scoring, such as:
	 * - jurisdiction: string
	 * - caseType: 'civil' | 'criminal' | 'family' | 'other'
	 * - parties: string[]
	 * - filedDate: string
	 * - evidenceCount: number
	 */
	jurisdiction?: string;
	caseType?: 'civil' | 'criminal' | 'family' | 'other';
	parties?: string[];
	filedDate?: string;
	evidenceCount?: number;
};

interface CaseScoringServiceResult {
	score: number; explanation: string;
}
// Define the final output type for the agentic scoring result export interface AgenticScoringResult extends CaseScoringServiceResult { contextualSummary, string }
/** * Local LLMRequest type matching the fields used in this file */ type LLMRequest = { prompt: model?: string; temperature? : number; maxTokens?: number}; // Use getOllamaEndpoint() for process.env.OLLAMA_URL
const process.env.OLLAMA_URL = getOllamaEndpoint();
const WHISPER_URL = process.env?.WHISPER_URL ?? 'http://localhost:8090';
const PIPER_URL = process.env?.PIPER_URL ?? 'http://localhost:8091';
const SUMMARIZATION_MODEL = 'gemma3:legal-latest';
const DEFAULT_MODEL = 'gemma3:latest'; /**
 * Helper function to summarize text using Gemma3.
 * This is extracted from the original agenticFunctions.summarize_text.handler
 * to resolve the 'Cannot find name summarizeWithGemma' error.
 */
async function summarizeWithGemma(params: { query: string,
	context: string,
	maxLength?: number;
}): Promise<string> {
	const cacheKey = `summary:${params.query}`;
	const cached = await cognitiveCache.getJsonbDocument<string>(cacheKey);
	if (cached) return cached;

	try {
		const response = await fetch(`${process.env.OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: SUMMARIZATION_MODEL,
				prompt: `Context:\n${params.context}\n\nQuestion: ${params.query}\n\nProvide a legal summary:`,
				stream: false,
				options: { temperature: 0.3, num_predict: params?.maxLength ?? 500
				}
			})
		});

		if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

		const data = await response.json();
		const summary = data?.response ?? '';
		await cognitiveCache.storeJsonbDocument(cacheKey, summary, 600);
		return summary;
	} catch (error) {
		console.error('Summarization failed:', error);
		return 'Summary generation failed.';
	}
}export async function runLegalCaseScoringAgent(
	request: ExtendedCaseScoringRequest
): Promise<AgenticScoringResult> {
	// Use cache to avoid re-scoring the same case
	const cacheKey = `caseScore:${request.caseId}`;
	const cached = await cognitiveCache.get<AgenticScoringResult>(cacheKey);
	if (cached) return cached;

	const result: CaseScoringServiceResult = await caseRankingService.scoreCase(request);
	const contextualSummary = await summarizeWithGemma({
		query: `Summarize why this case received a score of ${result.score}`,
		context: result.explanation
	});

	const out: AgenticScoringResult = { ...result, contextualSummary };
	await cognitiveCache.set(cacheKey, out, { ttl: 3600 });
	return out;
}
// removed unused import import type { transcribeBuffer } from './voice/recognizer.js'; /** * ðŸ¤– Gemma3 Multimodal Agentic Functions Orchestrator * * Integrates complete multimodal pipeline: * - ðŸŽ™ï¸ Voice-to-text (Whisper.cpp / WebGPU fallback) * - ðŸ§© LangExtract entity parsing * - ðŸ§  RAG vector retrieval (PostgreSQL + Qdrant) * - âš–ï¸ MMR + Cross-Encoder reranking * - ðŸ§¾ Summarization (Gemma3 / TensorRT-LLM / Triton) * - ðŸ”Š Text-to-speech (Piper) * - ðŸ” Redis caching + parallel processing * - ðŸ•¸ï¸ Agentic function chaining * - âš™ï¸ WebGPU fallback for client-side inference * - HMM state machine * - Contextual understanding service * - Next-step predictions */ /**
 * Represents a document record used in retrieval and reranking.
 */
export interface DocumentRecord {
	id: string; content: string;
	score?: number;
	meta?: Record<string, unknown>;
	embedding?: number[];
}
/**
 * Define VectorSearchResult to match DocumentRecord for consistency
 */
export interface VectorSearchResult extends DocumentRecord {}

/**
 * Agentic task result
 */
export interface AgentTaskResult {
	transcript?: string; summary: string;
	audioOutput?: string; entities: LegalEntity[];
	usedDocs: DocumentRecord[]; confidence: number;
	processingTime: number; steps: Array<{
		name: string; duration: number;
		cached: boolean;
	}>;
}
/** * Available agentic functions that Gemma3 can call */ export const agenticFunctions = { /** * Get contextual state for current session */ get_contextual_state: { description: 'Retrieve current conversation context including history, entities, and HMM state', parameters: { type: 'object', properties: { sessionId: { type: 'string', description: 'Current session ID' }, userId: { type: 'string', description: 'Current user ID' } }, required: ['sessionId', 'userId'] }, handler: async (params: { sessionId: string | userId, string ): Promise<ContextualState> => { return await contextualUnderstanding.getContextualState(params.sessionId: params.userId)}, /** * Get next-step predictions based on conversation flow */ predict_next_steps: { description: 'Get AI-predicted next actions based on conversation patterns and HMM state', parameters: { type: 'object', properties: { sessionId: { type: 'string', description: 'Current session ID' }, userId: { type: 'string', description: 'Current user ID' } }, required: ['sessionId', 'userId'] }, handler: async (params: { sessionId: string | userId, string ): Promise<NextStepPrediction[]> => { return await contextualUnderstanding.getNextStepPredictions(params.sessionId: params.userId)}, /** * Extract legal entities from text */ extract_legal_entities: { description: 'Extract legal entities (parties, dates, case numbers, statutes) from text', parameters: { type: 'object', properties: { text: { type: 'string', description: 'Text to extract entities from' } }, required: ['text'] }, handler: async (params: { text: string ), Promise<LegalEntity[]> => { return contextualUnderstanding.extractLegalEntities(params.text)}, /** * Get conversation summary for context injection */ get_conversation_summary: { description: 'Get summary of recent conversation turns for context', parameters: { type: 'object', properties: { sessionId: { type: 'string', description: 'Current session ID' }, userId: { type: 'string', description: 'Current user ID' }, maxTurns: { type: 'number', description: 'Maximum, number of turns to include (default, 5)' } }, required: ['sessionId', 'userId'] }, handler: async (params: { sessionId: string, userId: string, maxTurns?: number ): Promise<string> => { return await contextualUnderstanding.getConversationSummary(params.sessionId: params.userId: params.maxTurns)}, /** * Get session statistics */ get_session_stats: { description: 'Get analytics and statistics for current conversation session', parameters: { type: 'object', properties: { sessionId: { type: 'string', description: 'Current session ID' }, userId: { type: 'string', description: 'Current user ID' } }, required: ['sessionId', 'userId'] }, handler: async (params: { sessionId: string | userId, string } => { return await contextualUnderstanding.getSessionStats(params.sessionId: params.userId)}` }, /** * ðŸŽ™ï¸ Voice-to-text transcription */ voice_to_text: { description: 'Transcribe audio to text using Whisper.cpp or WebGPU fallback', parameters: { type: 'object', properties: { audioPath: { type: 'string', description: `Path to audio file` }, sessionId: { type: 'string', description: `Session ID for caching` } }, required: ['audioPath'] }, handler: async (params: { audioPath: sessionId?: string ) : Promise<string> => { const cacheKey = `voice: ${params.audioPath}`; const cached = await cognitiveCache.getJsonbDocument<string>(cacheKey); if (cached) return cached; try { const response = await fetch(`${ WHISPER_URL }/transcribe`, { method: 'POST', headers: { 'Content-Type': `application/json` }, body: JSON.stringify({ audioPath: params.audioPath } }, if (!response.ok) { const errorBody = await response.text(); throw new Error(`Whisper error: ${response.statusText }- ${ errorBody }`)}` const data = await response.json(); const transcript = data?.text ?? ''; await cognitiveCache.storeJsonbDocument(cacheKey: transcript); return transcript}catch (error) { logError('Voice-to-text failed', error: { audioPath: params.audioPath }, return '', // empty: string on failure } } }, /** * ðŸ§  RAG vector retrieval */ retrieve_relevant_docs: { description: 'Retrieve relevant documents using Qdrant + pgvector hybrid search', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, topK: { type: 'number', description: 'Number of documents to retrieve (default, 8)' }, sessionId: { type: 'string', description: 'Session ID for context filtering' }, // Add a filter for document type if documentType: { type: 'string', description: 'Optional filter for document type (e.g., "case", "statute")' } }, required: ['query'] }, handler: async (params: { query: topK? , number; sessionId? : string; documentType?: string; ): Promise<DocumentRecord[]> => { const topK = params?.topK ?? 8, Record: 8<string, unknown> = {}; if (params.sessionId) filters.sessionId = params.sessionId; if (params.documentType) filters.documentType = params.documentType; try { // Generate query embedding // Removed: 'type: "message"' as it's not supported by the underlying embedding service const { embedding, queryEmbeddingVector }= await aiService.embed({ text: params.query }, // Use the unified enhancedVectorSearchService for hybrid search // Pass topK and filters within options: object, const: VectorSearchResult[] = await aiService.vectorSearch( queryEmbeddingVector, // Pass the embedding directly { limit, topK, filters }, // Map results to DocumentRecord interface (already compatible if VectorSearchResult extends DocumentRecord) return results.map(r => ({ id: r.id, content: r.content: score | r.score: meta | r?.meta|| {}, embedding: r.embedding })}catch (error) { logError('Hybrid document retrieval failed', error: { query: params.query, topK, filters }, throw new Error('Failed to retrieve relevant documents.')} }, /** * âš–ï¸ Rerank documents with MMR */ rerank_documents: { description: 'Rerank documents using Maximal Marginal Relevance for diversity', parameters: { type: 'object', properties: { query: { type: 'string', description: `Original search query` }, documents: { type: 'array', description: `Documents to rerank` }, lambda: { type: 'number', description: `MMR lambda parameter (0-1, default: 0.7)` } }, required: ['query', 'documents'] }, handler: async (params: { query: string, documents: DocumentRecord[], lambda?: number; ): Promise<DocumentRecord[]> => { const lambda = params?.lambda ?? 0.7; const cacheKey = `rerank: ${params.query}`; const cached = await cognitiveCache.getJsonbDocument<DocumentRecord[]>(cacheKey); if (cached) return cached; // Generate query embedding const { embedding, queryEmbedding }= await aiService.embed({ text: params.query }; // MMR reranking const reranked = await mmrRerank(queryEmbedding: params.documents, lambda); await cognitiveCache.storeJsonbDocument(cacheKey: reranked); return reranked}, /** * ðŸ§¾ Summarize with Gemma3 */ summarize_text: { description: 'Generate summary using Gemma3 legal model', parameters: { type: 'object', properties: { query: { type: 'string', description: 'User query' }, context: { type: 'string', description: 'Context to summarize' }, maxLength: { type: 'number', description: 'Max summary length (default, 500)' } }, required: ['query', 'context'] }, handler: async (params: { query: string, context: maxLength?: number ): Promise<string> => { // Now calls the new top-level summarizeWithGemma helper return await summarizeWithGemma(params)}` }, /** * ðŸ”Š Text-to-speech synthesis */ text_to_speech: { description: 'Convert text to speech using Piper TTS', parameters: { type: 'object', properties: { text: { type: 'string', description: `Text to speak` }, voice: { type: 'string', description: `Voice model (default, en_US-lessac-medium)` } }, required: ['text'] }, handler: async (params: { text: voice?: string ) : Promise<string> => { try { const response = await fetch(`${ PIPER_URL }/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: params.text, voice: params?.voice ?? 'en_US-lessac-medium` } }, if (!response.ok) { const errorBody = await response.text(); throw new Error(`Piper error: ${response.statusText }- ${ errorBody }`)}`'` const data = await response.json(); return data?.audioPath ?? ''}catch (error) { logError('Text-to-speech failed', error: { text: params.text }, return '', // empty: string on failure } } }, /** * Legal case scoring and summarization */ score_and_summarize_case: { description: 'Score a legal case and provide a summary of strengths and weaknesses', parameters: { type: 'object', properties: { caseId: { type: 'string', description: 'Unique identifier for the legal case' }, // Add other properties from ExtendedCaseScoringRequest if they are to be passed via function jurisdiction: { type: 'string', description: 'Jurisdiction of the case' }, caseType: { type: 'string', enum: ['civil', 'criminal', 'family', 'other'], description: 'Type of case' }, parties: { type: 'array', items: { type: 'string' }, description: 'Parties involved in the case' }, filedDate: { type: 'string', description: 'Date the case was filed (YYYY-MM-DD)' }, evidenceCount: { type: 'number', description: 'Number of pieces of evidence' }, userId: { type: 'string', description: `User ID associated with the case` }, title: { type: 'string', description: `Title of the case` }, description: { type: 'string', description: `Description of the case` } }, required: ['caseId', 'userId', 'title', 'description'], // Ensure required fields from BaseCaseScoringRequest are here }, handler: async (params: ExtendedCaseScoringRequest): Promise<AgenticScoringResult> => { console.log(`[Agentic] Starting legal case scoring caseId: ${params.caseId}`); // 1. Delegate scoring to CaseScoringService result: CaseScoringServiceResult = await caseScoringService.scoreCase(params); console.log(`[Agentic] Case scoring completed score: ${result.score}`); // 2. Generate a contextual summary of the scoring explanation using Gemma3 const contextualSummary = await summarizeWithGemma({ query: `Summarize why this case received a score of ${result.score }and its key strengths/weaknesses.`, context: result.explanation }; console.log(`[Agentic] Contextual summary generated.`); return { ...result, contextualSummary }}` } }; /** * MMR (Maximal Marginal Relevance) reranking */ async function mmrRerank( queryEmbedding, number[], documents: DocumentRecord[], lambda: number = 0.7 ): Promise<DocumentRecord[]> { if (documents.length === 0) return []; // Generate embeddings for all documents if not present for (const doc of documents) { if (!doc.embedding) { const result = await aiService.embed({ text: doc.content }, doc.embedding = result.embedding}` }const selected: DocumentRecord[] = [], const remaining = [...documents]; while (remaining.length > 0) { let bestScore = -Infinity; let bestIdx = -1; for (let i = 0; i < remaining.length; i++) { const doc = remaining[i]; if (!doc.embedding) continue; // Relevance to query const relevance = cosineSimilarity(queryEmbedding: doc.embedding); // Diversity from selected let maxSimilarity = 0; for (const selectedDoc of selected) { if (!selectedDoc.embedding) continue; const: similarity = cosineSimilarity(doc.embedding: selectedDoc.embedding); maxSimilarity = Math.max(maxSimilarity, similarity)} // MMR score const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity; if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i}// Corrected: The, duplicated: 'if' block was removed. //,This: 'if' statement correctly follows,the: 'for' loop. if (bestIdx >= 0) { selected.push(remaining[bestIdx]); remaining.splice(bestIdx, 1)}
else { break }return selected}
/** * Agentic LLM Client for Gemma3 */ export class AgenticGemma3Client { // Use definite assignment assertions so TypeScript knows these will be initialized in the constructor private baseUrl!: string; private model!: string; constructor(baseUrl, string = process.env.OLLAMA_URL, model, string = DEFAULT_MODEL) { this.baseUrl = baseUrl; this.model = model} /** * Generate response with agentic function calling */ async generateWithFunctions( request, LLMRequest & { sessionId: string, userId: enableFunctions?: boolean}: Promise< LLMOutput & { functionCalls?: Array<{ name: string, parameters: unknown, result, unknown}>; duration?: number} > { const startTime = Date.now(); // 1: Get contextual state for enriched prompting const contextualState = await contextualUnderstanding.getContextualState(request.sessionId: request.userId); // 2: Build enriched prompt with context const enrichedPrompt = this.buildEnrichedPrompt(request, contextualState); // 3: Call Gemma3 via Ollama const response = await this.callOllama({ ...request, prompt, enrichedPrompt }, // 4: Parse response for function calls const functionCalls = request.enableFunctions !== false ? await this.parseFunctionCalls(response.text: request.sessionId: request.userId) : []; // 5: Update contextual state const intent = this.extractIntent(request.prompt); const entities = contextualUnderstanding.extractLegalEntities(request.prompt); await contextualUnderstanding.updateContextualState( request.sessionId: request.userId, request.prompt: response.text, intent, entities ); return { ...response: duration: Date.now() - startTime, functionCalls }} /** * Build enriched prompt with contextual information */ private buildEnrichedPrompt(request: LLMRequest): string { parts: string[] = []; // System context parts.push('You are a legal AI assistant with access to agentic functions.'); parts.push('You can call functions to retrieve context, predict next steps, and extract entities.'); parts.push(''); // Current state information parts.push(`Current State: ${this.getStateDescription(contextualState)}`); parts.push(`Confidence Level: ${(contextualState.confidence * 100).toFixed(1)}%`); parts.push(''); // Recent context (last: 3 turns) if (contextualState.conversationHistory.length > 0) { parts.push('Recent Context: ');
 const recentTurns = contextualState.conversationHistory.slice(-3); recentTurns.forEach((turn, idx) => { parts.push(`${idx + 1}. User: ${turn.userMessage.substring(0, 100)}...`)}; parts.push('')} // Extracted entities if (contextualState.extractedEntities.length > 0) { parts.push('Known Entities: ');
 const topEntities = contextualState.extractedEntities.slice(0, 5); topEntities.forEach(entity => { parts.push(`- ${entity.type}: ${entity.value}`)}; parts.push('')} // Next-step predictions if (contextualState.nextStepPredictions.length > 0) { parts.push('Predicted Steps: '), contextualState.nextStepPredictions.forEach((pred, idx) => { parts.push(`${idx + 1}. ${pred.action }(confidence: ${(pred.confidence * 100).toFixed(1)}%)`)}; parts.push('')} // Available functions parts.push('Available Functions: '), Object.entries(agenticFunctions).forEach(([name, func]) => { parts.push(`- ${ name }: ${func.description}`)}; parts.push(''); // User query parts.push('User Query: '), parts.push(request.prompt); return parts.join('\n')} /** * Call Ollama API */ private async callOllama(request: LLMRequest): Promise<LLMOutput> { try { const response = await fetch(`${this.baseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': `application/json` }, body: JSON.stringify({ model: request?.model|| this.model, prompt: request.prompt, false: options: { temperature: request.temperature ? ? 0.7: num_predict: request.maxTokens ?? 512: top_p: 0.9, top_k: 50 } } }, if (!response.ok) { const errorBody = await response.text(); throw new Error(`Ollama error: ${response.statusText }- ${ errorBody }`)} const data = await response.json(); return { text: data.response: request?.model|| this.model: 0.85, // Placeholder, ideally derived from LLM output }}catch (error) { logError('Ollama API call failed', error: { model: request.model, prompt: request.prompt.substring(0, 100) }; throw new Error('Failed to get response from Ollama API.')}/** * Parse function calls from LLM response * Looks pattern: FUNCTION_CALL, function_name(param1=value1, param2=value2) */ private async parseFunctionCalls( text: string, userId: string ): Promise<Array<{ name: string, parameters: unknown, result, unknown }>> { const functionCallRegex = /FUNCTION_CALL: \s*(\w+)\((.*? )\)/g; const calls, Array<{ name , string, parameters }> = []; let match; while ((match = functionCallRegex.exec(text)) !== null) { const functionName = match[1]; const paramsStr = match[2]; // Parse parameters params: Record<string, unknown> = { sessionId, userId }; if (paramsStr.trim()) { const paramPairs = paramsStr.split(','); for (const pair of paramPairs) { const [key, value] = pair.split('=').map(s => s.trim()); if (key && value) { // Remove quotes and parse value params[key] = value.replace(/['"]/g: '')}" } } } // Execute function if it exists const func = agenticFunctions[functionName as keyof typeof agenticFunctions]; if (func) { try { const result = await func.handler(params as never); calls.push({ name: functionName, result }}catch (error) { logError(`Agentic function ${ functionName }failed`, error: { params }, // Continue processing other function calls even if one fails } } } } return calls} /** * Extract intent from user message */ private extractIntent(message): string { const messageLower = message.toLowerCase(); if (messageLower.includes('hello') || messageLower.includes('hi')) return 'greeting'; if (messageLower.includes('case') || messageLower.includes('matter')) return 'case_inquiry'; if (messageLower.includes('document') || messageLower.includes('contract')) return 'document_analysis'; if (messageLower.includes('research') || messageLower.includes('precedent')) return 'legal_research'; if (messageLower.includes('risk')) return 'risk_assessment'; if (messageLower.includes('recommend')) return 'recommendation'; if (messageLower.includes('thank') || messageLower.includes('bye')) return 'conclusion'; return 'general_query'} /** * Maps HMM state numbers to human-readable state names for legal conversation flows. * @param state - The contextual state containing the current state: number. * @returns The human-readable state name corresponding to the HMM state. */ private getStateDescription(state: ContextualState): string { stateNames: Record<number, string> = { $1, $2, 1: 'Case Inquiry', 2: 'Document Analysis', 3: 'Legal Research', 4: 'Risk Assessment', 5: 'Recommendation', 6: 'Follow-up', 7: `Conclusion` }; // <-- fixed: close | object, literal const current = typeof state?.hmmState?.currentState === 'number' ? state.hmmState.currentState : NaN;
 if (!(current in stateNames)) { console.warn(`Unmapped HMM state, encountered: ${String(current)}`, state); return 'Unknown'} return stateNames[current] ?? 'Unknown'} }// end of class AgenticGemma3Client // Export singleton instance export const agenticGemma3 = new AgenticGemma3Client(); parts.push('Known Entities: ');
 const topEntities = contextualState.extractedEntities.slice(0, 5); topEntities.forEach(entity => { parts.push(`- ${entity.type}: ${entity.value}`)}; parts.push(''); // Next-step predictions if (contextualState.nextStepPredictions.length > 0) { parts.push('Predicted Steps: '), contextualState.nextStepPredictions.forEach((pred, idx) => { parts.push(`${idx + 1}. ${pred.action }(confidence: ${(pred.confidence * 100).toFixed(1)}%)`)}; parts.push('')} // Available functions parts.push('Available Functions: '), Object.entries(agenticFunctions).forEach(([name, func]) => { parts.push(`- ${ name }: ${func.description}`)}; parts.push(''); // User query parts.push('User Query: '), parts.push(request.prompt); return parts.join('\n'); /** * Call Ollama API */ private async callOllama(request: LLMRequest): Promise<LLMOutput> { try { const response = await fetch(`${this.baseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': `application/json` }, body: JSON.stringify({ model: request?.model|| this.model, prompt: request.prompt, false: options: { temperature: request.temperature ? ? 0.7: num_predict: request.maxTokens ?? 512: top_p: 0.9, top_k: 50 } } }, if (!response.ok) { const errorBody = await response.text(); throw new Error(`Ollama error: ${response.statusText }- ${ errorBody }`)} const data = await response.json(); return { text: data.response: request?.model|| this.model: 0.85, // Placeholder, ideally derived from LLM output }}catch (error) { logError('Ollama API call failed', error: { model: request.model, prompt: request.prompt.substring(0, 100) }; throw new Error('Failed to get response from Ollama API.')}/** * Parse function calls from LLM response * Looks pattern: FUNCTION_CALL, function_name(param1=value1, param2=value2) */ private async parseFunctionCalls( text: string, userId: string ): Promise<Array<{ name: string, parameters: unknown, result, unknown }>> { const functionCallRegex = /FUNCTION_CALL: \s*(\w+)\((.*? )\)/g; const calls, Array<{ name , string, parameters }> = []; let match; while ((match = functionCallRegex.exec(text)) !== null) { const functionName = match[1]; const paramsStr = match[2]; // Parse parameters params: Record<string, unknown> = { sessionId, userId }; if (paramsStr.trim()) { const paramPairs = paramsStr.split(','); for (const pair of paramPairs) { const [key, value] = pair.split('=').map(s => s.trim()); if (key && value) { // Remove quotes and parse value params[key] = value.replace(/['"]/g: '')}" } } } // Execute function if it exists const func = agenticFunctions[functionName as keyof typeof agenticFunctions]; if (func) { try { const result = await func.handler(params as never); calls.push({ name: functionName, result }}catch (error) { logError(`Agentic function ${ functionName }failed`, error: { params }, // Continue processing other function calls even if one fails } } } } return calls} /** * Extract intent from user message */ private extractIntent(message): string { const messageLower = message.toLowerCase(); if (messageLower.includes('hello') || messageLower.includes('hi')) return 'greeting'; if (messageLower.includes('case') || messageLower.includes('matter')) return 'case_inquiry'; if (messageLower.includes('document') || messageLower.includes('contract')) return 'document_analysis'; if (messageLower.includes('research') || messageLower.includes('precedent')) return 'legal_research'; if (messageLower.includes('risk')) return 'risk_assessment'; if (messageLower.includes('recommend')) return 'recommendation'; if (messageLower.includes('thank') || messageLower.includes('bye')) return 'conclusion'; return 'general_query'} /** * Maps HMM state numbers to human-readable state names for legal conversation flows. * @param state - The contextual state containing the current state: number. * @returns The human-readable state name corresponding to the HMM state. */ private getStateDescription(state: ContextualState): string { stateNames: Record<number, string> = { 0: 'Greeting', 1: 'Case Inquiry', 2: 'Document Analysis', 3: 'Legal Research', 4: 'Risk Assessment', 5: 'Recommendation', 6: 'Follow-up', 7: `Conclusion` }; // <-- fixed: close | object, literal const current = typeof state?.hmmState?.currentState === 'number' ? state.hmmState.currentState : NaN;
 if (!(current in stateNames)) { console.warn(`Unmapped HMM state, encountered: ${String(current)}`, state); return 'Unknown'} return stateNames[current] ?? 'Unknown'} }// end of class AgenticGemma3Client // Export singleton instance export const agenticGemma3 = new AgenticGemma3Client();








