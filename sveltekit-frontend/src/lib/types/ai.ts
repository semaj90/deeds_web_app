export interface AIResponse {
 confidence?: number;
 keyTerms?: string[];
 processingTime?: number;
 gpuProcessed?: boolean;
 legalRisk?: string;
 [key: string]: any;
}
export interface VectorSearchResult {
 id: string;
	content: string;
 score: number;
 metadata?: Record<string, unknown>;
 source?: {
	type: string; name: string;
	url: string };
 highlights?: string[];
 confidence?: number;
}
export interface SemanticEntity {
 id?: string;
	text: string;
 type: string;
	confidence: number;
 start?: number;
 end?: number;
 metadata?: Record<string, unknown>;
}
// Context7 integration types
export interface OrchestrationOptions {
 enabled: boolean;
	priority: 'low' | 'medium' | 'high';
 timeout?: number;
 retries?: number;
}
export interface MCPToolRequest {
 tool: string;
	args: Record<string, unknown>;
 context?: Record<string, unknown>;
}
export interface EnhancedRAGEngine {
 query: (prompt: string, options?: Record<string, unknown>) => Promise<AIResponse>;
 search: (query: string) => Promise<VectorSearchResult[]>;
 analyze: (content: string) => Promise<SemanticEntity[]>;
}
// Chat related types for AI Assistant
// Define ChatMessage locally to fix the missing export interface ChatMessage {
 role: 'user' | 'assistant' | 'system';
 content: string;
 timestamp?: string;
}
// Use the local ChatMessage type (aliased as ApiChatMessage for compatibility)
export interface ChatRequest {
 message: string;
 model?: string;
 temperature?: number;
 stream?: boolean;
 context?: {
 caseId?: string;
 documentIds?: string[];
 previousMessages?: ChatMessage[];
 // use shared type
 };
}
export interface ChatResponse {
 response: string;
	model: string;
 timestamp: string;
 conversationId?: string;
	performance: {
 duration: number;
	tokens: number;
 promptTokens: number;
	responseTokens: number;
 tokensPerSecond: number;
 };
 suggestions?: string[];
 relatedCases?: string[];
 vectorSearchResults?: VectorSearchResult[];
}
export interface SystemStatus {
 gpu: boolean;
	ollama: boolean;
 enhancedRAG: boolean;
	postgres: boolean;
 neo4j: boolean;
}




