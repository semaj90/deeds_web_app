/**
 * Phase 76: ChatSession Reactive Class (Svelte 5 Runes)
 * Real SSE streaming via /api/sse/chat with reconnection logic.
 * Client router: lightweight queries → local ONNX, legal/RAG → server Ollama.
 */
import { shouldEscalateToServer, type RouterDecision } from '$lib/ai/client-router.js';
import { SERVER_CHAT_MODEL, CLIENT_LLM_ONNX_PATH, CLIENT_LLM_TOKENIZER_PATH } from '$lib/ai/model-ids.js';
import type { InferenceSource } from '$lib/ai/model-ids.js';
import { clientCache } from '$lib/ai/client-cache.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
	role: ChatRole;
	content: string;
	timestamp?: string;
	source?: InferenceSource;
	metadata?: {
		confidence?: number;
		confidenceFactors?: ConfidenceFactors;
		citations?: string[];
		graph_context?: string[];
		warnings?: string[];
		routerDecision?: RouterDecision;
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
	source?: InferenceSource;
	confidence?: number;
	confidenceFactors?: ConfidenceFactors;
	contextUsed?: string[];
}

export class ChatSession {
	messages = $state<ChatMessage[]>([]);
	status = $state<'idle' | 'thinking' | 'streaming' | 'error'>('idle');
	error = $state<string | null>(null);
	lastConfidence = $state<number>(1.0);
	lastSource = $state<InferenceSource>('server-ollama');
	connectionStatus = $state<'connected' | 'disconnected'>('disconnected');

	private abortController: AbortController | null = null;
	private _chatId: string;
	private _hasCaseContext: boolean;

