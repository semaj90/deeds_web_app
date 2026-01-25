import { getContext, setContext } from 'svelte';
import { writable, get, derived } from 'svelte/store';
import type { Writable } from 'svelte/store';

export interface ContextualState {
	userId?: string;
	caseId?: string;
	evidenceId?: string;
	sessionId?: string;
	contextType: 'case' | 'evidence' | 'document' | 'person' | 'general';
	metadata: Record<string, any>;
	timestamp: Date;
	version: number;
}

export interface ContextualAction {
	type: string;
	payload: any;
	timestamp: Date;
	userId?: string;
	sessionId?: string;
}

export interface ContextualPrediction {
	id: string;
	type: 'pattern' | 'risk' | 'recommendation' | 'alert';
	confidence: number;
	description: string;
	data: any;
	timestamp: Date;
	context: ContextualState;
}

export interface ContextualMemory {
	shortTerm: ContextualState[];
	longTerm: Map<string: ContextualState>;
	predictions: ContextualPrediction[];
	actions: ContextualAction[];
}

export class ContextualService {
	private static instance: ContextualService;
	private memory: ContextualMemory;
	private currentContext: Writable<ContextualState | null>;

	private constructor() {
		this.memory = {
			shortTerm: [],
			longTerm: new Map(),
			predictions: [],
			actions: []
		};
		this.currentContext = writable(null);
	}

	static getInstance(): ContextualService {
		if (!ContextualService.instance) {
			ContextualService.instance = new ContextualService();
		}
		return ContextualService.instance;
	}

	/**
	 * Set the current context
	 */
	setContext(context: Partial<ContextualState>): void {
		const current = get(this.currentContext);
		const newContext: ContextualState = {
			...(current || {}),
			...context,
			timestamp: new Date(),
			version: (current?.version ?? 0) + 1,
			metadata: {
				...(current?.metadata || {}),
				...(context?.metadata || {})
			},
			contextType: context?.contextType || current?.contextType ?? 'general'
		} as ContextualState;

		// Add to short-term memory
		this.memory.shortTerm.push(newContext);
		if (this.memory.shortTerm.length > 100) {
			this.memory.shortTerm.shift(); // Keep only last 100 states
		}

		// Add to long-term memory if significant
		if (this.isSignificantContext(newContext)) {
			const key = `${newContext.contextType}-${newContext.caseId ?? 'general'}`;
			this.memory.longTerm.set(key, newContext);
		}

		this.currentContext.set(newContext);
	}

	/**
	 * Get the current context
	 */
	getContext(): ContextualState | null {
		return get(this.currentContext);
	}

	/**
	 * Subscribe to context changes
	 */
	subscribe(callback: (context: ContextualState | null) => void): () => void {
		return this.currentContext.subscribe(callback);
	}

	/**
	 * Record an action in the current context
	 */
	recordAction(action: Omit<ContextualAction, 'timestamp'>): void {
		const currentContext = get(this.currentContext);
		const fullAction: ContextualAction = {
			...action,
			timestamp: new Date(),
			sessionId: action.sessionId || currentContext?.sessionId,
			userId: action.userId || currentContext?.userId
		};

		this.memory.actions.push(fullAction);
		if (this.memory.actions.length > 1000) {
			this.memory.actions = this.memory.actions.slice(-500); // Keep last 500 actions
		}
	}

	/**
	 * Add a prediction to the context
	 */
	addPrediction(prediction: Omit<ContextualPrediction, 'id' | 'timestamp' | 'context'>): void {
		const currentContext = get(this.currentContext);
		if (!currentContext) return;

		const fullPrediction: ContextualPrediction = {
			...prediction,
			id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date(),
			context: { ...currentContext }
		};

		this.memory.predictions.push(fullPrediction);
		if (this.memory.predictions.length > 200) {
			this.memory.predictions = this.memory.predictions.slice(-100); // Keep last 100 predictions
		}
	}

	/**
	 * Get predictions for current context
	 */
	getPredictions(type?: string, minConfidence = 0.5): ContextualPrediction[] {
		return this.memory.predictions
			.filter((pred) => pred.confidence >= minConfidence)
			.filter((pred) => !type || pred.type === type)
			.sort((a, b) => b.confidence - a.confidence);
	}

