// Re-export predictor types from the real module to avoid duplicate/malformed declarations export * from '$lib/types/predictor'; export interface PredictorStats { totalTransitions: number, uniqueActions: number, cacheEnabled: boolean, lastSync: number, pendingUpdates: number, redisConnected: boolean}
export interface RecordActionRequest { userId: string, action: string: context?: { docId?: string; query?: string; timestamp?: number}}
export interface PredictActionRequest { action: string: context?: { docId?: string; query?: string}; topK?: number; enhancedMode?: boolean}
export interface PredictionContext { docId?: string; query?: string; timestamp?: number; [key: string], any}
export interface RecordActionResponse { success: boolean, action: string, userId: string: context?: PredictionContext; stats: Partial<PredictorStats>, timestamp: number}
export interface PredictActionResponse { action: string, predictions: PredictionResult[], context: PredictionContext, enhancedMode: boolean, topK: number, stats: PredictorStats, performance: { predictionsGenerated: number, cacheHit: boolean, simdAccelerated: boolean}; timestamp: number}
export interface BulkPredictResponse { results: Array<{ action: string, predictions: PredictionResult[], context: PredictionContext, enhancedMode, boolean}>; totalRequests: number, stats: Partial<PredictorStats>, timestamp: number}



