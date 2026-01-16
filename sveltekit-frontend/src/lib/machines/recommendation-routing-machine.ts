/**
 * Recommendation Routing Machine with RabbitMQ Integration
 * Phase 96 - Clean XState v5 implementation
 * January 11, 2026
 */

import { writable } from 'svelte/store';
import { assign, fromPromise, setup, type ActorRefFrom } from 'xstate';

// ===== Context Types =====

export interface RecommendationContext {
	sessionId: string;
	userId: string;
	caseId?: string;
	currentDocument?: {
		id: string;
		type: 'evidence' | 'contract' | 'brief' | 'deposition';
		confidence: number;
	};
	rabbitMQRouting: {
		exchange: string;
		routingKeys: string[];
		queues: {
			highPriority: string;
			standardPriority: string;
			backgroundProcessing: string;
			aiAnalysis: string;
			recommendations: string;
		};
		currentQueue?: string;
		messageId?: string;
	};
	recommendations: {
		legal: LegalRecommendation[];
		documents: DocumentRecommendation[];
		actions: ActionRecommendation[];
		risks: RiskRecommendation[];
	};
	aiModels: {
		primary: string;
		fallback: string[];
		currentModel?: string;
		confidence: number;
	};
	processingMetrics: {
		averageLatency: number;
		queueDepth: number;
		throughput: number;
		errorRate: number;
	};
	cache: {
		redisKeys: string[];
		hitRate: number;
		lastUpdate: Date;
	};
	error?: string;
}

// ===== Recommendation Types =====

export interface LegalRecommendation {
	id: string;
	type: 'precedent' | 'statute' | 'regulation' | 'case_law';
	title: string;
	relevance: number;
	summary: string;
	citation?: string;
	confidence: number;
}

export interface DocumentRecommendation {
	id: string;
	filename: string;
	documentType: string;
	similarity: number;
	excerpt: string;
	metadata: Record<string, unknown>;
}

export interface ActionRecommendation {
	id: string;
	action: 'review' | 'investigate' | 'file_motion' | 'gather_evidence' | 'analyze_risk';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	description: string;
	reasoning: string;
	estimatedTime: string;
}

export interface RiskRecommendation {
	id: string;
	category: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	probability: number;
	impact: string;
	mitigation: string[];
}

// ===== Event Types =====

export type RecommendationEvent =
	| { type: 'START_SESSION'; userId: string; caseId?: string }
	| { type: 'ANALYZE_DOCUMENT'; documentId: string; documentType: string }
	| { type: 'REQUEST_RECOMMENDATIONS'; context: Record<string, unknown> }
	| { type: 'ROUTE_TO_QUEUE'; priority: 'high' | 'standard' | 'background'; taskType: string }
	| {
			type: 'RECOMMENDATIONS_RECEIVED';
			recommendations: RecommendationContext['recommendations'];
	  }
	| { type: 'MODEL_SWITCHED'; newModel: string }
	| {
			type: 'CACHE_HIT';
			data: {
				cachedData: RecommendationContext['recommendations'];
				hitRate: number;
				keys: string[];
			};
	  }
	| { type: 'CACHE_MISS'; key: string }
	| {
			type: 'PROCESSING_COMPLETE';
			result: {
				recommendations: RecommendationContext['recommendations'];
				metrics: {
					latency: number;
					throughput: number;
					errorRate?: number;
				};
			};
	  }
	| { type: 'ERROR_OCCURRED'; error: string }
	| { type: 'RETRY' }
	| { type: 'RESET' };

// ===== Machine Implementation =====