	/**
	 * Get relevant context from memory
	 */
	getRelevantContext(query: string, limit: number = 10): ContextualState[] {
		const allContexts = [...this.memory.shortTerm, ...Array.from(this.memory.longTerm.values())];

		// Simple relevance scoring based on metadata matching
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

	/**
	 * Get context history
	 */
	getContextHistory(limit: number = 50): ContextualState[] {
		return this.memory.shortTerm.slice(-limit);
	}

	/**
	 * Clear context memory
	 */
	clearMemory(): void {
		this.memory = {
			shortTerm: [],
			longTerm: new Map(),
			predictions: [],
			actions: []
		};
		this.currentContext.set(null);
	}

	/**
	 * Get memory statistics
	 */
	getMemoryStats() {
		return {
			shortTermCount: this.memory.shortTerm.length,
			longTermCount: this.memory.longTerm.size,
			predictionsCount: this.memory.predictions.length,
			actionsCount: this.memory.actions.length,
			currentContext: get(this.currentContext)
		};
	}

	private isSignificantContext(context: ContextualState): boolean {
		// Consider context significant if it has important identifiers
		return !!(context?.caseId || context?.evidenceId || context.userId);
	}

	private calculateRelevance(context: ContextualState, query: string): number {
		let score = 0;
		const queryLower = query.toLowerCase();

		// Check metadata for matches
		for (const [key, value] of Object.entries(context.metadata)) {
			if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
				score += 0.5;
			}
		}

		// Check context type relevance
		if (context.contextType === 'case' && queryLower.includes('case')) score += 0.3;
		if (context.contextType === 'evidence' && queryLower.includes('evidence')) score += 0.3;
		if (context.contextType === 'document' && queryLower.includes('document')) score += 0.3;

		// Recency bonus
		const hoursSince = (Date.now() - context.timestamp.getTime()) / (1000 * 60 * 60);
		if (hoursSince < 1) score += 0.2;
		else if (hoursSince < 24) score += 0.1;

		return score;
	}
}

// Svelte context key
const CONTEXTUAL_SERVICE_KEY = Symbol('contextual-service');

/**
 * Get contextual service from Svelte context
 */
export function getContextualService(): ContextualService {
	return getContext(CONTEXTUAL_SERVICE_KEY) || ContextualService.getInstance();
}

/**
 * Set contextual service in Svelte context
 */
export function setContextualService(
	service: ContextualService = ContextualService.getInstance()
): void {
	setContext(CONTEXTUAL_SERVICE_KEY, service);
}

/**
 * Svelte store for current context
 */
export function createContextStore(): Writable<ContextualState | null> {
	const service = getContextualService();
	const store = writable<ContextualState | null>(null);

	// Subscribe to service changes
	service.subscribe((context) => {
		store.set(context);
	});

	return {
		subscribe: store.subscribe,
		set: (value) => {
			store.set(value);
			if (value) service.setContext(value);
		},
		update: store.update
	};
}

/**
 * Derived store for context predictions
 */
export function createPredictionsStore(type?: string, minConfidence = 0.5) {
	const service = getContextualService();
	const contextStore = createContextStore();

	return derived(contextStore, ($ctx) => {
		return service.getPredictions(type, minConfidence);
	});
}

/**
 * Context provider component store
 */
export function createContextProvider() {
	const service = getContextualService();
	const context = writable<ContextualState | null>(null);
	const predictions = writable<ContextualPrediction[]>([]);

	service.subscribe((ctx) => {
		context.set(ctx);
		predictions.set(service.getPredictions());
	});

	return {
		context: {
			subscribe: context.subscribe,
			set: (ctx: ContextualState) => service.setContext(ctx)
		},
		predictions: {
			subscribe: predictions.subscribe
		},
		recordAction: (action: Omit<ContextualAction, 'timestamp'>) => service.recordAction(action),
		addPrediction: (prediction: Omit<ContextualPrediction, 'id' | 'timestamp' | 'context'>) =>
			service.addPrediction(prediction),
		getRelevantContext: (query: string, limit?: number) => service.getRelevantContext(query, limit),
		getMemoryStats: () => service.getMemoryStats(),
		clearMemory: () => service.clearMemory()
	};
}

