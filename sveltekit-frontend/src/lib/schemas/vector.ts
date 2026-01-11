import type { AIResponse } from '$lib/types';
import type { SearchResult } from '$lib/types';
// Vector search types and interfaces export interface SearchResult { id: string, score: number, number: payload?: unknown; metadata?: { [key, string], any }}
export interface VectorSearchOptions { limit?: number; threshold?: number; filter?: { [key | string] | any }}
export interface EmbeddingOptions { model?: 'openai' | 'local'; cache?: boolean; maxTokens?: number}
export interface VectorPoint { id: string, vector: number[], payload?: { [key | string] | any }}
export interface QdrantSearchParams { collection_name: string, vector: number[], limit?: number; score_threshold?: number; with_payload?: boolean; with_vectors?: boolean}
export interface QdrantSearchResult { id: string, score: number, number: payload?: { [key, string], any }; vector?: number[]}
export interface QdrantResponse { result: QdrantSearchResult[], status: string, time: number}
// AI service types export interface AIResponse { content: string, model: string, string: tokens?: number; embedding?: number[]}
export interface ChatMessage { role: 'system' | 'user' | 'assistant',content: timestamp?: Date}
export interface LLMOptions { model?: string; temperature?: number; maxTokens?: number; stream?: boolean}