	constructor(chatId: string, initialHistory: ChatMessage[] = [], hasCaseContext = false) {
		this._chatId = chatId;
		this.messages = initialHistory;
		this._hasCaseContext = hasCaseContext;
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
	 * Send a message — routes through client router to decide local vs server.
	 * Local ONNX path: TODO — wire onnxruntime-web InferenceSession here.
	 * Server path: SSE stream via /api/sse/chat (existing, fully wired).
	 */
	async sendMessage(content?: string, options?: { forceServer?: boolean; forceLocal?: boolean }) {
		if (content) {
			this.addMessage('user', content);
		}

		const lastUserMsg = [...this.messages].reverse().find((m) => m.role === 'user');
		if (!lastUserMsg) return;

		// ── Client Router Decision (check LokiJS cache first) ──────────
		const decision = shouldEscalateToServer(lastUserMsg.content, this.messages, {
			forceServer: options?.forceServer,
			forceLocal: options?.forceLocal,
			hasCaseContext: this._hasCaseContext
		});

		// Cache the router decision for fast repeated lookups
		clientCache.cacheRouterDecision(
			lastUserMsg.content,
			decision.source,
			decision.reason,
			decision.confidence
		);

		this.lastSource = decision.source;

		if (decision.source === 'local-onnx') {
			await this._handleLocalInference(lastUserMsg.content, decision);
		} else {
			await this._handleServerInference(lastUserMsg.content, decision);
		}
	}

	/**
	 * Local ONNX inference via onnxruntime-web + WebGPU (Dawn).
	 *
	 * Flow:
	 *   1. Check IndexedDB cache → return cached reply if hit
	 *   2. Load model + tokenizer via getOnnxSession()
	 *   3. Tokenize → run InferenceSession → greedy decode
	 *   4. Cache result in IndexedDB (persistent)
	 *   5. If ONNX fails → auto-escalate to server
	 */
	private async _handleLocalInference(message: string, decision: RouterDecision) {
		this.status = 'thinking';
		this.error = null;

		// Check IndexedDB cache first
		const cached = await clientCache.getReply(message);
		if (cached) {
			console.info('[ChatRouter] Cache hit (IndexedDB)', { source: cached.source });
			this.messages.push({
				role: 'assistant',
				content: cached.content,
				timestamp: new Date().toISOString(),
				source: 'local-onnx',
				metadata: { routerDecision: decision }
			});
			this.status = 'idle';
			this.lastSource = 'local-onnx';
			return;
		}

		try {
			const { getOnnxSession, getProviderLabel } = await import('$lib/ai/onnx/session.js');
			const { AutoTokenizer } = await import('@huggingface/transformers');

			// Load model + tokenizer in parallel
			const [session, tokenizer] = await Promise.all([
				getOnnxSession(CLIENT_LLM_ONNX_PATH),
				AutoTokenizer.from_pretrained(
					CLIENT_LLM_TOKENIZER_PATH.replace('/tokenizer.json', ''),
					{ local_files_only: true }
				)
			]);

			this.status = 'streaming';

			// Tokenize
			const encoded = tokenizer(message, {
				return_tensors: 'np',
				padding: true,
				truncation: true,
				max_length: 512
			});

			// Build tensors
			const { Tensor } = await import('onnxruntime-web');
			const inputIds = new Tensor(
				'int32',
				new Int32Array(encoded.input_ids.data),
				[1, encoded.input_ids.data.length]
			);
			const attentionMask = new Tensor(
				'int32',
				new Int32Array(encoded.attention_mask.data),
				[1, encoded.attention_mask.data.length]
			);

			// Run inference
			const results = await session.run({
				input_ids: inputIds,
				attention_mask: attentionMask
			});

			// Greedy decode from logits
			const logits = results.logits?.data ?? results[Object.keys(results)[0]]?.data;
			if (!logits) throw new Error('No logits output from ONNX model');

			const vocabSize = 256000; // Gemma3 vocab size
			const generatedTokens: number[] = [];

			for (let i = 0; i < 128; i++) {
				let maxProb = -Infinity;
				let nextToken = 0;
				const startIdx = (encoded.input_ids.data.length + i - 1) * vocabSize;

				for (let j = 0; j < vocabSize; j++) {
					if (logits[startIdx + j] > maxProb) {
						maxProb = logits[startIdx + j];
						nextToken = j;
					}
				}

				if (nextToken === tokenizer.eos_token_id) break;
				generatedTokens.push(nextToken);
			}

			const content = tokenizer.decode(generatedTokens, { skip_special_tokens: true });
			const provider = getProviderLabel(CLIENT_LLM_ONNX_PATH);

			// Add assistant message
			this.messages.push({
				role: 'assistant',
				content,
				timestamp: new Date().toISOString(),
				source: 'local-onnx',
				metadata: { routerDecision: decision }
			});

			// Cache in IndexedDB
			await clientCache.putReply(message, content, 'local-onnx');

			this.status = 'idle';
			this.lastSource = 'local-onnx';
			this.lastConfidence = decision.confidence;
			console.info(`[ChatRouter] Local ONNX response via ${provider}`, {
				tokens: generatedTokens.length,
				reason: decision.reason
			});

		} catch (err: any) {
			// ONNX failed → auto-escalate to server
			console.warn('[ChatRouter] Local ONNX failed, escalating to server:', err.message);
			await this._handleServerInference(message, {
				...decision,
				source: 'server-ollama',
				reason: `local-fallback(${decision.reason}): ${err.message}`
			});
		}
	}

	/**
	 * Server SSE inference via /api/sse/chat (Ollama gemma3-legal:latest + RAG).
	 */
	private async _handleServerInference(message: string, decision: RouterDecision) {
		this.status = 'thinking';
		this.error = null;

		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const res = await fetch('/api/sse/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					conversationId: this._chatId,
					model: SERVER_CHAT_MODEL
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
				timestamp: new Date().toISOString(),
				source: decision.source,
				metadata: { routerDecision: decision }
			});

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';

				for (const event of events) {
					// Gather all data: lines in this event (handles multi-line data)
					const dataLines = event
						.split('\n')
						.filter((l) => l.startsWith('data:') || l.startsWith('data: '))
						.map((l) => l.replace(/^data:\s?/, ''));
					const dataLine = dataLines.join('').trim();
					if (!dataLine) continue;

					try {
						const chunk: SSEChunk = JSON.parse(dataLine);

						if (chunk.status === 'streaming' || chunk.status === 'done') {
							this.status = chunk.status === 'done' ? 'idle' : 'streaming';
							this.messages[assistantIdx] = {
								...this.messages[assistantIdx],
								content: chunk.content,
								source: chunk.source ?? decision.source,
								metadata: {
									...this.messages[assistantIdx].metadata,
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
