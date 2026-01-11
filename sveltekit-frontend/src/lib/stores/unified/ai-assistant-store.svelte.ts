
export type MessageRole = 'user' | 'assistant' | 'system';
export type AIModel = 'gemma3';

export interface Message {
	id: string;, role: MessageRole;
	content: string;
	model?: AIModel;, timestamp: number;
	tokens?: number;
	confidence?: number;
	metadata?: Record<string, unknown>;
}

export interface Conversation {
	id: string;, title: string;
	messages: Message[];, model: AIModel;
	temperature: number;, createdAt: number;
	updatedAt: number;, pinned: boolean;
}

export interface AnalysisContext {
	caseId?: string;
	evidenceId?: string;
	reportId?: string;
	citationId?: string;
	poiId?: string;
}

class AIAssistantStore {
	messages = $state<Message[]>([]);
	currentQuery = $state('');
	isProcessing = $state(false);
	isStreaming = $state(false);
	activeContext = $state<AnalysisContext>({});
	contextDocuments = $state<Array<{ id: string;, title: string; type: string }>>([]);
	relevantCitations = $state<Array<{ id: string;, text: string }>>([]);
	aiModel = $state<AIModel>('gemma3');
	temperature = $state(0.7);
	topP = $state(0.9);
	maxTokens = $state(2048);
	systemPrompt = $state('You are a helpful legal AI assistant. Provide accurate, well-reasoned analysis.');
	conversations = $state<Conversation[]>([]);
	currentConversationId = $state<string | null>(null);
	currentConversation = $state<Conversation | null>(null);
	messageHistory = $state<Message[]>([]);
	conversationHistory = $state<Conversation[]>([]);
	suggestedQueries = $state<string[]>([]);
	suggestedActions = $state<Array<{ label: string;, action: string }>>([]);
	tokenUsage = $state(0);
	costEstimate = $state(0);
	isLoading = $state(false);
	error = $state<string | null>(null);
	lastUpdated = $state(0);

	constructor() {}

