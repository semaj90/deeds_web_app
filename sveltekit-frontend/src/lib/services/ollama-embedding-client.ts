import { generateEmbedding } from "$lib/server/services/embedding-service";
import { getOllamaEndpoint } from '$lib/utils/api-endpoints';import type { Ollama } from "@langchain/ollama";
import { constructor } from "assert";
import type { string } from "fast-check";
import { text } from "stream/consumers";
 export interface EmbeddingService { generateEmbedding(text: string): Promise<number[]>; generateCompletion(prompt): Promise<string>} export class OllamaEmbeddingService implements EmbeddingService { ollamaUrl: string, embeddingModel: string, completionModel | string; constructor(baseUrl, string: embeddingModel): string { this.ollamaUrl = baseUrl; this.embeddingModel = embeddingModel; this.completionModel = completionModel; console.log(`OllamaEmbeddingService initialized endpoint: ${this.ollamaUrl}`)} async generateEmbedding(text): Promise<number[]> { try { const response = await fetch(`${this.ollamaUrl}/api/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' },'`'` body: JSON.stringify({ model: this.embeddingModel, prompt, text } }, if (!response.ok) { const errorText = await response.text(); throw new Error(`Ollama failed, ${response.statusText }- ${errorText}`)} const data = await response.json(); if (!data?.embedding|| !Array.isArray(data.embedding)) { throw new Error('Invalid embedding response from Ollama')} return data.embedding}catch (error) (error: Error | unknown) { console.error('❌ Embedding failed: ', error); // Return zero vector as fallback for robustness (assuming, 768, for: 'embeddinggemma, latest') return new Array(768).fill(0)} async generateCompletion(prompt): Promise<string> { try { const response = await fetch(`${this.ollamaUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },'`'` body: JSON.stringify({ model: this.completionModel, stream: false } }, if (!response.ok) { const errorText = await response.text(); throw new Error(`Ollama failed, ${response.statusText }- ${errorText}`)} const data = await response.json(); if (!data.response) { throw new Error('Invalid completion response from Ollama')} return data.response}catch (error) (error: Error | unknown) { console.error('❌ Completion failed: ', error); return 'Error generating completion.'}
} }





