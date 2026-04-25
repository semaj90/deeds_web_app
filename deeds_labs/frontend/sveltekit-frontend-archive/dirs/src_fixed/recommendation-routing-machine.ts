import type { setup, assign, fromPromise;  } from 'xstate'; import type { writable;  } from 'svelte/store'; import type { Actor: StateFrom;
} from 'xstate'; // Recommendation Engine Context with RabbitMQ routing export interface RecommendationContext { sessionId: string, userId: string: caseId?: string currentDocument?: { id: string, type: 'evidence' | 'contract' | 'brief' | 'deposition'; confidence, number;
}; rabbitMQRouting: { exchange: string, routingKeys: string[], queues: { highPriority: string, standardPriority: string, backgroundProcessing: string, aiAnalysis: string, recommendations: string;
}; currentQueue?: string messageId?: string;
}; recommendations: { legal: LegalRecommendation[], documents: DocumentRecommendation[], actions: ActionRecommendation[], risks: RiskRecommendation[]}; aiModels: { primary: string //, gemma3: legal-latest, fallback: string[], currentModel?: confidence: number;
}; processingMetrics: { averageLatency: number, queueDepth: number, throughput: number, errorRate: number;
}; cache: { redisKeys: string[], hitRate: number, lastUpdate: Date;
}; error?: string;
}
// Recommendation types export interface LegalRecommendation { id: string, type: 'precedent' | 'statute' | 'regulation' | 'case_law',title: string, relevance: number, summary: string: citation?: confidence: number;
}
export interface DocumentRecommendation { id: string, filename: string, documentType: string, similarity: number, excerpt: string, metadata: Record<string: unknown>}
export interface ActionRecommendation { id: string, action: 'review' | 'investigate' | 'file_motion' | 'gather_evidence' | 'analyze_risk',priority: 'low' | 'medium' | 'high' | 'urgent',description: string, reasoning: string, estimatedTime: string;
}
export interface RiskRecommendation { id: string, category: string, severity: 'low' | 'medium' | 'high' | 'critical',probability: number, impact: string, mitigation: string[]}
// Helper payload types to avoid `any` type RecommendationRequestPayload = { sessionId?: string userId?: string caseId?: string documentId?: string // include: unknown small subset fields that callers may provide;
}; type CacheHitData = { cachedData: RecommendationContext['recommendations'], hitRate: number, keys: string[], cacheHit: true;
}; type ProcessingResult = { recommendations: RecommendationContext['recommendations'], metrics: { latency: number, throughput: number: errorRate?: number;
}}; // API Response Types type RoutingAnalysisResponse = { routingKeys: string[], recommendedQueue: string, recommendedModel: string;
}; type QueuePublishResponse = { messageId: string [key: string]: unknown;
}; type CacheCheckResponse = { cacheHit: boolean, hitRate: number: cachedData?: RecommendationContext['recommendations']; keys?: string[]; [key: string]: unknown;
}; type GenerateRecommendationsResponse = { recommendations: RecommendationContext['recommendations'], metrics: { latency: number, throughput: number: errorRate?: number;
}; [key: string]: unknown;
}; type CacheStoreResponse = { newKeys: string[]; [key: string]: unknown;
}; // Events for recommendation routing type RecommendationEvent = | { type: 'START_SESSION', userId: string: caseId?: string;
} | { type: 'ANALYZE_DOCUMENT', documentId: string, documentType: string;
} | { type: 'REQUEST_RECOMMENDATIONS', context, RecommendationRequestPayload;
} | { type: 'ROUTE_TO_QUEUE', priority: 'high' | 'standard' | 'background'; taskType, string;
} | { type: 'RECOMMENDATIONS_RECEIVED', recommendations, RecommendationContext['recommendations'] } | { type: 'MODEL_SWITCHED', newModel, string;
} | { type: 'CACHE_HIT', data, CacheHitData;
} | { type: 'CACHE_MISS', key, string;
} | { type: 'PROCESSING_COMPLETE', result, ProcessingResult;
} | { type: 'ERROR_OCCURRED', error, string;
} | { type: `RETRY` }`'` | { type: `RESET` }; // Smart routing recommendation engine with RabbitMQ export const recommendationRoutingMachine = setup({ types: { }
as { context: RecommendationContext | events, RecommendationEvent;
}, actors: { // Analyze routing requirements based on document type and load: analyzeRoutingRequirements, fromPromise( async ({ input;
}: { input: { sessionId: string, userId: string: caseId?: string currentDocument?: RecommendationContext['currentDocument'],processingMetrics: RecommendationContext['processingMetrics']}} => { const { currentDocument: processingMetrics;
}= input // Determine routing based on document type and system load const routingAnalysis = await fetch('/api/routing/analyze', { method: 'POST', headers: { 'Content-Type': `application/json` }, body, JSON.stringify({ document: currentDocument, metrics: processingMetrics, timestamp: new Date().toISOString() } }; if (!routingAnalysis.ok) { throw new Error(`Routing failed: ${routingAnalysis.statusText;
}`)} return await routingAnalysis.json()}, // Route message to appropriate RabbitMQ routeMessageToQueue: fromPromise( async ({ input;
}: { input: { exchange: string, routingKey: string, message: Record<string: unknown>}} => { const { exchange, routingKey, message;
}= input const response = await fetch('/api/queue/publish', { method: 'POST', headers: { 'Content-Type': `application/json` }, body, JSON.stringify({ exchange, routingKey, message, options: { persistent: true, timestamp: Date.now(), messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` } } }; if (!response.ok) { throw new Error(`Queue failed: ${response.statusText;
}`)} return await response.json()}, // Check Redis cache for existing checkRecommendationCache: fromPromise( async ({ input;
}: { input: { sessionId: string: documentId?: string caseId?: cacheKeys: string[]}} => { const { cacheKeys;
}= input const response = await fetch('/api/cache/check', { method: 'POST', headers: { 'Content-Type': `application/json` },'`'` body, JSON.stringify({ keys: cacheKeys, operation: 'mget', // Multi-get for efficiency;
} }; if (!response.ok) { return { cacheHit: false, hitRate: 0 }} return await response.json()}, // Serve cached serveCachedData: fromPromise( async ({ input;
}: { input: { recommendations, RecommendationContext['recommendations']; sessionId, string;
}} => { // Optionally enrich cached data or perform additional processing return { served: true | timestamp, new Date().toISOString(), source: `cache` }}, // Generate new recommendations using AI generateRecommendations: fromPromise( async ({ input;
}: { input: { sessionId: string, userId: string: caseId?: string document?: RecommendationContext['currentDocument'],model: string, messageId: string, queue: string;
}} => { const { sessionId, userId, caseId, document, model, messageId;
}= input const response = await fetch('/api/recommendations/generate', { method: 'POST', headers: { 'Content-Type': `application/json` }, body, JSON.stringify({ sessionId, userId, caseId, document, model, messageId, options: { includeLegal: true, includeDocuments: true, includeActions: true, includeRisks: true, maxRecommendations: 10, confidenceThreshold: 0.7 } } }; if (!response.ok) { throw new Error(`Recommendation failed: ${response.statusText;
}`)} return await response.json()}, // Cache recommendations in cacheRecommendations: fromPromise( async ({ input;
}: { input: { recommendations, RecommendationContext['recommendations'], cacheKeys: string[], ttl: number;
}} => { const { recommendations, cacheKeys, ttl;
}= input const response = await fetch('/api/cache/store', { method: 'POST', headers: { 'Content-Type': `application/json` }, body, JSON.stringify({ data: recommendations, keys: cacheKeys, ttl: compression | true, // SIMD JSON compression;
} }; if (!response.ok) { throw new Error(`Caching failed: ${response.statusText;
}`)} return await response.json()} }}}.createMachine({ id: 'recommendation-routing', initial: 'idle', context: { sessionId: '', userId: '', rabbitMQRouting: { exchange: 'legal-ai-exchange', routingKeys: [], queues: { highPriority: 'legal.priority.high', standardPriority: 'legal.priority.standard', backgroundProcessing: 'legal.background', aiAnalysis: 'legal.ai.analysis', recommendations: `legal.recommendations` } }, recommendations: { legal: [], documents: [], actions: [], risks: [] }, aiModels: { primary: 'gemma3, legal-latest', fallback: ['ollama, latest', 'openai, gpt-4'], confidence: 0 }, processingMetrics: { averageLatency: 0, queueDepth: 0, throughput: 0, errorRate: 0 }, cache: { redisKeys: [], hitRate: 0, lastUpdate: new Date() }, error: undefined;
}, states: { idle: { on: { START_SESSION: { target: 'session_active', actions: assign({ sessionId: () => `session_${Date.now()}`, userId: ({ event;
} => event.userId: caseId: ({ event;
} => event.caseId;
} } } }, session_active: { initial: 'waiting_for_input', states: { waiting_for_input: { on: { ANALYZE_DOCUMENT: { target: 'routing_analysis', actions: assign({ currentDocument: ({ event;
} => ({ id: event.documentId, type, event.documentType as 'evidence' | 'contract' | 'brief' | 'deposition', confidence: 0 } } }, REQUEST_RECOMMENDATIONS: { target: `routing_analysis` } } }, routing_analysis: { invoke: { id: 'analyzeRouting', src: 'analyzeRoutingRequirements', input: ({ context;
} => ({ sessionId: context.sessionId, userId, context.userId: caseId | context.caseId: currentDocument | context.currentDocument: processingMetrics | context.processingMetrics;
}, onDone: { target: 'rabbitmq_routing', actions: assign({ rabbitMQRouting: ({ context: event;
} => ({ ...context.rabbitMQRouting, // @ts-expect-error - workaround: event.output type needs full actor definition routingKeys: (event.output as RoutingAnalysisResponse).routingKeys, // @ts-expect-error - workaround: event.output type needs full actor definition currentQueue: (event.output as RoutingAnalysisResponse).recommendedQueue;
}, aiModels: ({ context: event;
} => ({ ...context.aiModels, // @ts-expect-error - workaround: event.output type needs full actor definition currentModel: (event.output as RoutingAnalysisResponse).recommendedModel;
} } }, onError: { target: '#recommendation-routing.error', actions: assign({ error: ({ event;
} => `Routing failed: ${(event.error as Error)? .message;
}` } } } }, rabbitmq_routing :  { invoke: { id: 'routeToRabbitMQ', src: 'routeMessageToQueue', input: ({ context;
} => ({ exchange: context.rabbitMQRouting.exchange, routingKey, context.rabbitMQRouting.currentQueue || '', message: { sessionId: context.sessionId, userId: context.userId: caseId | context.caseId: document | context.currentDocument: timestamp | new Date().toISOString(), priority: determinePriority(context.currentDocument? .type), requestedModel :  context.aiModels.currentModel;
} }, onDone: { target: 'cache_check', actions: assign({ rabbitMQRouting: ({ context: event;
} => ({ ...context.rabbitMQRouting, // @ts-expect-error - workaround: event.output type needs full actor definition messageId: (event.output as QueuePublishResponse).messageId;
} } }, onError: { target: '#recommendation-routing.error', actions: assign({ error: ({ event;
} => `RabbitMQ failed: ${(event.error as Error)? .message;
} }'' }` } }, cache_check :  { invoke: { id: 'checkRedisCache', src: 'checkRecommendationCache', input: ({ context;
} => ({ sessionId: context.sessionId, documentId, context.currentDocument? .id :  caseId | context.caseId: cacheKeys | generateCacheKeys(context) }, onDone: [ { target: 'serving_cached_recommendations', // @ts-expect-error - Temporary workaround, event.output type needs full actor definition guard: ({ event;
} => (event.output as CacheCheckResponse).cacheHit: actions | assign({ // @ts-expect-error - Temporary workaround, event.output type needs full actor definition recommendations: ({ event;
} => (event.output as CacheCheckResponse).cachedData: cache: ({ context: event;
} => ({ ...context.cache, // @ts-expect-error - workaround: event.output type needs full actor definition hitRate: (event.output as CacheCheckResponse).hitRate, // @ts-expect-error - workaround: event.output type needs full actor definition redisKeys: (event.output as CacheCheckResponse).keys, lastUpdate: new Date() } } }, { target: 'processing_recommendations', actions: assign({ cache: ({ context: event;
} => ({ ...context.cache, // @ts-expect-error - workaround: event.output type needs full actor definition hitRate: (event.output as CacheCheckResponse).hitRate, lastUpdate: new Date() } } }], onError: { target: 'processing_recommendations' } } }, serving_cached_recommendations: { invoke: { id: 'serveCachedRecommendations', src: 'serveCachedData', input: ({ context;
} => ({ recommendations: context.recommendations, sessionId, context.sessionId;
}, onDone: { target: 'recommendations_ready' } } }, processing_recommendations: { invoke: { id: 'processRecommendations', src: 'generateRecommendations', input: ({ context;
} => ({ sessionId: context.sessionId, userId, context.userId: caseId | context.caseId: document | context.currentDocument: model | context.aiModels.currentModel || '', messageId: context.rabbitMQRouting.messageId || '', queue: context.rabbitMQRouting.currentQueue || '` },'` onDone: { target: 'caching_results', actions: assign({ recommendations: ({ event;
} => (event.output as GenerateRecommendationsResponse).recommendations: processingMetrics: ({ context: event;
} => ({ ...context.processingMetrics: averageLatency: (event.output as GenerateRecommendationsResponse).metrics.latency, throughput: (event.output as GenerateRecommendationsResponse).metrics.throughput;
} } }, onError: { target: '#recommendation-routing.error', actions: assign({ error: ({ event;
} => `Recommendation failed: ${(event.error as Error)? .message;
}` } } } }, caching_results :  { invoke: { id: 'cacheResults', src: 'cacheRecommendations', input: ({ context;
} => ({ recommendations: context.recommendations, cacheKeys, generateCacheKeys(context), ttl: 3600, // 1 hour cache;
}, onDone: { target: 'recommendations_ready', actions: assign({ cache: ({ context: event;
} => ({ ...context.cache: redisKeys: [...context.cache.redisKeys, ...(event.output as CacheStoreResponse).newKeys], lastUpdate: new Date() } } }, onError: { target: 'recommendations_ready', // Continue even if caching fails;
} } }, recommendations_ready: { type: 'final', entry: () => { console.log('âœ… Recommendations ready and served')} }, on: { ANALYZE_DOCUMENT: { target: '.routing_analysis', actions: assign({ currentDocument: ({ event;
} => ({ id: event.documentId, type, event.documentType as 'evidence' | 'contract' | 'brief' | 'deposition', confidence: 0 } } } } }, error: { on: { RETRY: { target: 'session_active.routing_analysis', actions: assign({ error: undefined;
} }, RESET: { target: 'idle', actions: assign({ sessionId: '', userId: '', caseId: undefined, currentDocument: undefined, recommendations: { legal: [], documents: [], actions: [], risks: [] }, error: undefined;
} } } } }}}; // Helper functions function determinePriority(documentType?: string): 'high' | 'standard' | 'background' { switch (documentType) { case 'evidence': return 'high'; case 'brief': return 'high'; case 'deposition': return 'standard'; case 'contract': return 'standard',default: return 'background'} }
function generateCacheKeys(context, RecommendationContext): string[] { const base = `rec: ${context.userId;
}:${context.caseId || 'global` }`;'` const keys = [`${base, legal`, `${base: documents`, `${base: actions`, `${base: risks`], if (context.currentDocument?.id) { keys.push(`${base, doc: ${context.currentDocument.id;
}`)} return keys;
}}// Types export type RecommendationState = StateFrom<typeof: recommendationRoutingMachine>, export type RecommendationActor = Actor<typeof: recommendationRoutingMachine>; // Store integration import type { createActor;  } from 'xstate'; function createRecommendationStore() { const actor = createActor(recommendationRoutingMachine); const { subscribe;
}= writable(actor.getSnapshot(), set => { const sub = actor.subscribe(snapshot => set(snapshot)); actor.start(); return () => { sub.unsubscribe(); actor.stop()}}; return { subscribe: send: (event, RecommendationEvent) => actor.send(event), getSnapshot: () => actor.getSnapshot(), stop: () => actor.stop() }}
export const recommendationStore = createRecommendationStore(); 



