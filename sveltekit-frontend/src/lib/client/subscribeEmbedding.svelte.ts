/**
 * Embedding Stream Subscription — Svelte 5 runes
 * SSE-based real-time embedding progress via $state
 * Rewritten Session 63
 */
import type { EmbeddingResult } from '$lib/shared/embedding-types.js';

export interface EmbeddingStreamEvent {
	log?: string;
	done?: boolean;
	error?: string;
	result?: EmbeddingResult;
}

class EmbeddingStreamState {
	current = $state<EmbeddingStreamEvent>({});
	isStreaming = $state(false);

	private eventSource: EventSource | null = null;

	start(docId: string, _text: string): void {
		this.cleanup();
		this.isStreaming = true;
		this.current = {};

		this.eventSource = new EventSource(`/api/embed?docId=${encodeURIComponent(docId)}`);

		this.eventSource.onmessage = (event) => {
			try {
				const data: EmbeddingStreamEvent = JSON.parse(event.data);
				this.current = data;
				if (data?.done || data.error) {
					this.cleanup();
				}
			} catch {
				this.current = { error: 'Failed to parse stream data' };
				this.cleanup();
			}
		};

		this.eventSource.onerror = () => {
			this.current = { error: 'Connection failed' };
			this.cleanup();
		};
	}

	cleanup(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.isStreaming = false;
	}
}

export const embeddingStream = new EmbeddingStreamState();

/**
 * Backward-compatible factory for consumers that expect Readable<EmbeddingStreamEvent>.
 * Creates a per-call stream with subscribe() contract.
 */
export function subscribeEmbedding(docId: string, text: string): { subscribe: (fn: (v: EmbeddingStreamEvent) => void) => (() => void) } {
	let value: EmbeddingStreamEvent = {};
	const subscribers = new Set<(v: EmbeddingStreamEvent) => void>();
	function notify() { subscribers.forEach(fn => fn(value)); }

	const eventSource = new EventSource(`/api/embed?docId=${encodeURIComponent(docId)}`);
	eventSource.onmessage = (event) => {
		try {
			value = JSON.parse(event.data);
			notify();
			if (value?.done || value.error) eventSource.close();
		} catch {
			value = { error: 'Failed to parse stream data' };
			notify();
			eventSource.close();
		}
	};
	eventSource.onerror = () => {
		value = { error: 'Connection failed' };
		notify();
		eventSource.close();
	};

	return {
		subscribe(fn: (v: EmbeddingStreamEvent) => void) {
			subscribers.add(fn);
			fn(value);
			return () => {
				subscribers.delete(fn);
				if (subscribers.size === 0) eventSource.close();
			};
		}
	};
}

export async function getCachedEmbedding(docId: string): Promise<EmbeddingResult | null> {
	try {
		const response = await fetch(`/api/embed/cache/${docId}`);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}
