// Ollama Service - Production Implementation for Legal AI Platform
import { getAuthHeaders } from './auth-service.js';

export interface OllamaModel {
 name: string;
 modified_at: string;
 size: number;
 digest: string;
 details: {
 format: string;
 family: string;
 families: string[];
 parameter_size: string;
 quantization_level: string;
 };
}

export interface OllamaResponse {
 model: string;
 created_at: string;
 response: string;
 done: boolean;
 context?: number[];
 total_duration?: number;
 load_duration?: number;
 prompt_eval_count?: number;
 prompt_eval_duration?: number;
 eval_count?: number;
 eval_duration?: number;
}

export interface OllamaChatResponse {
 model: string;
 created_at: string;
 message: {
 role: string;
 content: string;
 images?: string[];
 };
 done: boolean;
 total_duration?: number;
 load_duration?: number;
 prompt_eval_count?: number;
 prompt_eval_duration?: number;
 eval_count?: number;
 eval_duration?: number;
}

export interface OllamaGenerateOptions {
 model: string;
 prompt: string;
 system?: string;
 template?: string;
 context?: number[];
 stream?: boolean;
 raw?: boolean;
 format?: string;
 images?: string[];
 options?: {
 temperature?: number;
 top_k?: number;
 top_p?: number;
 num_ctx?: number;
 seed?: number;
 [key: string]: any;
 };
}

export interface OllamaChatOptions {
 model: string;
 messages: {
 role: 'system' | 'user' | 'assistant';
 content: string;
 images?: string[];
 }[];
 stream?: boolean;
 format?: string;
 options?: {
 temperature?: number;
 top_k?: number;
 top_p?: number;
 num_ctx?: number;
 seed?: number;
 [key: string]: any;
 };
}

// Core Ollama Operations
export async function listModels(): Promise<OllamaModel[]> {
 try {
 const response = await fetch('/api/ollama/tags', {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to list Ollama models');
 }

 const data = await response.json();
 return data.models || [];
 } catch (error: Error | unknown) {
 console.error('Ollama list models error: ', error);
 throw new Error(`Failed to list models: ${(error as Error).message}`);
 }
}

export async function generateCompletion(options: OllamaGenerateOptions): Promise<OllamaResponse> {
 try {
 const response = await fetch('/api/ollama/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(options),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to generate completion');
 }

 const result: OllamaResponse = await response.json();
 return result;
 } catch (error: Error | unknown) {
 console.error('Ollama generation error: ', error);
 throw new Error(`Failed to generate completion: ${(error as Error).message}`);
 }
}

export async function generateChatCompletion(
 options: OllamaChatOptions
): Promise<OllamaChatResponse> {
 try {
 const response = await fetch('/api/ollama/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(options),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to generate chat completion');
 }

 const result: OllamaChatResponse = await response.json();
 return result;
 } catch (error: Error | unknown) {
 console.error('Ollama chat error: ', error);
 throw new Error(`Failed to generate chat completion: ${(error as Error).message}`);
 }
}

export async function pullModel(name: string): Promise<void> {
 try {
 const response = await fetch('/api/ollama/pull', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify({ name }),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to pull model');
 }

 console.log(`Started pulling model: ${ name }`);
 } catch (error: Error | unknown) {
 console.error('Ollama pull model error: ', error);
 throw new Error(`Failed to pull model: ${(error as Error).message}`);
 }
}

export async function deleteModel(name: string): Promise<void> {
 try {
 const response = await fetch('/api/ollama/delete', {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify({ name }),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to delete model');
 }

 console.log(`Deleted model: ${name}`);
 } catch (error: Error | unknown) {
 console.error('Ollama delete model error: ', error);
 throw new Error(`Failed to delete model: ${(error as Error).message}`);
 }
}

export async function getEmbeddings(model: string, prompt, string: Promise<number[]> {
 try {
 const response = await fetch('/api/ollama/embeddings', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify({ model: prompt }),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to generate embeddings');
 }

 const result = await response.json();
 return result.embedding;
 } catch (error: Error | unknown) {
 console.error('Ollama embeddings error: ', error);
 throw new Error(`Failed to generate embeddings: ${(error as Error).message}`);
 }
}
