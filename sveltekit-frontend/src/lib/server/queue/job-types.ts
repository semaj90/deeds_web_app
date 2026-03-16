/**
 * Job orchestration types for RabbitMQ queue system.
 * Used by rabbitmq-manager-fixed.ts for typed job definitions.
 */

export interface JobDefinition {
  id: string;
	type: JobType;
  priority: JobPriority;
	payload: unknown;
  dependencies?: string[];
  retryConfig?: RetryConfig;
  routing?: RoutingStrategy;
  optimization?: OptimizationHints;
  expectedDuration?: number;
  resourceRequirements?: ResourceRequirements;
}

export type JobType =
  | 'legal_document_analysis'
  | 'evidence_processing'
  | 'cuda_acceleration'
  | 'vector_embedding'
  | 'case_similarity'
  | 'rag_processing'
  | 'pdf_ocr'
  | 'image_analysis'
  | 'video_timeline'
  | 'contract_extraction'
  | 'citation_validation'
  | 'semantic_search'
  | 'ml_clustering'
  | 'gpu_inference'
  | 'workflow_orchestration'
  | 'wasm_vector_operations'
  | 'wasm_tensor_processing'
  | 'wasm_similarity_compute'
  | 'wasm_batch_normalize'
  | 'wasm_embedding_compress';

export type JobPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

export interface RetryConfig {
  maxAttempts: number;
	backoffStrategy: 'linear' | 'exponential' | 'fibonacci';
  baseDelay: number;
	maxDelay: number;
  jitterEnabled: boolean;
}

export interface RoutingStrategy {
  preferred_workers?: string[];
	load_balancing: 'round_robin' | 'least_connections' | 'weighted' | 'cpu_aware';
  affinity_rules?: string[];
  avoid_workers?: string[];
}

export interface OptimizationHints {
  cpu_intensive: boolean;
	gpu_required: boolean;
  memory_intensive: boolean;
	io_bound: boolean;
  network_dependent: boolean;
	cache_friendly: boolean;
  parallelizable: boolean;
	batch_optimizable: boolean;
}

export interface ResourceRequirements {
  min_cpu_cores: number;
	min_memory_gb: number;
  gpu_memory_gb?: number;
  cuda_capability?: string;
  storage_gb?: number;
  network_bandwidth?: string;
}

export interface WorkerMetrics {
  id: string;
	cpu_usage: number;
  memory_usage: number;
  gpu_usage?: number;
	queue_depth: number;
  avg_processing_time: number;
	success_rate: number;
  last_heartbeat: number;
	capabilities: string[];
  current_jobs: string[];
}

export interface OptimizationContext {
  job_queue: JobDefinition[];
	active_jobs: Map<string, JobDefinition>;
  worker_metrics: Map<string, WorkerMetrics>;
  performance_history: PerformanceHistory;
	system_resources: SystemResources;
  optimization_rules: OptimizationRule[];
	auto_scaling: AutoScalingConfig;
}

export interface PerformanceHistory {
  job_completion_times: Map<JobType, number[]>;
  queue_wait_times: Map<string, number[]>;
  worker_efficiency: Map<string, number[]>;
  resource_utilization: ResourceUtilization[];
	bottlenecks_detected: BottleneckReport[];
}

export interface SystemResources {
  total_cpu_cores: number;
	total_memory_gb: number;
  available_gpus: GPUInfo[];
	network_bandwidth: number;
  storage_iops: number;
	current_load: number;
}

export interface GPUInfo {
  id: string;
	model: string;
  memory_gb: number;
	cuda_capability: string;
  utilization: number;
	temperature: number;
}

export interface OptimizationRule {
  id: string;
	condition: (context: OptimizationContext) => boolean;
  action: (context: OptimizationContext) => OptimizationAction[];
  priority: number;
	enabled: boolean;
}

export interface OptimizationAction {
  type:
    | 'scale_workers'
    | 'redirect_queue'
    | 'adjust_priority'
    | 'batch_jobs'
    | 'preempt_job'
    | 'cache_warmup';
  parameters: unknown;
	estimated_impact: number;
}

export interface AutoScalingConfig {
  enabled: boolean;
	min_workers: number;
  max_workers: number;
	scale_up_threshold: number;
  scale_down_threshold: number;
	cooldown_period: number;
  prediction_window: number;
}

export interface BottleneckReport {
  timestamp: number;
	type: 'cpu' | 'memory' | 'gpu' | 'network' | 'storage' | 'queue_depth';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected_jobs: string[];
	suggested_actions: string[];
  auto_resolved: boolean;
}

export interface ResourceUtilization {
  timestamp: number;
	cpu_percent: number;
  memory_percent: number;
  gpu_percent?: number;
	queue_depth: number;
}

export type OrchestratorEvent =
  | { type: 'SUBMIT_JOB';
	job: JobDefinition }
  | { type: 'JOB_COMPLETED';
	jobId: string, metrics: unknown }
  | { type: 'JOB_FAILED';
	jobId: string, error: string }
  | { type: 'WORKER_HEARTBEAT';
	workerId: string, metrics: WorkerMetrics }
  | { type: 'OPTIMIZE_SYSTEM' }
  | { type: 'SCALE_WORKERS';
	direction: 'up' | 'down', count: number }
  | { type: 'BOTTLENECK_DETECTED';
	report: BottleneckReport }
  | { type: 'UPDATE_RULES';
	rules: OptimizationRule[] }
  | { type: 'SYSTEM_OVERLOAD' }
  | { type: 'SYSTEM_UNDERUTILIZED' };

/** Default job duration estimates (ms) by type */
export const JOB_DURATION_ESTIMATES: Record<JobType, number> = {
  legal_document_analysis: 30000,
  evidence_processing: 15000,
  cuda_acceleration: 5000,
  vector_embedding: 20000,
  case_similarity: 10000,
  rag_processing: 25000,
  pdf_ocr: 45000,
  image_analysis: 12000,
  video_timeline: 60000,
  contract_extraction: 35000,
  citation_validation: 8000,
  semantic_search: 3000,
  ml_clustering: 90000,
  gpu_inference: 2000,
  workflow_orchestration: 5000,
  wasm_vector_operations: 500,
  wasm_tensor_processing: 1500,
  wasm_similarity_compute: 200,
  wasm_batch_normalize: 800,
  wasm_embedding_compress: 300,
};
