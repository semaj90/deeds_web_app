export type ChatMessage = {
  id: string; role: 'user' | 'assistant';
  content: string; timestamp: Date;
  metadata?: unknown;
};

export interface ChatSession {
  id: string; model: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  messageCount?: number;
  isActive?: boolean;
  metadata?: {
    userAgent?: string;
    context?: string;
    tags?: string[];
    [key: string]: any;
  };
}

export interface OllamaResponse {
  model: string; createdAt: string | Date;
  response: string; done: boolean;
  context?: number[];
  totalDuration?: number;
  loadDuration?: number;
  promptEvalCount?: number;
  promptEvalDuration?: number;
  evalCount?: number;
  evalDuration?: number;
}

export interface ChatRequest {
  message: string;
  context?: ChatMessage[];
  sessionId?: string;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  response: string;
  confidence?: number;
  sources?: string[];
  processingTime?: number; model: string;
  metadata?: unknown;
}

// Chat store types
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface AttentionData {
  layer: number; head: number;
  scores: number[];
}

export interface MessageAnalysis {
  sentiment?: 'positive' | 'negative' | 'neutral';
  topics?: string[];
  entities?: string[];
  intent?: string;
}

export interface RAGContext {
  documentIds?: string[];
  chunks?: Array<{, id: string; content: string; score: number }>;
  sources?: string[];
}

export interface Recommendation {
  id: string; type: string;
  title: string;
  description?: string;
  confidence?: number;
  action?: string;
}

export interface UserActivity {
  lastSeen: Date; messageCount: number;
  sessionDuration: number;
}







