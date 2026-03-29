/**
 * SSE Status Store - Svelte 5 Runes (Session 30)
 *
 * Manages Server-Sent Events connection state with auto-reconnect.
 * Replaces writable/derived pattern with class-based reactive store.
 */

export interface SSEConnectionState {
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;
	lastMessageTime: Date | null;
	reconnectAttempts: number;
	maxReconnectAttempts: number;
	reconnectDelay: number;
}

export interface ProcessingEvent {
	stage: 'imagemagick' | 'esrgan' | 'sam' | 'granite_docling' | 'tesseract_fallback';
	status: string;
	page: number;
	pages_total: number;
	percent: number;
	eta: number;
	details: string;
	timestamp: string;
	confidence?: number;
}

class SSEStatusStore {
	isConnected = $state(false);
	isConnecting = $state(false);
	error = $state<string | null>(null);
	lastMessageTime = $state<Date | null>(null);
	reconnectAttempts = $state(0);
	maxReconnectAttempts = $state(5);
	reconnectDelay = $state(1000);

	private eventSource: EventSource | null = null;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private registeredListeners: Array<{ type: string; handler: EventListener }> = [];

	// Derived
	connectionStatus = $derived.by(() => {
		if (this.isConnected) return 'Connected';
		if (this.isConnecting) return 'Connecting...';
		if (this.error) return `Error: ${this.error}`;
		return 'Disconnected';
	});

	private reconnect(endpoint: string, token?: string) {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			this.error = 'Max reconnection attempts reached';
			return;
		}

		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
		console.log(
			`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`,
		);

		this.reconnectAttempts++;
		this.isConnecting = true;

		this.reconnectTimeout = setTimeout(() => {
			this.connect(endpoint, token).catch((error) => {
				console.error('[SSE] Reconnection failed:', error);
			});
		}, delay);
	}

	async connect(endpoint: string, token?: string): Promise<EventSource> {
		this.isConnecting = true;
		this.error = null;

		try {
			this.eventSource = new EventSource(endpoint);

			this.eventSource.addEventListener('open', () => {
				this.isConnected = true;
				this.isConnecting = false;
				this.error = null;
				this.reconnectAttempts = 0;
				console.log('[SSE] Connected to document processing stream');
			});

			this.eventSource.addEventListener('error', () => {
				this.isConnected = false;
				this.isConnecting = false;
				this.error = 'Connection lost';
				this.reconnect(endpoint, token);
			});

			return this.eventSource;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.isConnecting = false;
			this.error = errorMessage;
			console.error('[SSE] Connection failed:', error);
			throw error;
		}
	}

	on(eventType: string, callback: (event: ProcessingEvent) => void): () => void {
		if (!this.eventSource) {
			console.warn('[SSE] EventSource not initialized');
			return () => {};
		}

		const handler = (event: Event) => {
			try {
				const customEvent = event as MessageEvent;
				const data = JSON.parse(customEvent.data) as ProcessingEvent;
				this.lastMessageTime = new Date();
				callback(data);
			} catch (error) {
				console.error(`[SSE] Error parsing ${eventType} event:`, error);
			}
		};

		this.eventSource.addEventListener(eventType, handler);
		this.registeredListeners.push({ type: eventType, handler });

		return () => {
			this.eventSource?.removeEventListener(eventType, handler);
			this.registeredListeners = this.registeredListeners.filter(l => l.handler !== handler);
		};
	}

	onMessage(callback: (event: ProcessingEvent) => void): () => void {
		return this.on('message', callback);
	}

	disconnect() {
		if (this.eventSource) {
			// Remove all tracked listeners before closing
			for (const { type, handler } of this.registeredListeners) {
				this.eventSource.removeEventListener(type, handler);
			}
			this.registeredListeners = [];
			this.eventSource.close();
			this.eventSource = null;
		}
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		this.isConnected = false;
		this.isConnecting = false;
		this.error = null;
		console.log('[SSE] Disconnected from stream');
	}

	clearError() {
		this.error = null;
	}

	reset() {
		this.disconnect();
		this.lastMessageTime = null;
		this.reconnectAttempts = 0;
	}
}

export const sseStatusStore = new SSEStatusStore();
