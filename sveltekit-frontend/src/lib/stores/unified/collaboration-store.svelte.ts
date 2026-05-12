/**
 * Collaboration Store — Real-time board sync via SSE (M6)
 */

export interface CollaborationEvent {
	type: 'presence' | 'typing' | 'mutation' | 'cursor';
	userId: string;
	userName?: string;
	caseId: string;
	payload: any;
	timestamp: number;
}

class CollaborationStore {
	connected = $state(false);
	activeUsers = $state<Map<string, { name: string; lastSeen: number; cursor?: { x: number; y: number } }>>(new Map());
	eventSource: EventSource | null = null;
	currentCaseId: string | null = $state(null);

	async connect(caseId: string) {
		if (this.currentCaseId === caseId && this.connected) return;
		this.disconnect();

		this.currentCaseId = caseId;
		const url = `/api/sse/${caseId}`;
		this.eventSource = new EventSource(url);

		this.eventSource.onopen = () => {
			this.connected = true;
			console.log(`[Collaboration] Connected to case: ${caseId}`);
		};

		this.eventSource.onerror = (err) => {
			console.error(`[Collaboration] SSE error:`, err);
			this.connected = false;
		};

		this.eventSource.addEventListener('message', (e) => {
			try {
				const data = JSON.parse(e.data);
				this.handleMessage(data);
			} catch (err) {
				// Silently ignore malformed messages
			}
		});
	}

	disconnect() {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.connected = false;
		this.activeUsers.clear();
	}

	private handleMessage(event: CollaborationEvent) {
		if (event.caseId !== this.currentCaseId) return;

		switch (event.type) {
			case 'presence':
				this.activeUsers.set(event.userId, {
					name: event.userName || 'Anonymous',
					lastSeen: event.timestamp
				});
				break;
			case 'cursor':
				const user = this.activeUsers.get(event.userId);
				if (user) {
					user.cursor = event.payload;
					user.lastSeen = event.timestamp;
				}
				break;
			case 'mutation':
				// Mutation events (node moved, etc.) should be handled by the board
				// We can expose an event emitter or a callback registry
				this.dispatchMutation(event);
				break;
		}
	}

	private mutationCallbacks = new Set<(event: CollaborationEvent) => void>();

	onMutation(cb: (event: CollaborationEvent) => void) {
		this.mutationCallbacks.add(cb);
		return () => this.mutationCallbacks.delete(cb);
	}

	private dispatchMutation(event: CollaborationEvent) {
		for (const cb of this.mutationCallbacks) {
			cb(event);
		}
	}

	async broadcast(type: CollaborationEvent['type'], payload: any) {
		if (!this.currentCaseId || !this.connected) return;

		try {
			await fetch(`/api/collaboration/broadcast`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caseId: this.currentCaseId,
					type,
					payload,
					timestamp: Date.now()
				})
			});
		} catch (err) {
			console.error('[Collaboration] Broadcast failed:', err);
		}
	}
}

export const collaborationStore = new CollaborationStore();
