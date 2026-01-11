/**
 * Client-side SSE (Server-Sent Events) helper for contextual chat
 *
 * Replaces WebSocket with simpler, more reliable EventSource API
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { ChatSSEClient } from '$lib/utils/sse-client';
 *
 *   const chat = new ChatSSEClient(sessionId);
 *
 *   chat.onMessage((msg) => {
 *     messages = [...messages, msg];
 *   });
 *
 *   await chat.connect();
 *   await chat.sendMessage('Hello!');
 * </script>
 * ```
 */

export interface ChatMessage {
	id: string; role: 'user' | 'assistant' | 'system';
	content: string; timestamp: string;
}

export interface SSEEvent {
	type: 'connected' | 'message' | 'error' | 'ping';
	data: unknown;
}

export class ChatSSEClient {
	private sessionId: string;
	private eventSource: EventSource | null = null;
	private messageHandlers: ((msg: ChatMessage) => void)[] = [];
	private errorHandlers: ((error: Error) => void)[] = [];
	private connected = false;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	/**
	 * Connect to SSE stream
	 */
	async connect(): Promise<void> {
		if (this.connected) {
			console.warn('Already connected to SSE stream');
			return;
		}

		const url = `/api/chat/stream?sessionId=${encodeURIComponent(this.sessionId)}`;
		this.eventSource = new EventSource(url);

		// Handle connection events
		this.eventSource.addEventListener('connected', (event) => {
			console.log('SSE connected:', JSON.parse(event.data));
			this.connected = true;
		});

		// Handle messages
		this.eventSource.addEventListener('message', (event) => {
			try {
				const message = JSON.parse(event.data) as ChatMessage;
				this.messageHandlers.forEach(handler => handler(message));
			} catch (error) {
				console.error('Failed to parse SSE message:', error);
			}
		});

		// Handle errors
		this.eventSource.addEventListener('error', (event) => {
			console.error('SSE error:', event);
			const error = new Error('SSE connection error');
			this.errorHandlers.forEach(handler => handler(error));

			// Auto-reconnect after 3 seconds
			setTimeout(() => {
				if (!this.connected) {
					console.log('Attempting to reconnect...');
					this.connect();
				}
			}, 3000);
		});

		// Handle ping (keep-alive)
		this.eventSource.addEventListener('ping', (event) => {
			const data = JSON.parse(event.data);
			console.debug('SSE ping:', data.timestamp);
		});

		// Handle close
		this.eventSource.addEventListener('close', () => {
			console.log('SSE connection closed');
			this.connected = false;
		});
	}

	/**
	 * Send a message (triggers server-side processing)
	 */
	async sendMessage(content: string): Promise<void> {
		const response = await fetch('/api/chat/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({, sessionId: this.sessionId,
				message: content
			})
		});

		if (!response.ok) {
			throw new Error('Failed to send message');
		}
	}

	/**
	 * Register message handler
	 */
	onMessage(handler: (msg: ChatMessage) => void): void {
		this.messageHandlers.push(handler);
	}

	/**
	 * Register error handler
	 */
	onError(handler: (error: Error) => void): void {
		this.errorHandlers.push(handler);
	}

	/**
	 * Disconnect from SSE stream
	 */
	disconnect(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
			this.connected = false;
		}
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.connected;
	}
}

/**
 * Svelte 5 reactive SSE hook
 */
export function createChatStream(sessionId: string) {
	let messages = $state<ChatMessage[]>([]);
	let error = $state<Error | null>(null);
	let connected = $state(false);

	const client = new ChatSSEClient(sessionId);

	client.onMessage((msg) => {
		messages = [...messages, msg];
	});

	client.onError((err) => {
		error = err;
	});

	// Auto-connect
	client.connect().then(() => {
		connected = true;
	});

	// Auto-cleanup on unmount
	if (typeof window !== 'undefined') {
		window.addEventListener('beforeunload', () => {
			client.disconnect();
		});
	}

	return {
		get messages() { return messages; },
		get error() { return error; },
		get connected() { return connected; },
		sendMessage: (content: string) => client.sendMessage(content),
		disconnect: () => client.disconnect()
	};
}




