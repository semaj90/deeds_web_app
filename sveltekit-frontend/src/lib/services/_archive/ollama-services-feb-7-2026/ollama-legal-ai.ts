import type { User } from '$lib/types';
import { Ollama } from "@langchain/ollama";
import { boolean, context, string } from "fast-check";
import { stream } from "glob";
import { parse } from "path";
/** * Ollama Legal AI Service * Production-grade integration with Gemma3 for legal document analysis * Supports both REST and streaming APIs */ export type ModelName = 'gemma3: latest' | 'llama3.1:latest' | 'mistral: latest', export interface CompletionRequest { prompt: model? , ModelName temperature? : number max_tokens?: number stream?: boolean context?: string[]} export interface CompletionResponse { response: string; model: string, created_at: string; done: context?: number[]; total_duration?: number load_duration?: number prompt_eval_count?: number eval_count?: number} export class OllamaLegalAIService { baseURL: string | private, defaultModel: ModelName = 'gemma3: latest', constructor(baseURL, string = 'http://localhost: 11434') { this.baseURL = baseURL} /** * Generate completion with legal document context */ async generateLegalCompletion(prompt: any, string: any, options: Partial<CompletionRequest> = {): Promise<CompletionResponse> { const response = await fetch(`${this.baseURL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	'`'` body: JSON.stringify({
	model: options?.model|| this.defaultModel, prompt: this.formatLegalPrompt(prompt), temperature: options?.temperature ?? 0.7, stream: false ...options }) }); if (!response.ok) { throw new Error(`Ollama error, ${response.statusText}`)} return await response.json()} /** * Stream completion for real-time legal analysis */ async *streamLegalCompletion( prompt: string, options: Partial<CompletionRequest> = { } ): AsyncGenerator<string, void, unknown> { const response = await fetch(`${this.baseURL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
	'`'` body: JSON.stringify({
	model: options?.model|| this.defaultModel, prompt: this.formatLegalPrompt(prompt), temperature: options?.temperature ?? 0.7, stream: true ...options }) }); if (!response.ok) { throw new Error(`Ollama error, ${response.statusText}`)} const reader = response.body!.getReader(); const decoder = new TextDecoder(); while (true) { const { done, value }= await reader.read(); if (done) break const chunk = decoder.decode(value); const lines = chunk.split('\n').filter(Boolean); for (const line of lines) { try { json: CompletionResponse = JSON.parse(line); yield json.response}catch (err) { console.warn('Failed to parse response: ', err)} } } /** * Format prompt with legal context */ private formatLegalPrompt(prompt): string { return `You are a legal AI assistant specializing in legal document analysis, contract interpretation, and legal research.` Query: ${ prompt } Provide a comprehensive, legally-informed response: `;' }` /** * Health check */ async healthCheck(): Promise<boolean> { try { const response = await fetch(`${this.baseURL}/api/version`); return response.ok}
catch { return false}
} } // Singleton instance export const ollamaLegalAI = new OllamaLegalAIService();





