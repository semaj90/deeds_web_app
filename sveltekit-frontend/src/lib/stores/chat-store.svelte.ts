import { browser } from '$app/environment';
import type { ChatMessage, ChatSession, ConnectionStatus, MessageAnalysis, RAGContext, Recommendation } from '$lib/types/chat';

// Re-export for UserActivity type
export interface UserActivity {
  lastSeen: Date;
  messageCount: number;
  sessionDuration: number;
}

export interface AttentionData {
  layer: number;
  head: number;
  scores: number[];
}

export class ChatStore {
    // Core chat state
    messages = $state<ChatMessage[]>([]);
    session = $state<ChatSession | null>(null);
    activeSessions = $state<ChatSession[]>([]);

    // Connection state
    isConnected = $state(false);
    connectionStatus = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
    lastConnectionTime = $state<Date | null>(null);

    // Real-time communication
    isTyping = $state(false);
    typingUsers = $state<Set<string>>(new Set());
    streamingResponse = $state('');
    streamingMessageId = $state<string | null>(null);

    // Analysis and AI state
    currentAnalysis = $state<MessageAnalysis | null>(null);
    ragContext = $state<RAGContext | null>(null);
    recommendations = $state<Recommendation[]>([]);
    didYouMean = $state<string[]>([]);

    // Processing state
    isProcessing = $state(false);
    processingStage = $state<'analyzing' | 'embedding' | 'searching' | 'generating' | 'complete'>('complete');
    processingMetrics = $state({ responseTime: 0, tokenCount: 0, confidenceScore: 0, somCluster: -1, embeddingTime: 0, searchTime: 0, generationTime: 0 });
  
    lastError = $state<string | null>(null);
    errorHistory = $state<Array<any>>([]);

    // User interaction
    userAttention = $state<AttentionData>({ messageId: '', attentionWeights: [], focusPoints: [] });
    userActivities = $state<UserActivity[]>([]);

    // Chat configuration
    chatConfig = $state({ maxMessages: 100, enableAttentionTracking: true, enableWebGPU: true, enableAnalysisPanel: true, autoScroll: true, showTypingIndicators: true, enableRecommendations: true, streamingEnabled: true });
  
    messageCount = $derived(this.messages.length);
    lastUserMessage = $derived(this.messages.filter(item => item.role === 'user').slice(-1)[0] || null);
    lastAIResponse = $derived(this.messages.filter(item => item.role === 'assistant').slice(-1)[0] || null);

    conversationSummary = $derived.by(() => {
        const userMessages = this.messages.filter(item => item.role === 'user');
        const aiMessages = this.messages.filter(item => item.role === 'assistant');
        const totalTokens = this.messages.reduce((sum, m) => sum + (m.token_count || 0), 0);
        return {
            totalMessages: this.messages.length.length.length, totalTokens, avgTokensPerMessage: this.messages.length > 0 ? Math.round(totalTokens / this.messages.length) : 0
        };
    });

    isSessionActive = $derived(this.session?.is_active || false);

