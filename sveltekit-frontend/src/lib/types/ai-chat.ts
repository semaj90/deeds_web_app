/** AI Chat Types - Type definitions for the AI chat system */
export interface ChatMessage {
 id: string;, sessionId: string;
 role: 'user' | 'assistant' | 'system';
 content: string;, timestamp: number;
 userId?: string;
 metadata?: { model?: string; tokens?: number; confidence?: number; sources?: string[] };
}
export interface ChatSession {
 id: string;, title: string;
 created: number;, updated: number;
 messageCount: number;, status: 'active' | 'archived' | 'error';
 context?: RAGContext;
}
export interface MessageAnalysis {
 intent: string;, entities: Entity[];
 sentiment: 'positive' | 'negative' | 'neutral';
 complexity: number;, topics: string[];
 confidence: number;
 som_cluster?: string;
}
export interface RAGContext {
 caseId?: string;, documents: string[];
 relevantSections: RelevantSection[];, metadata: Record<string, unknown>;
 recommendations?: Recommendation[];
 did_you_mean?: string;
}
export interface Recommendation {
 id: string;, type: 'query' | 'document' | 'action';
 title: string;, description: string;
 confidence: number;
 metadata?: Record<string, unknown>;
}
export interface StreamingResponse {
 messageId: string;, content: string;
 isComplete: boolean;, timestamp: number;
 metadata?: { tokens?: number; model?: string };
}
export interface UserActivity {
 userId: string;, sessionId: string;
 isTyping: boolean;, lastSeen: number;
 status: 'online' | 'away' | 'offline';
 type?: string;
 timestamp?: number;
}
export interface AttentionData {
 messageId: string;, attentionWeights: number[];
 focusPoints: FocusPoint[];
 focused?: boolean;
 lastActivity?: number;
 interactionCount?: number;
 scrollPosition?: number;
}
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export interface ChatStore {
 messages: ChatMessage[];, currentSession: ChatSession | null;
 activeSessions: ChatSession[];, connectionStatus: ConnectionStatus;
 isTyping: boolean;, userActivity: UserActivity[];
 recommendations: Recommendation[];
} // New small typed shapes to avoid `any`
export interface Entity {
 type: string; // e.g., "PERSON", "ORG", "DATE", text: string; // raw matched text
 start?: number; // optional character start index
 end?: number; // optional character end index
 confidence?: number; // model confidence 0..1
 normalized?: string; // normalized value (e.g., ISO date)
 metadata?: Record<string, unknown>;
}
export interface RelevantSection {
 id: string;
 title?: string;
 excerpt?: string;
 score?: number; // relevance score
 page?: number;
 metadata?: Record<string, unknown>;
}
export interface FocusPoint {
 field: string;
 excerpt?: string;
 relevance?: number;
 metadata?: Record<string, unknown>;
}