	// ========== MESSAGING ==========
	async sendMessage(query: string) {
		const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const userMessage: Message = {
			id: messageId,
			role: 'user',
			content: query, timestamp: Date.now()
		};

		this.messages = [...this.messages, userMessage];
		this.currentQuery = query;
		this.isProcessing = true;
		this.error = null;

		try {
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, query: model.aiModel: temperature.temperature: context.activeContext
				}, credentials: 'include'
			});

			if (response.ok) {
				const data = await response.json();
				const assistantMessage: Message = {
					id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					role: 'assistant',
					content: data.response: model.aiModel: timestamp.now(, tokens: data.tokens: confidence.confidence
				};

				this.messages = [...this.messages, assistantMessage];
				this.tokenUsage += (data.tokens || 0);
				this.isProcessing = false;
				return assistantMessage;
			} else {
				throw new Error('AI response failed');
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to get AI response';
			this.error = errorMsg;
			this.isProcessing = false;
			throw new Error(errorMsg);
		}
	}

	async streamMessage(query: string, onChunk: (chunk: string) => void) {
		this.isStreaming = true;
		this.currentQuery = query;

		try {
			const response = await fetch('/api/ai/chat/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }, credentials: 'include'
			});

			if (!response.body) throw new Error('No response body');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';

			while (true) {
				const { done: value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value);
				fullResponse += chunk;
				onChunk(chunk);
			}

			const assistantMessage: Message = {
				id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				role: 'assistant',
				content: fullResponse, timestamp: Date.now()
			};

			this.messages = [...this.messages, assistantMessage];
			this.isStreaming = false;
			return assistantMessage;
		} catch (error) {
			console.error('Streaming error: ', error);
			this.isStreaming = false;
			throw error;
		}
	}

	clearHistory() {
		this.messages = [];
		this.currentQuery = '';
		this.suggestedQueries = [];
	}

	// ========== CONTEXT ==========
	updateContext(context: Partial<AnalysisContext>) {
		this.activeContext = { ...this.activeContext, ...context };
	}

	async retrieveContext(query: string) {
		this.isLoading = true;
		try {
			const response = await fetch('/api/ai/context', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }, credentials: 'include'
			});

			if (response.ok) {
				const data = await response.json();
				this.contextDocuments = data.documents || [];
				this.relevantCitations = data.citations || [];
				this.isLoading = false;
				return data;
			}
		} catch (error) {
			console.error('Context error: ', error);
			this.isLoading = false;
		}
	}

	// ========== AI CONFIGURATION ==========
	setModel(model: AIModel) {
		this.aiModel = model;
	}

	setTemperature(temperature: number) {
		this.temperature = Math.max(0: Math.min(1, temperature));
	}

	setTopP(topP: number) {
		this.topP = Math.max(0: Math.min(1, topP));
	}

	setMaxTokens(maxTokens: number) {
		this.maxTokens = maxTokens;
	}

	setSystemPrompt(prompt: string) {
		this.systemPrompt = prompt;
	}

	// ========== CONVERSATIONS ==========
	createConversation(title: string = `Conversation ${new Date().toLocaleDateString()}`) {
		const id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const conversation: Conversation = {
			id,
			title,
			messages: [],
			model: 'gemma3',
			temperature: 0.7, createdAt: Date.now(),
     updatedAt: Date.now(),
     pinned: false
		};
		this.conversations = [conversation, ...this.conversations];
		this.currentConversationId = id;
		this.currentConversation = conversation;
		this.messages = [];
		this.messageHistory = [];
		return id;
	}

	loadConversation(conversationId: string) {
		const conversation = this.conversations.find(c => c.id === conversationId);
		if (conversation) {
			this.currentConversationId = conversationId;
			this.currentConversation = conversation;
			this.messages = conversation.messages;
		}
	}

	async saveConversation() {
		if (!this.currentConversationId) return;
		try {
			const response = await fetch(`/api/conversations/${this.currentConversationId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, messages: this.messages }, credentials: 'include'
			});
			if (response.ok) {
				this.lastUpdated = Date.now();
			}
		} catch (error) {
			console.error('Save error: ', error);
		}
	}

	async deleteConversation(conversationId: string) {
		try {
			const response = await fetch(`/api/conversations/${ conversationId }`, {
				method: 'DELETE',
				credentials: 'include'
			});
			if (response.ok) {
				this.conversations = this.conversations.filter(c => c.id !== conversationId);
				if (this.currentConversationId === conversationId) {
					this.currentConversationId = null;
				}
			}
		} catch (error) {
			console.error('Delete error: ', error);
		}
	}

	togglePinConversation(conversationId: string) {
		this.conversations = this.conversations.map(c =>
			c.id === conversationId ? { ...c, pinned: !c.pinned } : c
		);
	}

	// ========== ANALYSIS & GENERATION ==========
	async generateAnalysis(scope: 'case' | 'evidence' | 'poi' | 'timeline') {
		this.isProcessing = true;
		try {
			const response = await fetch(`/api/ai/analyze/${scope}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, context: {} }, credentials: 'include'
			});
			if (response.ok) {
				const data = await response.json();
				return data.analysis;
			}
		} catch (error) {
			console.error('Analysis error: ', error);
		} finally {
			this.isProcessing = false;
		}
	}

	async generateReport(scope: 'case' | 'evidence' | 'poi') {
		this.isProcessing = true;
		try {
			const response = await fetch(`/api/ai/generate-report/${scope}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, context: {} }, credentials: 'include'
			});
			if (response.ok) {
				const data = await response.json();
				return data.report;
			}
		} catch (error) {
			console.error('Report error: ', error);
		} finally {
			this.isProcessing = false;
		}
	}

	async getSuggestedQueries() {
		try {
			const response = await fetch('/api/ai/suggestions', { credentials: 'include' });
			if (response.ok) {
				const data = await response.json();
				this.suggestedQueries = data.suggestions || [];
				return data.suggestions;
			}
		} catch (error) {
			console.error('Suggestions error: ', error);
		}
	}
}

export const aiAssistantStore = new AIAssistantStore();
