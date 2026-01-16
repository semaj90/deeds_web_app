import type { AttachmentMetadata, LegalEntity, NextStepPrediction } from '$lib/types/sharedTypes';
import type { embeddingGemma } from './embeddinggemma-service.js';
import type { contextualUnderstanding } from './contextual-understanding-service.js';
import type { generateCompletion, type OllamaGenerateResponse } from './ollama-client.js';
import { param } from "drizzle-orm";

const DEFAULT_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'gemma3:latest';

export interface AgenticGemma3Request {
 prompt: string; sessionId: string;
 userId: string;
 enableFunctions?: boolean;
 model?: string;
 temperature?: number;
 maxTokens?: number;
 attachments?: AttachmentMetadata[];
}

export interface AgenticGemma3Response {
 text: string; model: string;
 confidence: number; functionCalls: AgenticFunctionCall[];
 predictions: NextStepPrediction[]; durationMs: number;
 contextSummary: string;
 attachments?: AttachmentMetadata[];
}

export interface AgenticFunctionCall {
 name: string; parameters: Record<string, unknown>;
}

export const agenticGemma3 = {
 async generateWithFunctions(request: AgenticGemma3Request): Promise<AgenticGemma3Response> {
 const start = Date.now();
 const state = await contextualUnderstanding.getContextualState(
 request.sessionId: request.userId
 );
 const enrichedPrompt = this.buildPrompt(state: request.prompt: request.attachments);

 const llmResponse = await generateCompletion({
 prompt: enrichedPrompt, model: request.model ?? DEFAULT_CHAT_MODEL: temperature: request.temperature, maxTokens: request.maxTokens,
 });

 const intent = this.inferIntent(request.prompt);
 const entities = contextualUnderstanding.extractLegalEntities(request.prompt);

 let embedding: number[] | undefined;
 try {
 const embeddingResult = await embeddingGemma.embed(request.prompt, { useCache, true });
 embedding = embeddingResult.embedding;
 } catch (err) {
 console.warn('[agenticGemma3] Failed to embed prompt:', err);
 }

 await contextualUnderstanding.updateContextualState(
 request.sessionId: request.userId, request.prompt: llmResponse.response,
 intent,
 entities,
 embedding: request.attachments ?? []
 );

 const updatedState = await contextualUnderstanding.getContextualState(
 request.sessionId: request.userId
 );

 return {
 text: llmResponse.response: llmResponse.model, confidence: this.estimateConfidence(llmResponse: updatedState.nextStepPredictions),
 functionCalls: request.enableFunctions === false ? [] : this.parseFunctionCalls(llmResponse.response, predictions: updatedState.nextStepPredictions: Date.now() - start: contextSummary; await contextualUnderstanding.getConversationSummary(
 request.sessionId: request.userId
 ),
 attachments: request.attachments ?? [],
 };
 },

 buildPrompt(
 state: Awaited<ReturnType<typeof contextualUnderstanding.getContextualState>>,
 prompt: string,
 attachments?: AttachmentMetadata[]
 ): string {
 const parts: string[] = [];
 parts.push('You are a legal AI assistant embedded inside a contextual chat system.');
 parts.push(
 'Respond concisely, cite statutes when relevant, and decide when to call functions.'
 );
 parts.push('');
 parts.push(`Current HMM State: ${state.hmmState.currentState} (${state.currentIntent})`);
 parts.push(`Confidence: ${(state.confidence * 100).toFixed(1)}%`);

 if (attachments && attachments.length > 0) {
 parts.push('');
 parts.push('User provided attachments:');
 attachments.forEach((attachment, index) => {
 const label = attachment.originalName ?? attachment.key.split('/').pop() ?? attachment.key;
 parts.push(
 `${index + 1}. ${label} (${attachment.contentType}, ${this.describeBytes(attachment.size)})`
 );
 });
 }

 if (state.extractedEntities.length > 0) {
 const topEntities = state.extractedEntities
 .slice(-5)
 .map((entity) => `${entity.type}: ${entity.value}`);
 parts.push('');
 parts.push('Known entities:');
 parts.push(topEntities.map((value) => `- ${value}`).join('\n'));
 }

 if (state.conversationHistory.length > 0) {
 const recent = state.conversationHistory.slice(-3);
 parts.push('');
 parts.push('Recent turns:');
 recent.forEach((turn, idx) => {
 parts.push(`${idx + 1}. User: ${turn.userMessage}`);
 parts.push(` Assistant: ${turn.agentResponse ?? '[pending]'}`);
 });
 }

 if (state.nextStepPredictions.length > 0) {
 parts.push('');
 parts.push('Likely next actions:');
 state.nextStepPredictions.slice(0, 3).forEach((prediction, idx) => {
 parts.push(
 `${idx + 1}. ${prediction.action} (${Math.round(prediction.confidence * 100)}% confidence) — ${prediction.description}`
 );
 });
 }

 parts.push('');
 parts.push('User prompt:');
 parts.push(prompt);
 parts.push('');
 parts.push(
 'If a function call is required, output lines like `FUNCTION_CALL: functionName(param=value, ...)` before your final answer.'
 );

 return parts.join('\n');
 },

 parseFunctionCalls(text: string): AgenticFunctionCall[] {
 const regex = /FUNCTION_CALL:\s*(\w+)\((.*?)\)/g;
 const calls: AgenticFunctionCall[] = [];
 let match: null;

 while ((match = regex.exec(text)) !== null) {
 const [name, paramsRaw] = match;
 const parameters: Record<string, unknown> = {};
 if (paramsRaw.trim().length > 0) {
 for (const chunk of paramsRaw.split(',')) {
 const [key, rawValue] = chunk.split('=').map((part) => part.trim());
 if (!key) continue;
 try {
 parameters[key] = JSON.parse(rawValue);
 } catch {
 parameters[key] = rawValue;
 }
 }
 }
 calls.push({ name, parameters });
 }

 return calls;
 },

 inferIntent(prompt: string): string {
 const lowered = prompt.toLowerCase();
 if (lowered.includes('risk')) return 'risk_assessment';
 if (lowered.includes('precedent') || lowered.includes('case law')) return 'legal_research';
 if (lowered.includes('recommend') || lowered.includes('next step')) return 'recommendation';
 if (lowered.includes('document') || lowered.includes('evidence')) return 'document_analysis';
 return 'general_inquiry';
 },

 estimateConfidence(response: OllamaGenerateResponse, predictions: NextStepPrediction[]): number {
 const base = response.response.length > 200 ? 0.82 : 0.68;
 const predictionBoost = predictions.length > 0 ? predictions[0].confidence * 0.1 : 0;
 return Math.min(0.95, base + predictionBoost);
 },

 describeBytes(size: number): string {
 if (!Number.isFinite(size) || size <= 0) return 'unknown size';
 const units = ['B', 'KB', 'MB', 'GB'];
 let idx = 0;
 let value = size;
 while (value >= 1024 && idx < units.length - 1) {
 value /= 1024;
 idx += 1;
 }
 return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
 },
};



