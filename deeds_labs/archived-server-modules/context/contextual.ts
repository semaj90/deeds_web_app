/**
 * Contextual Service — Server-side context management
 * Plain TS singleton (no svelte/store — server files must not use $state runes)
 * Rewritten Session 63: Svelte 5 best practices
 *
 * Per https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/:
 *   Server-side state must be per-request via event.locals, NOT global singletons.
 *   This service is safe for single-user dev/CLI usage but must be scoped per-request in production.
 */

export interface ContextualState {
	userId?: string;
	caseId?: string;
	evidenceId?: string;
	sessionId?: string;
	contextType: 'case' | 'evidence' | 'document' | 'person' | 'general';
	metadata: Record<string, unknown>;
	timestamp: Date;
	version: number;
}

export interface ContextualAction {
	type: string;
	payload: unknown;
	timestamp: Date;
	userId?: string;
	sessionId?: string;
}

export interface ContextualPrediction {
	id: string;
	type: 'pattern' | 'risk' | 'recommendation' | 'alert';
	confidence: number;
	description: string;
	data: unknown;
	timestamp: Date;
	context: ContextualState;
}

export interface ContextualMemory {
	shortTerm: ContextualState[];
	longTerm: Map<string, ContextualState>;
	predictions: ContextualPrediction[];
	actions: ContextualAction[];
}

export class ContextualService {
	private memory: ContextualMemory;
	private currentContext: ContextualState | null = null;

	constructor() {
		this.memory = {
			shortTerm: [],
			longTerm: new Map(),
			predictions: [],
			actions: []
		};
	}

	setContext(context: Partial<ContextualState>): void {
		const current = this.currentContext;
		const newContext: ContextualState = {
			contextType: context.contextType ?? current?.contextType ?? 'general',
			metadata: { ...(current?.metadata ?? {}), ...(context.metadata ?? {}) },
			timestamp: new Date(),
			version: (current?.version ?? 0) + 1,
			userId: context.userId ?? current?.userId,
			caseId: context.caseId ?? current?.caseId,
			evidenceId: context.evidenceId ?? current?.evidenceId,
			sessionId: context.sessionId ?? current?.sessionId
		};

		this.memory.shortTerm.push(newContext);
		if (this.memory.shortTerm.length > 100) {
			this.memory.shortTerm.shift();
		}

		if (this.isSignificantContext(newContext)) {
			const key = `${newContext.contextType}-${newContext.caseId ?? 'general'}`;
			this.memory.longTerm.set(key, newContext);
		}

		this.currentContext = newContext;
	}

	getContext(): ContextualState | null {
		return this.currentContext;
	}

	recordAction(action: Omit<ContextualAction, 'timestamp'>): void {
		const fullAction: ContextualAction = {
			...action,
			timestamp: new Date(),
			sessionId: action.sessionId ?? this.currentContext?.sessionId,
			userId: action.userId ?? this.currentContext?.userId
		};

		this.memory.actions.push(fullAction);
		if (this.memory.actions.length > 1000) {
			this.memory.actions = this.memory.actions.slice(-500);
		}
	}

	addPrediction(prediction: Omit<ContextualPrediction, 'id' | 'timestamp' | 'context'>): void {
		if (!this.currentContext) return;

		const fullPrediction: ContextualPrediction = {
			...prediction,
			id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date(),
			context: { ...this.currentContext }
		};

		this.memory.predictions.push(fullPrediction);
		if (this.memory.predictions.length > 200) {
			this.memory.predictions = this.memory.predictions.slice(-100);
		}
	}

	getPredictions(type?: string, minConfidence = 0.5): ContextualPrediction[] {
		return this.memory.predictions
			.filter((pred) => pred.confidence >= minConfidence)
			.filter((pred) => !type || pred.type === type)
			.sort((a, b) => b.confidence - a.confidence);
	}

	getRelevantContext(query: string, limit = 10): ContextualState[] {
		const allContexts = [...this.memory.shortTerm, ...Array.from(this.memory.longTerm.values())];

		const scored = allContexts.map((context) => ({
			context,
			score: this.calculateRelevance(context, query)
		}));

		return scored
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((item) => item.context);
	}

	getContextHistory(limit = 50): ContextualState[] {
		return this.memory.shortTerm.slice(-limit);
	}

	clearMemory(): void {
		this.memory = {
			shortTerm: [],
			longTerm: new Map(),
			predictions: [],
			actions: []
		};
		this.currentContext = null;
	}

	getMemoryStats() {
		return {
			shortTermCount: this.memory.shortTerm.length,
			longTermCount: this.memory.longTerm.size,
			predictionsCount: this.memory.predictions.length,
			actionsCount: this.memory.actions.length,
			currentContext: this.currentContext
		};
	}

	private isSignificantContext(context: ContextualState): boolean {
		return !!(context.caseId || context.evidenceId || context.userId);
	}

	private calculateRelevance(context: ContextualState, query: string): number {
		let score = 0;
		const queryLower = query.toLowerCase();

		for (const [, value] of Object.entries(context.metadata)) {
			if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
				score += 0.5;
			}
		}

		if (context.contextType === 'case' && queryLower.includes('case')) score += 0.3;
		if (context.contextType === 'evidence' && queryLower.includes('evidence')) score += 0.3;
		if (context.contextType === 'document' && queryLower.includes('document')) score += 0.3;

		const hoursSince = (Date.now() - context.timestamp.getTime()) / (1000 * 60 * 60);
		if (hoursSince < 1) score += 0.2;
		else if (hoursSince < 24) score += 0.1;

		return score;
	}
}
