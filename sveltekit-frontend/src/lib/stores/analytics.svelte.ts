/**
 * Client-side analytics tracking store.
 *
 * Batches events and flushes to /api/analytics/events every 30s
 * or on page unload. Tracks page views, feature usage, and user interactions.
 *
 * Usage in components:
 *   import { analytics } from '$lib/stores/analytics.svelte';
 *   analytics.track('chat_query', { query: 'breach of contract' });
 *
 * Auto page-view tracking (in +layout.svelte):
 *   $effect(() => { analytics.trackPageView($page.url.pathname); });
 */

type EventType =
	| 'chat_query' | 'tool_search' | 'codebase_search' | 'route_opened'
	| 'case_created' | 'case_updated' | 'evidence_uploaded' | 'rag_search'
	| 'embedding_generated' | 'cache_hit' | 'cache_miss' | 'error_analyzed'
	| 'patch_applied' | 'document_indexed';

interface QueuedEvent {
	eventType: EventType;
	payload: Record<string, unknown>;
	timestamp: number;
}

const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_SIZE = 100;

class AnalyticsStore {
	private queue: QueuedEvent[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private userId: string | null = null;
	private sessionId: string | null = null;
	private lastPath: string | null = null;
	private initialized = false;

	/** Call once from root layout's onMount */
	init(userId?: string | null) {
		if (this.initialized) return;
		this.initialized = true;
		this.userId = userId ?? null;
		this.sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		// Flush every 30s
		this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

		// Flush on page unload
		if (typeof window !== 'undefined') {
			window.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') this.flush();
			});
		}
	}

	/** Track an analytics event */
	track(eventType: EventType, payload: Record<string, unknown> = {}) {
		if (!this.initialized) return;

		this.queue.push({
			eventType,
			payload: { ...payload, path: typeof window !== 'undefined' ? window.location.pathname : '' },
			timestamp: Date.now()
		});

		// Auto-flush if queue is getting large
		if (this.queue.length >= MAX_QUEUE_SIZE) {
			this.flush();
		}
	}

	/** Track a page view (deduplicated by path) */
	trackPageView(pathname: string) {
		if (pathname === this.lastPath) return;
		this.lastPath = pathname;
		this.track('route_opened', { route: pathname });
	}

	/** Flush queued events to the server in a single batch request */
	private async flush() {
		if (this.queue.length === 0) return;

		const events = this.queue.splice(0);

		try {
			await fetch('/api/analytics/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batch: events.map(event => ({
						userId: this.userId,
						sessionId: this.sessionId,
						eventType: event.eventType,
						payload: { ...event.payload, clientTimestamp: event.timestamp }
					}))
				}),
				keepalive: true // Ensures delivery on page unload
			});
		} catch {
			// Re-queue on failure (up to limit)
			for (const event of events) {
				if (this.queue.length >= MAX_QUEUE_SIZE) break;
				this.queue.push(event);
			}
		}
	}

	/** Set user ID after login */
	setUser(userId: string) {
		this.userId = userId;
	}

	/** Clean up on unmount */
	destroy() {
		if (this.flushTimer) clearInterval(this.flushTimer);
		this.flush();
		this.initialized = false;
	}
}

export const analytics = new AnalyticsStore();