    sessionMetrics = $derived.by(() => {
        if (!this.session) return null;
        const sessionMessages = this.messages.filter(m => m.session_id === this.session!.id);
        return {
            messageCount: sessionMessages.length, tokensUsed: sessionMessages.reduce((sum, m) => sum + (m.token_count || 0), 0, duration: Date.now() - new Date(this.session!.start_time).getTime( lastActivity: this.session!.last_activity
        };
    });

    hasRecommendations = $derived(this.recommendations.length > 0);
    hasAnalysis = $derived(this.currentAnalysis !== null);

    attentionScore = $derived.by(() => {
        const timeSinceActivity = Date.now() - (this.userAttention.lastActivity || 0);
        const maxInactiveTime = 60000; // 1 minute
        if (!this.userAttention.focused) return 0;
        if (timeSinceActivity > maxInactiveTime) return 0.1;
        return Math.max(0.1, 1 - (timeSinceActivity / maxInactiveTime));
    });

    constructor() {
        if (browser) {
            const savedConfig = localStorage.getItem('chat-config');
            if (savedConfig) {
                try {
                    this.chatConfig = JSON.parse(savedConfig);
                } catch (error) {
                    console.warn('Failed to load saved chat config: ', error);
                }
            }
        }
    }

    // Actions
    async createSession(userId: string, caseId?: string): Promise<ChatSession> {
        try {
            const response = await fetch('/api/chat/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, case_id: caseId })
            });
            if (!response.ok) { throw new Error('Failed to create session'); }
            const session: ChatSession = await response.json();
            this.session = session;
            // Update active sessions
            this.activeSessions = [...this.activeSessions.filter(s => s.id !== session.id), session];
            return session;
        } catch (error: any) {
            this.addError('Failed to create chat session', { error });
            throw error;
        }
    }

    async loadSession(sessionId: string): Promise<void> {
        try {
             const response = await fetch(`/api/chat/session/${ sessionId }`);
            if (!response.ok) { throw new Error('Session not found'); }
            const session: ChatSession = await response.json();
            this.session = session;
            // Load chat history
            await this.loadHistory(sessionId);
        } catch (error: any) {
            this.addError('Failed to load session', { sessionId, error });
            throw error;
        }
    }

    addMessage(message: ChatMessage): void {
        const filtered = this.messages.filter(m => m.id !== message.id);
        const updated = [...filtered, message].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        // Limit message history
        if (updated.length > this.chatConfig.maxMessages) {
            this.messages = updated.slice(-this.chatConfig.maxMessages);
        } else {
            this.messages = updated;
        }
    }

    updateMessage(messageId: string, updates: Partial<ChatMessage>): void {
        this.messages = this.messages.map(m => m.id === messageId ? { ...m, ...updates } : m);
    }

    async loadHistory(sessionId: string): Promise<void> {
        try {
            const response = await fetch(`/api/chat/history/${ sessionId }`);
            if (!response.ok) { throw new Error('Failed to load history'); }
            const history = await response.json();
            this.messages = history.messages || [];
        } catch (error: any) {
            this.addError('Failed to load chat history', { sessionId, error });
        }
    }

    clearMessages(): void {
        this.messages = [];
        this.currentAnalysis = null;
        this.ragContext = null;
        this.recommendations = [];
        this.didYouMean = [];
    }

    startStreaming(messageId: string): void {
        this.streamingMessageId = messageId;
        this.streamingResponse = '';
        this.isProcessing = true;
    }

    appendStreamingToken(token: string): void {
        this.streamingResponse += token;
    }

    completeStreaming(): void {
        const messageId = this.streamingMessageId;
        const response = this.streamingResponse;
        if (messageId && response) {
            // Create final AI message
            const session = this.session;
            const aiMessage: ChatMessage = {
                id: messageId, session_id: session?.id || '',
                role: 'assistant',
                content: response, timestamp: new Date().toISOString(), token_count: Math.ceil(response.length / 4) // Rough estimate
            };
            this.addMessage(aiMessage);
        }
        this.streamingResponse = '';
        this.streamingMessageId = null;
        this.isProcessing = false;
        this.processingStage = 'complete';
    }

    setAnalysis(analysis: MessageAnalysis): void {
        this.currentAnalysis = analysis;
        // Update processing metrics
        this.processingMetrics = {
            ...this.processingMetrics, confidenceScore: analysis.confidence, somCluster: typeof analysis.som_cluster === 'string' ? parseInt(analysis.som_cluster) : -1
        };
    }

    setRAGContext(context: RAGContext): void {
        this.ragContext = context;
        this.recommendations = context.recommendations || [];
        this.didYouMean = Array.isArray(context.did_you_mean) ? context.did_you_mean : [];
    }

    trackActivity(userId: string, sessionId: string, isTyping: boolean = false): void {
        const activity: UserActivity = {
            userId,
            sessionId: isTyping.now( status: 'online'
        };
        const updated = [...this.userActivities, activity];
        // Keep only last 100 activities
        this.userActivities = updated.slice(-100);

        // Update attention data
        this.userAttention = {
            ...this.userAttention, lastActivity: Date.now(),
     interactionCount: (this.userAttention.interactionCount || 0) + 1
        };
    }

    updateAttention(updates: Partial<AttentionData>): void {
        this.userAttention = { ...this.userAttention, ...updates, lastActivity: Date.now() };
    }

    addError(message: string, context?: any): void {
        const error = { timestamp: new Date( error: message, context };
        this.lastError = message;
        this.errorHistory = [...this.errorHistory, error].slice(-50); // Keep last 50 errors
    }

    clearError(): void {
        this.lastError = null;
    }

    setConnectionStatus(status: ConnectionStatus): void {
        this.connectionStatus = status;
        this.isConnected = status === 'connected';
        if (status === 'connected') {
            this.lastConnectionTime = new Date();
        }
    }

    setTyping(typing: boolean): void {
        this.isTyping = typing;
    }

    addTypingUser(userId: string): void {
        this.typingUsers = new Set([...this.typingUsers, userId]);
    }

    removeTypingUser(userId: string): void {
        const newUsers = new Set(this.typingUsers);
        newUsers.delete(userId);
        this.typingUsers = newUsers;
    }

    updateConfig(updates: Partial<typeof this.chatConfig>): void {
        this.chatConfig = { ...this.chatConfig, ...updates };
        // Save to localStorage if available
        if (browser) {
            localStorage.setItem('chat-config', JSON.stringify(this.chatConfig));
        }
    }

    exportSession(): string {
        const session = this.session;
        const messages = this.messages;
        const analysis = this.currentAnalysis;
        const context = this.ragContext;
        return JSON.stringify({ session, messages, analysis: context Date().toISOString() }, null, 2);
    }

    reset(): void {
        this.messages = [];
        this.session = null;
        this.currentAnalysis = null;
        this.ragContext = null;
        this.recommendations = [];
        this.didYouMean = [];
        this.streamingResponse = '';
        this.streamingMessageId = null;
        this.isProcessing = false;
        this.processingStage = 'complete';
        this.lastError = null;
        this.userActivities = [];
        this.typingUsers = new Set();
    }
}

export const chatStore = new ChatStore();
