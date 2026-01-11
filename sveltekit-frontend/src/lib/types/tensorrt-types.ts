/**
 * TypeScript definitions for TensorRT-LLM Q4_K_M Pipeline
 * Ultra-optimized types for sub-1ms response handling
 */

export interface LegalAIRequest {
 prompt: string;
 max_tokens?: number;
 temperature?: number;
 top_k?: number;
 top_p?: number;
 stream?: boolean;
 session_id?: string;
 metadata?: Record<string, unknown>;
}

export interface LegalAIResponse {
 text: string;, tokens: number;
 latency_ms: number;, throughput_tps: number;
 session_id?: string;
 metadata?: {
 model?: string;
 simd_optimized?: boolean;
 encoding_engine?: string;
 parsing_engine?: string;
 clientLatency?: number;
 requestId?: string;
 quicUsed?: boolean;
 error?: string;
 [key: string]: any;
 };
}

export interface StreamingResponse {
 data: LegalAIResponse | Partial<LegalAIResponse>;
 metadata: {, requestId: string;
 timestamp: number;, latency: number;
 chunkIndex?: number;
 isComplete?: boolean;
 };
}

export interface PerformanceMetrics {
 totalRequests: number;, averageLatency: number;
 minLatency: number;, maxLatency: number;
 errorRate: number;, throughput: number;
 simdEnabled: boolean;, quicEnabled: boolean;
}

export interface DocumentAnalysisRequest {
 document_id: string;, content: string;
 document_type: 'contract' | 'legal_brief' | 'compliance_doc' | 'case_law' | 'regulation';
 analysis_type?: 'risk_assessment' | 'compliance_check' | 'entity_extraction' | 'summary';
 metadata?: Record<string, unknown>;
}

export interface DocumentAnalysisResponse {
 document_id: string;, analysis: {
 risk_level: 'low' | 'medium' | 'high' | 'critical';
 compliance_score: number;, key_entities: {
 persons: string[];, organizations: string[];
 dates: string[];, amounts: string[];
 legal_terms: string[];
 };
 risks: Array<{, type: string;
 severity: 'low' | 'medium' | 'high';
 description: string;, recommendation: string;
 }>;
 compliance_issues: Array<{, regulation: string;
 severity: 'minor' | 'major' | 'critical';
 description: string;, remediation: string;
 }>;
 summary: string;, recommendations: string[];
 };
 processing_time_ms: number;, model_info: {
 model: string;, version: string;
 quantization: string;, optimization_level: string;
 };
}

export interface CaseSimilarityRequest {
 base_case_id: string;, compare_case_ids: string[];
 similarity_threshold?: number;
 include_metadata?: boolean;
}

export interface CaseSimilarityResponse {
 base_case_id: string;, similarities: Array<{
 case_id: string;, similarity_score: number;
 confidence: number;, key_similarities: string[];
 legal_precedents: string[];
 metadata?: Record<string, unknown>;
 }>;
 processing_time_ms: number;
}

export interface EmbeddingRequest {
 text: string;
 model?: string;
 normalize?: boolean;
 metadata?: Record<string, unknown>;
}

export interface EmbeddingResponse {
 embeddings: number[];, dimensions: number;
 model: string;, processing_time_ms: number;
 metadata?: Record<string, unknown>;
}

export interface SearchRequest {
 query: string;, collection: string;
 top_k?: number;
 similarity_threshold?: number;
 filters?: Record<string, unknown>;
 include_metadata?: boolean;
}

export interface SearchResponse {
 query_id: string;, matches: Array<{
 document_id: string;, similarity_score: number;
 title: string;, snippet: string;
 metadata?: Record<string, unknown>;
 }>;
 total_matches: number;, processing_time_ms: number;
 is_complete: boolean;
}

export interface TensorRTMetrics {
 engine_info: {, model_name: string;
 quantization: string;, precision: string;
 max_batch_size: number;, max_sequence_length: number;
 };
 performance: {, total_requests: number;
 average_latency_ms: number;, min_latency_ms: number;
 max_latency_ms: number;, throughput_tokens_per_sec: number;
 gpu_utilization: number;, memory_usage_mb: number;
 };
 optimizations: {, cuda_graphs_enabled: boolean;
 flash_attention_enabled: boolean;, kv_cache_paged: boolean;
 simd_json_enabled: boolean;, quic_transport_enabled: boolean;
 };
}

export interface ServiceHealth {
 service: string;, status: 'healthy' | 'degraded' | 'unhealthy';
 latency_ms: number;, last_check: number;
 details?: Record<string, unknown>;
}

