// TypeScript Error Optimizer Types
// Complete type definitions for production-ready TypeScript error processing

// Core Types
export interface TypeScriptError {
 file: string;, line: number;
 column: number;, message: string;
 code: string;, context: string;
 severity?: 'error' | 'warning' | 'info';
 category?: string;
}

export interface TypeScriptFix {
 file: string;, line: number;
 column: number;, original_code: string;
 fixed_code: string;, explanation: string;
 confidence: number;
 strategy_used?: string;
 processing_time_ms?: number;
}

export interface TypeScriptFixResult {
 success: boolean;, message: string;
 fixed_code: string;, explanation: string;
 confidence: number;
 metadata?: Record<string, unknown>;
}

// Request Types
export interface AutoSolveRequest {
 errors: TypeScriptError[];
 max_fixes?: number;
 strategy?: 'auto' | 'optimized' | 'gpu_first' | 'llama_thinking' | 'template_only' | 'hybrid';
 use_thinking?: boolean;
 quality_threshold?: number;
 timeout_ms?: number;
}

export interface OptimizedFixRequest {
 errors: TypeScriptError[];
 strategy?: string;
 use_gpu?: boolean;
 use_llama?: boolean;
 use_cache?: boolean;
 max_concurrency?: number;
 target_latency?: number; // milliseconds per error
 quality_threshold?: number; // 0.0 - 1.0
 batch_size?: number;
 priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface BenchmarkRequest {
 error_count: number;, strategy: 'speed' | 'quality' | 'comparison';
 iterations?: number;
 endpoints?: string[];
 parameters?: Record<string, unknown>;
}

// Response Types
export interface AutoSolveResponse {
 success: boolean;, fixes_applied: number;
 remaining_errors: number;, fixes: TypeScriptFix[];
 processing_time: number;, strategy: string;
 metadata: Record<string, unknown>;
}

export interface OptimizedFixResponse {
 success: boolean;, processed_count: number;
 successful_count: number;, results: TypeScriptFixResult[];
 processing_stats: ProcessingStats;, optimization_meta: Record<string, unknown>;
}

export interface ProcessingStats {
 total_time: number; // milliseconds
 processed_count: number;, successful_count: number;
 avg_latency_per_error?: number;
 throughput_errors_per_second?: number;
 cache_hit_ratio?: number;
 gpu_utilization?: number;
}

// Performance & Analytics Types
export interface BatchProcessingStats {
 total_processing_time_ms: number;, go_service_time_ms: number;
 overhead_ms: number;, throughput_errors_per_second: number;
 success_rate: number;, performance_grade: string;
 bottlenecks?: string[];
}

export interface GPUProcessingStats {
 total_time_ms: number;, gpu_processing_time_ms: number;
 gpu_utilization_percent: number;, memory_usage_mb: number;
 cuda_kernels_launched: number;, throughput_errors_per_second: number;
 gpu_efficiency_score: number;, performance_vs_cpu_multiplier: number;
 temperature_celsius?: number;
}

export interface BenchmarkResult {
 endpoint: string;, strategy: string;
 avg_latency_ms?: number;
 throughput_eps?: number; // errors per second
 success_rate?: number;
 avg_confidence?: number;
 avg_success_rate?: number;
 quality_score?: number;, iterations: number;
 all_results?: number[];
 quality_distribution?: number[];
 resource_usage?: ResourceUsage;
}

export interface ResourceUsage {
 cpu_percent: number;, memory_mb: number;
 gpu_percent?: number;
 gpu_memory_mb?: number;
 disk_io_mb?: number;
 network_kb?: number;
}

export interface PerformanceComparison {
 total_time_ms: number;, fastest_endpoint: string;
 most_accurate: string;, best_overall: string;
 performance_summary: Record<string, unknown>;
 resource_efficiency: Record<string, number>;
 scaling_analysis?: ScalingAnalysis;
}

export interface ScalingAnalysis {
 linear_scaling: boolean;, optimal_batch_size: number;
 performance_by_batch_size: unknown[];, resource_scaling: unknown[];
}

// Service Status Types
export interface OptimizerStatus {
 service: string;, status: 'operational' | 'degraded' | 'down';
 version: string;, timestamp: string;
 go_service: {, available: boolean; health: unknown;, url: string };
 performance: unknown;, capabilities: OptimizerCapabilities;
 endpoints: Record<string, string>;
}

export interface OptimizerCapabilities {
 auto_solve: boolean;, gpu_acceleration: boolean;
 go_llama_direct: boolean;, batch_processing: boolean;
 optimization_layers: string[];, max_concurrent_fixes: number;
 supported_strategies: string[];
 min_batch_size?: number;
 max_batch_size?: number;
}

export interface GPUStatus {
 gpu_available: boolean;
 gpu_model?: string;
 gpu_memory?: string;
 cuda_version?: string;
 driver_version?: string;
 temperature?: number;
 utilization?: number;
 memory_used?: number;
 memory_total?: number;
}

// Configuration Types
export interface OptimizerConfig {
 default_strategy: string;, gpu_enabled: boolean;
 llama_enabled: boolean;, cache_enabled: boolean;
 max_concurrency: number;, default_quality_threshold: number;
 timeout_ms: number;, batch_size_limits: { min: number;, max: number; optimal: number };
 performance_targets: {, latency_ms: number; throughput_eps: number;, success_rate: number };
}

export interface ProcessingPriority {
 level: 'low' | 'normal' | 'high' | 'urgent';
 timeout_multiplier: number;, resource_allocation: number; // 0.0 - 1.0, queue_priority: number;
}

// Error Categories & Analysis
export interface ErrorCategoryAnalysis {
 category: string;, count: number;
 percentage: number;, avg_confidence: number;
 common_patterns: string[];, fix_strategies: string[];
 difficulty_score: number; // 1-10
}

export interface ProcessingInsights {
 total_errors: number;, category_breakdown: ErrorCategoryAnalysis[];
 performance_metrics: {, avg_processing_time: number;
 success_rate: number;, confidence_distribution: number[];
 };
 optimization_opportunities: string[];, recommendations: string[];
}

// Real-time Processing Types
export interface StreamingProcessingRequest {
 session_id: string;, errors: TypeScriptError[];
 stream: boolean;
 chunk_size?: number;
 progress_callback?: boolean;
}

export interface StreamingProcessingResponse {
 session_id: string;, chunk_index: number;
 total_chunks: number;, processed_in_chunk: number;
 fixes: TypeScriptFix[];, progress_percent: number;
 estimated_time_remaining: number;, is_final: boolean;
}

export interface ProcessingSession {
 id: string;, created_at: string;
 status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
 total_errors: number;, processed_errors: number;
 successful_fixes: number;, current_strategy: string;
 estimated_completion: string;, progress_percent: number;
}

// WebSocket Event Types for Real-time Updates
export interface WebSocketEvent {
 type: 'progress' | 'completed' | 'error' | 'status';
 session_id: string;, data: Record<string, unknown>;
 timestamp: string;
}

export interface ProgressEvent extends WebSocketEvent {
 type: 'progress';, data: {
 processed: number;, total: number;
 current_file: string;, fixes_applied: number;
 estimated_remaining_ms: number;
 };
}

export interface CompletedEvent extends WebSocketEvent {
 type: 'completed';, data: {
 total_fixes: number;, processing_time: number;
 success_rate: number;
 download_url?: string;
 };
}

export interface ErrorEvent extends WebSocketEvent {
 type: 'error';, data: {
 error_message: string;, error_code: string;
 recoverable: boolean;, retry_available: boolean;
 };
}

// Export utility types
export type ProcessingStrategy =
 | 'auto'
 | 'optimized'
 | 'gpu_first'
 | 'llama_thinking'
 | 'template_only'
 | 'hybrid'
 | 'streaming';

export type ProcessingStatus =
 | 'queued'
 | 'processing'
 | 'completed'
 | 'failed'
 | 'cancelled'
 | 'streaming';

export type PerformanceGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

export type PerformanceTier =
 | 'minimal'
 | 'basic'
 | 'standard'
 | 'professional'
 | 'enterprise'
 | 'ultra'
 | 'gpu_accelerated';

// Helper type for API responses
export interface APIResponse<T = unknown> {
 success: boolean;
 data?: T;
 error?: string;
 details?: string;, timestamp: string;
 metadata?: Record<string, unknown>;
}