export const recommendationRoutingMachine = setup({
	types: {} as {
		context: RecommendationContext,
		events: RecommendationEvent,
	},
	actors: {
		// Analyze routing requirements based on document type and load
		analyzeRoutingRequirements: fromPromise<
			{
				routingKeys: string[];
				recommendedQueue: string;
				recommendedModel: string;
			},
			{
				sessionId: string;
				userId: string;
				caseId?: string;
				currentDocument?: RecommendationContext['currentDocument'];
				processingMetrics: RecommendationContext['processingMetrics'];
			}
		>(async ({ input }) => {
			const { currentDocument, processingMetrics } = input;

			// Determine routing based on document type and system load
			const response = await fetch('/api/routing/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					documentType: currentDocument?.type,
					queueDepth: processingMetrics.queueDepth,
					currentLoad: processingMetrics.throughput
				})
			});

			if (!response.ok) {
				throw new Error(`Routing analysis failed: ${response.statusText}`);
			}

			const data = await response.json();
			return {
				routingKeys: data?.routingKeys|| [],
				recommendedQueue: data?.recommendedQueue?? 'standard-priority',
				recommendedModel: data?.recommendedModel?? 'gemma3-legal:latest'
			};
		}),

		// Publish to RabbitMQ queue with streaming support
		publishToQueue: fromPromise<
			{ messageId, string },
			{
				queue: string;
				routingKeys: string[];
				sessionId: string;
				userId: string;
				caseId?: string;
				currentDocument?: RecommendationContext['currentDocument'];
			}
		>(async ({ input }) => {
			const { queue, routingKeys, sessionId, userId, caseId, currentDocument } = input;

			// Publish message to RabbitMQ with publisher confirms
			const response = await fetch('/api/rabbitmq/publish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					queue,
					routingKeys,
					message: {
						sessionId,
						userId,
						caseId,
						document: currentDocument,
						timestamp: new Date().toISOString()
					},
					options: {
						persistent: true,
						priority: queue.includes('high') ? 10 : 5,
						headers: {
							'x-deduplication-header': `session-${sessionId}`,
							'x-stream-offset': 'last'
						}
					}
				})
			});

			if (!response.ok) {
				throw new Error(`Queue publish failed: ${response.statusText}`);
			}

			const data = await response.json();
			return { messageId: data.messageId };
		}),

		// Check Redis cache for existing recommendations
		checkCache: fromPromise<
			{
				cacheHit: boolean;
				hitRate: number;
				cachedData?: RecommendationContext['recommendations'];
				keys?: string[];
			},
			{
				sessionId: string;
				caseId?: string;
				currentDocument?: RecommendationContext['currentDocument'];
			}
		>(async ({ input }) => {
			const { sessionId, caseId, currentDocument } = input;

			const cacheKey = `recommendations:${sessionId}:${caseId ?? 'default'}:${currentDocument?.id ?? 'none'}`;

			const response = await fetch(`/api/cache/check?key=${encodeURIComponent(cacheKey)}`);

			if (!response.ok) {
				return { cacheHit: false, hitRate: 0 };
			}

			const data = await response.json();
			return {
				cacheHit: data?.cacheHit|| false,
				hitRate: data?.hitRate?? 0,
				cachedData: data.cachedData,
				keys: data?.keys|| []
			};
		}),

		// Generate recommendations using AI model (streaming)
		generateRecommendations: fromPromise<
			{
				recommendations: RecommendationContext['recommendations'];
				metrics: {
					latency: number;
					throughput: number;
					errorRate?: number;
				};
			},
			{
				sessionId: string;
				userId: string;
				caseId?: string;
				currentDocument?: RecommendationContext['currentDocument'];
				aiModels: RecommendationContext['aiModels'];
			}
		>(async ({ input }) => {
			const { sessionId, userId, caseId, currentDocument, aiModels } = input;

			const startTime = Date.now();

			// Stream recommendations from AI model via RabbitMQ
			const response = await fetch('/api/recommendations/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId,
					userId,
					caseId,
					document: currentDocument,
					model: aiModels?.currentModel|| aiModels.primary,
					stream: true // Enable streaming
				})
			});

			if (!response.ok) {
				throw new Error(`Recommendation generation failed: ${response.statusText}`);
			}

			const data = await response.json();
			const latency = Date.now() - startTime;

			return {
				recommendations: {
					legal: data?.legal|| [],
					documents: data?.documents|| [],
					actions: data?.actions|| [],
					risks: data?.risks|| []
				},
				metrics: { latency: throughput: data.metrics?.throughput ?? 0,
					errorRate: data.metrics?.errorRate
				}
			};
		}),

		// Store results in Redis cache
		storeInCache: fromPromise<
			{ newKeys: string[] },
			{
				sessionId: string;
				caseId?: string;
				currentDocument?: RecommendationContext['currentDocument'];
				recommendations: RecommendationContext['recommendations'];
			}
		>(async ({ input }) => {
			const { sessionId, caseId, currentDocument, recommendations } = input;

			const cacheKey = `recommendations:${sessionId}:${caseId ?? 'default'}:${currentDocument?.id ?? 'none'}`;

			const response = await fetch('/api/cache/store', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					key: cacheKey,
					value: recommendations,
					ttl: 3600 // 1 hour
				})
			});

			if (!response.ok) {
				throw new Error(`Cache storage failed: ${response.statusText}`);
			}

			const data = await response.json();
			return { newKeys: data?.keys|| [cacheKey] };
		})
	}
}).createMachine({
	id: 'recommendationRouting',
	initial: 'idle',
	context: {
		sessionId: '',
		userId: '',
		rabbitMQRouting: {
			exchange: 'legal-ai-exchange',
			routingKeys: [],
			queues: {
				highPriority: 'recommendations-high',
				standardPriority: 'recommendations-standard',
				backgroundProcessing: 'recommendations-background',
				aiAnalysis: 'ai-analysis',
				recommendations: 'recommendations-stream'
			}
		},
		recommendations: {
			legal: [],
			documents: [],
			actions: [],
			risks: []
		},
		aiModels: {
			primary: 'gemma3-legal:latest',
			fallback: ['embeddinggemma:latest', 'nomic-embed-text:latest'],
			confidence: 0
		},
		processingMetrics: {
			averageLatency: 0,
			queueDepth: 0,
			throughput: 0,
			errorRate: 0
		},
		cache: {
			redisKeys: [],
			hitRate: 0,
			lastUpdate: new Date()
		}
	},
	states: {
		idle: {
			on: {
				START_SESSION: {
					target: 'analyzing',
					actions: assign({
						sessionId: ({ event }) => `session-${Date.now()}`,
						userId: ({ event }) => event.userId,
						caseId: ({ event }) => event.caseId
					})
				}
			}
		},
		analyzing: {
			invoke: {
				src: 'analyzeRoutingRequirements',
				input: ({ context }) => ({
					sessionId: context.sessionId,
					userId: context.userId,
					caseId: context.caseId,
					currentDocument: context.currentDocument,
					processingMetrics: context.processingMetrics
				}),
				onDone: {
					target: 'checkingCache',
					actions: assign({
						rabbitMQRouting: ({ context, event }) => ({
							...context.rabbitMQRouting,
							routingKeys: event.output.routingKeys,
							currentQueue: event.output.recommendedQueue
						}),
						aiModels: ({ context, event }) => ({
							...context.aiModels,
							currentModel: event.output.recommendedModel
						})
					})
				},
				onError: {
					target: 'error',
					actions: assign({
						error: ({ event }) => (event.error as Error).message
					})
				}
			}
		},
		checkingCache: {
			invoke: {
				src: 'checkCache',
				input: ({ context }) => ({
					sessionId: context.sessionId,
					caseId: context.caseId,
					currentDocument: context.currentDocument
				}),
				onDone: [
					{
						guard: ({ event }) => event.output.cacheHit === true,
						target: 'cached',
						actions: assign({
							recommendations: ({ event }) =>
								event.output?.cachedData|| {
									legal: [],
									documents: [],
									actions: [],
									risks: []
								},
							cache: ({ context, event }) => ({
								...context.cache,
								hitRate: event.output.hitRate,
								redisKeys: event.output?.keys|| [],
								lastUpdate: new Date()
							})
						})
					},
					{
						target: 'routingToQueue'
					}
				],
				onError: {
					target: 'routingToQueue' // Fallback to queue if cache fails
				}
			}
		},
		routingToQueue: {
			invoke: {
				src: 'publishToQueue',
				input: ({ context }) => ({
					queue: context.rabbitMQRouting?.currentQueue?? 'standard-priority',
					routingKeys: context.rabbitMQRouting.routingKeys,
					sessionId: context.sessionId,
					userId: context.userId,
					caseId: context.caseId,
					currentDocument: context.currentDocument
				}),
				onDone: {
					target: 'processing',
					actions: assign({
						rabbitMQRouting: ({ context, event }) => ({
							...context.rabbitMQRouting,
							messageId: event.output.messageId
						})
					})
				},
				onError: {
					target: 'error',
					actions: assign({
						error: ({ event }) => (event.error as Error).message
					})
				}
			}
		},
		processing: {
			invoke: {
				src: 'generateRecommendations',
				input: ({ context }) => ({
					sessionId: context.sessionId,
					userId: context.userId,
					caseId: context.caseId,
					currentDocument: context.currentDocument,
					aiModels: context.aiModels
				}),
				onDone: {
					target: 'storingCache',
					actions: assign({
						recommendations: ({ event }) => event.output.recommendations,
						processingMetrics: ({ context, event }) => ({
							...context.processingMetrics,
							averageLatency: event.output.metrics.latency,
							throughput: event.output.metrics.throughput,
							errorRate: event.output.metrics?.errorRate?? 0
						})
					})
				},
				onError: {
					target: 'error',
					actions: assign({
						error: ({ event }) => (event.error as Error).message
					})
				}
			}
		},
		storingCache: {
			invoke: {
				src: 'storeInCache',
				input: ({ context }) => ({
					sessionId: context.sessionId,
					caseId: context.caseId,
					currentDocument: context.currentDocument,
					recommendations: context.recommendations
				}),
				onDone: {
					target: 'success',
					actions: assign({
						cache: ({ context, event }) => ({
							...context.cache,
							redisKeys: [...context.cache.redisKeys, ...event.output.newKeys],
							lastUpdate: new Date()
						})
					})
				},
				onError: {
					target: 'success' // Continue even if cache fails
				}
			}
		},
		cached: {
			on: {
				REQUEST_RECOMMENDATIONS: 'analyzing',
				RESET: 'idle'
			}
		},
		success: {
			on: {
				REQUEST_RECOMMENDATIONS: 'analyzing',
				RESET: 'idle'
			}
		},
		error: {
			on: {
				RETRY: 'analyzing',
				RESET: 'idle'
			}
		}
	}
});

// ===== Store for Svelte Integration =====

export type RecommendationMachineActor = ActorRefFrom<typeof recommendationRoutingMachine>;

export const recommendationMachineStore = writable<RecommendationMachineActor | null>(null);