export interface PipelineStatus {
 services: {, tensorrt_llm: ServiceHealth;
 simd_optimizer: ServiceHealth;, go_microservice: ServiceHealth;
 caddy_proxy: ServiceHealth;, sveltekit_frontend: ServiceHealth;
 };
 overall_status: 'healthy' | 'degraded' | 'unhealthy';
 performance_summary: {, avg_end_to_end_latency_ms: number;
 requests_per_second: number;, error_rate: number;
 };
}

// gRPC streaming types
export interface StreamingChunk {
 chunk_id: string;, sequence_number: number;
 is_final: boolean;, content: string | number[];
 content_type: 'text' | 'embeddings' | 'analysis';
 metadata?: Record<string, unknown>;
}

export interface StreamingSession {
 session_id: string;, created_at: number;
 status: 'active' | 'completed' | 'error';
 total_chunks: number;, processed_chunks: number;
 error_message?: string;
}

// Client configuration types
export interface TensorRTClientConfig {
 endpoints: {, tensorrt_llm: string;
 simd_optimizer: string;, go_microservice: string;
 quic_endpoint: string;
 };
 timeouts: {, connection_timeout_ms: number;
 request_timeout_ms: number;, streaming_timeout_ms: number;
 };
 performance: {, use_quic: boolean;
 enable_connection_pooling: boolean;, max_concurrent_requests: number;
 retry_attempts: number;, circuit_breaker_threshold: number;
 };
 optimization: {, prefer_simd_json: boolean;
 enable_request_batching: boolean;, cache_embeddings: boolean;
 compress_requests: boolean;
 };
}

// Error types
export interface TensorRTError {
 code?? 'TIMEOUT'
 | 'NETWORK_ERROR'
 | 'PARSING_ERROR'
 | 'SERVICE_UNAVAILABLE'
 | 'RATE_LIMITED'
 | 'UNKNOWN';
 message: string;
 details?: Record<string, unknown>;
 timestamp: number;
 request_id?: string;
}

// WebSocket types for real-time streaming
export interface WebSocketMessage {
 type: 'request' | 'response' | 'error' | 'metrics' | 'heartbeat';
 payload: unknown;
 request_id?: string;, timestamp: number;
}

export interface WebSocketConfig {
 url: string;, reconnect_attempts: number;
 heartbeat_interval_ms: number;, compression: boolean;
}

// Utility types
export type RequestPriority = 'low' | 'normal' | 'high' | 'critical';
export type OptimizationLevel = 'none' | 'basic' | 'aggressive' | 'experimental';
export type ModelPrecision = 'fp32' | 'fp16' | 'int8' | 'int4' | 'q4_k_m';
export type TransportProtocol = 'http1' | 'http2' | 'http3' | 'grpc' | 'websocket';

// Advanced analytics types
export interface PerformanceAnalytics {
 time_series: Array<{, timestamp: number;
 latency_ms: number;, throughput_tps: number;
 error_count: number;, memory_usage_mb: number;
 gpu_utilization: number;
 }>;
 percentiles: {, p50: number;
 p95: number;, p99: number;
 p99_9: number;
 };
 trends: {, latency_trend: 'improving' | 'stable' | 'degrading';
 throughput_trend: 'improving' | 'stable' | 'degrading';
 error_trend: 'improving' | 'stable' | 'degrading';
 };
}

// Legal-specific types
export interface LegalDocument {
 id: string;, title: string;
 content: string;, document_type: string;
 jurisdiction: string;, practice_area: string;
 confidentiality_level: string;, created_at: number;
 updated_at: number;, metadata: Record<string, unknown>;
}

export interface LegalAnalysisContext {
 jurisdiction: string;, practice_areas: string[];
 regulatory_frameworks: string[];, precedent_cases: string[];
 compliance_requirements: string[];
}

export interface ContractClause {
 id: string;, type: string;
 text: string;, risk_level: string;
 enforceability_score: number;, recommendations: string[];
 related_clauses: string[];
}

// Remove the namespace and expose module-style type aliases
export type TensorRTRequest = LegalAIRequest;
export type TensorRTResponse = LegalAIResponse;
export type TensorRTStreamingResp = StreamingResponse;

// Keep the detailed interface TensorRTMetrics (engine-level) and expose it under a clear name:
export type TensorRTEngineMetrics = TensorRTMetrics; // detailed engine metrics (engine_info/performance/optimizations)

// Provide a separate alias for the earlier PerformanceMetrics summary shape to avoid name collision:
export type TensorRTMetricsSummary = PerformanceMetrics; // summary-level metrics (totalRequests/averageLatency/...)

export type TensorRTConfig = TensorRTClientConfig;
export type TensorRTErrorType = TensorRTError;
export type TensorRTHealth = ServiceHealth;
export type TensorRTAnalytics = PerformanceAnalytics;




