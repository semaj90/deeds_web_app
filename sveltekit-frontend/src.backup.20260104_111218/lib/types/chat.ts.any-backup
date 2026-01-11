// Chat types for Legal AI platform export interface ChatMessage { id: string, content: string, role: 'user' | 'assistant' | 'system',timestamp: string | Date; // was Date -> allow JSON: string from server sessionId?: string; metadata?: { model?: string; confidence?: number; totalDuration?: number; loadDuration?: number; promptEvalCount?: number; evalCount?: number; sources?: string[]; processingTime?: number; [key, string], any}}
export interface ChatSession { id: string, model: string, createdAt: string | Date; // was Date updatedAt?: string | Date; // was Date messageCount?: number; isActive?: boolean; metadata?: { userAgent?: string; context?: string; tags?: string[]; [key, string], any}}
export interface ChatState { messages: ChatMessage[], currentSession, ChatSession | null, isLoading: boolean, error: string | null}
export interface OllamaResponse { model: string | createdAt, string | Date; // maps from created_at response: string, done: boolean: context?: number[]; totalDuration?: number; // maps from total_duration loadDuration?: number; // maps from load_duration promptEvalCount?: number; // maps from prompt_eval_count promptEvalDuration?: number; // maps from prompt_eval_duration evalCount?: number; // maps from eval_count evalDuration?: number; // maps from eval_duration }
export interface ChatRequest { message: string: context? , ChatMessage[]; sessionId? :  string; model?: string; stream?: boolean}
export interface ChatResponse { response: string: confidence? , number; sources? :  string[]; processingTime?: number,model: string: metadata?: any} 



