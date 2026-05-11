export type ContextualChatRole = 'user' | 'assistant' | 'system';

export interface ContextualChatMessage {
	role: ContextualChatRole;
	content: string;
	metadata?: Record<string, unknown>;
}

export interface ContextualChatIntent {
	label: 'evidence_upload' | 'schema_drift' | 'graph_search' | 'gpu_rerank' | 'ui_bug' | 'legal_research' | 'unknown';
	confidence: number;
	keywords: string[];
	fallback: boolean;
}

export interface ContextualChatRouteStep {
	tool: string;
	args: Record<string, unknown>;
	takeFrom?: number;
}

export interface ContextualChatRoute {
	reason: string;
	fallback: boolean;
	chain: ContextualChatRouteStep[];
	trace: Array<{ tool: string; ms: number; ok: boolean; error?: string }>;
	result: unknown;
}

export interface ContextualChatResponse {
	response: string;
	turnId: string;
	keywords: string[];
	keyPhrases: string[];
	suggestions: Array<{ query: string; reason: string; score: number }>;
	citations?: Array<{ id: string; source: string; score: number }>;
	latencyMs: number;
	model: string;
	intent?: ContextualChatIntent;
	route?: ContextualChatRoute;
}

class ContextualChatStore {
	messages = $state<ContextualChatMessage[]>([]);
	isThinking = $state(false);
	lastError = $state<string | null>(null);
	lastIntent = $state<ContextualChatIntent | null>(null);
	lastRoute = $state<ContextualChatRoute | null>(null);
	lastResponse = $state<ContextualChatResponse | null>(null);
	sessionId = $state<string | null>(null);

	get hasPartialResults(): boolean {
		return this.lastRoute?.trace.some((step) => !step.ok) ?? false;
	}

	clear(): void {
		this.messages = [];
		this.lastError = null;
		this.lastIntent = null;
		this.lastRoute = null;
		this.lastResponse = null;
		this.sessionId = null;
	}

	async send(message: string): Promise<ContextualChatResponse | null> {
		const trimmed = message.trim();
		if (!trimmed || this.isThinking) return null;

		this.isThinking = true;
		this.lastError = null;
		const userIndex = this.messages.push({ role: 'user', content: trimmed }) - 1;

		try {
			const res = await fetch('/api/ai/contextual-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ message: trimmed, sessionId: this.sessionId ?? undefined }),
			});
			const data = (await res.json()) as ContextualChatResponse & { error?: string };
			if (!res.ok) {
				this.lastError = data.error ?? `HTTP ${res.status}`;
				this.messages = [...this.messages, { role: 'system', content: `[error] ${this.lastError}` }];
				return null;
			}

			this.lastResponse = data;
			this.lastIntent = data.intent ?? null;
			this.lastRoute = data.route ?? null;
			this.sessionId = data.turnId ? this.sessionId : this.sessionId;
			this.messages[userIndex].metadata = {
				intent: data.intent ?? null,
				route: data.route ?? null,
			};
			this.messages.push({ role: 'assistant', content: data.response, metadata: { route: data.route ?? null } });
			return data;
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : String(err);
			this.messages = [...this.messages, { role: 'system', content: `[error] ${this.lastError}` }];
			return null;
		} finally {
			this.isThinking = false;
		}
	}
}

export const contextualChat = new ContextualChatStore();
