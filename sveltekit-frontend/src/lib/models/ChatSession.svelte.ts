/**
 * Phase 76: ChatSession Reactive Class (Svelte 5 Runes)
 * Real SSE streaming via /api/sse/chat with reconnection logic
 */
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
	role: ChatRole;
	content: string;
	timestamp?: string;
	metadata?: {
		confidence?: number;
		confidenceFactors?: ConfidenceFactors;
		citations?: string[];
		graph_context?: string[];
		warnings?: string[];
	};
}

export interface ConfidenceFactors {
	caseContext: boolean;
	ragHits: number;
	topScore: number | null;
	embeddingModel: string;
}

export interface SSEChunk {
	id: string;
	role: 'assistant';
	content: string;
	status: 'thinking' | 'streaming' | 'done' | 'error';
	confidence?: number;
	confidenceFactors?: ConfidenceFactors;
	contextUsed?: string[];
}

export class ChatSession {
	messages = $state<ChatMessage[]>([]);
	status = $state<'idle' | 'thinking' | 'streaming' | 'error'>('idle');
	error = $state<string | null>(null);
	lastConfidence = $state<number>(1.0);
	connectionStatus = $state<'connected' | 'disconnected'>('disconnected');

	private abortController: AbortController | null = null;
	private _chatId: string;

	constructor(chatId: string, initialHistory: ChatMessage[] = []) {
		this._chatId = chatId;
		this.messages = initialHistory;
		this.connectionStatus = typeof window !== 'undefined' ? 'connected' : 'disconnected';
	}

	get chatId() {
		return this._chatId;
	}

	addOptimistic(content: string) {
		this.messages.push({
			role: 'user',
			content,
			timestamp: new Date().toISOString()
		});
	}

	addMessage(role: ChatRole, content: string) {
		this.messages.push({
			role,
			content,
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * Send a message and stream the assistant response via SSE from /api/sse/chat.
	 * The message should already be added optimistically via addOptimistic().
	 */
	async sendMessage(content?: string) {
		if (content) {
			this.addMessage('user', content);
		}

		const lastUserMsg = [...this.messages].reverse().find((m) => m.role === 'user');
		if (!lastUserMsg) return;

		this.status = 'thinking';
		this.error = null;

		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const res = await fetch('/api/sse/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: lastUserMsg.content,
					conversationId: this._chatId,
					model: 'gemma3-legal:latest'
				}),
				signal: this.abortController.signal
			});

			if (!res.ok || !res.body) {
				throw new Error(`Chat API error: ${res.status}`);
			}

			// Placeholder assistant message — updated as chunks arrive
			const assistantIdx = this.messages.length;
			this.messages.push({
				role: 'assistant',
				content: '',
				timestamp: new Date().toISOString()
			});

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const dataLine = line.replace(/^data: /, '').trim();
					if (!dataLine) continue;

					try {
						const chunk: SSEChunk = JSON.parse(dataLine);

						if (chunk.status === 'streaming' || chunk.status === 'done') {
							this.status = chunk.status === 'done' ? 'idle' : 'streaming';
							this.messages[assistantIdx] = {
								...this.messages[assistantIdx],
								content: chunk.content,
								metadata: {
									confidence: chunk.confidence,
									confidenceFactors: chunk.confidenceFactors,
									citations: chunk.contextUsed
								}
							};
						}

						if (chunk.status === 'done' && chunk.confidence !== undefined) {
							this.lastConfidence = chunk.confidence;
						}

						if (chunk.status === 'error') {
							this.status = 'error';
							this.error = chunk.content;
							this.messages[assistantIdx] = {
								...this.messages[assistantIdx],
								content: chunk.content
							};
						}
					} catch {
						// skip malformed SSE lines
					}
				}
			}

			if (this.status === 'streaming') {
				this.status = 'idle';
			}
		} catch (err: any) {
			if (err.name === 'AbortError') return;
			console.error('ChatSession.sendMessage error:', err);
			this.status = 'error';
			this.error = err.message ?? 'Failed to get response';

			const lastMsg = this.messages[this.messages.length - 1];
			if (lastMsg?.role !== 'assistant') {
				this.messages.push({
					role: 'assistant',
					content: 'Sorry, I encountered an error. Please try again.',
					timestamp: new Date().toISOString()
				});
			}
		} finally {
			this.abortController = null;
		}
	}

	destroy() {
		this.abortController?.abort();
		this.abortController = null;
		this.connectionStatus = 'disconnected';
	}
}