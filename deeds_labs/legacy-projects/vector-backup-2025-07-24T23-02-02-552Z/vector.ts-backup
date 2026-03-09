// Vector search types and interfaces
export interface SearchResult {
  id: string;
  score: number;
  payload?: any;
  metadata?: Record<string, any>;
}
export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}
export interface EmbeddingOptions {
  model?: "openai" | "local";
  cache?: boolean;
  maxTokens?: number;
}
export interface VectorPoint {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
}
export interface QdrantSearchParams {
  collection_name: string;
  vector: number[];
  limit?: number;
  score_threshold?: number;
  with_payload?: boolean;
  with_vectors?: boolean;
}
export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, any>;
  vector?: number[];
}
export interface QdrantResponse {
  result: QdrantSearchResult[];
  status: string;
  time: number;
}
// AI service types
export interface AIResponse {
  content: string;
  model: string;
  tokens?: number;
  embedding?: number[];
}
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: Date;
}
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}
