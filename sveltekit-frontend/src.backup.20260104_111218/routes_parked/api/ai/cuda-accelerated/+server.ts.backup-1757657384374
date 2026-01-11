// Enhanced CUDA-Accelerated Legal AI API
// Bridges SvelteKit frontend with Go CUDA server for maximum performance

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CUDA_SERVER_URL = 'http://localhost:8085';
const CUDA_TIMEOUT = 30000; // 30 seconds for complex inference

interface CudaInferenceRequest {
	query: string;
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	enable_grpo?: boolean;
	legal_domain?: string;
	user_id?: string;
	session_id?: string;
	enable_streaming?: boolean;
	context_documents?: string[];
	metadata?: Record<string, any>;
}

interface CudaInferenceResponse {
	success: boolean;
	response?: string;
	thinking_content?: string;
	confidence?: number;
	processing_time_ms: number;
	tokens_per_second: number;
	gpu_metrics?: {
		gpu_utilization: number;
		memory_utilization: number;
		temperature: number;
		active_streams: number;
		vram_used_mb: number;
		vram_total_mb: number;
	};
	grpo?: {
		structured_reasoning: Record<string, any>;
		reasoning_steps: string[];
		temporal_score: number;
		recommendations: Array<{
			id: string;
			score: number;
			confidence: number;
			snippet: string;
		}>;
	};
	error?: string;
	job_id?: string;
}

interface VectorSearchRequest {
	query_vector: number[];
	top_k?: number;
	threshold?: number;
	legal_domain?: string;
	include_metadata?: boolean;
}

interface BatchInferenceRequest {
	queries: CudaInferenceRequest[];
}

// Health check for CUDA server
async function checkCudaServerHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${CUDA_SERVER_URL}/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});
		
		if (!response.ok) return false;
		
		const health = await response.json();
		return health.status === 'healthy' && health.cuda_ready === true;
	} catch (error) {
		console.error('CUDA server health check failed:', error);
		return false;
	}
}

// POST endpoint for CUDA-accelerated inference
export const POST: RequestHandler = async ({ request }) => {
	try {
		const startTime = Date.now();
		const requestData: CudaInferenceRequest = await request.json();

		// Validate required fields
		if (!requestData.query?.trim()) {
			return json({
				success: false,
				error: 'Query is required',
				processing_time_ms: Date.now() - startTime
			}, { status: 400 });
		}

		// Check CUDA server health first
		const isHealthy = await checkCudaServerHealth();
		if (!isHealthy) {
			return json({
				success: false,
				error: 'CUDA server is not available',
				fallback_available: true,
				processing_time_ms: Date.now() - startTime
			}, { status: 503 });
		}

		// Prepare CUDA inference request
		const cudaRequest = {
			query: requestData.query.trim(),
			max_tokens: requestData.max_tokens || 2048,
			temperature: requestData.temperature ?? 0.7,
			top_p: requestData.top_p ?? 0.9,
			enable_grpo: requestData.enable_grpo ?? true,
			legal_domain: requestData.legal_domain || 'general',
			user_id: requestData.user_id,
			session_id: requestData.session_id,
			context_documents: requestData.context_documents || [],
			metadata: {
				...requestData.metadata,
				sveltekit_frontend: true,
				request_timestamp: new Date().toISOString(),
				client_type: 'web',
				performance_target: 'rtx_3060_ti'
			}
		};

		// Make request to CUDA server
		const cudaResponse = await fetch(`${CUDA_SERVER_URL}/api/legal/inference`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'SvelteKit-Legal-AI/1.0',
				'X-Request-ID': requestData.session_id || `req_${Date.now()}`
			},
			body: JSON.stringify(cudaRequest),
			signal: AbortSignal.timeout(CUDA_TIMEOUT)
		});

		if (!cudaResponse.ok) {
			const errorText = await cudaResponse.text();
			throw new Error(`CUDA server error ${cudaResponse.status}: ${errorText}`);
		}

		const result: CudaInferenceResponse = await cudaResponse.json();
		
		// Add frontend processing metrics
		const totalProcessingTime = Date.now() - startTime;
		
		const response = {
			...result,
			frontend_processing_ms: totalProcessingTime - (result.processing_time_ms || 0),
			total_processing_ms: totalProcessingTime,
			cuda_acceleration: true,
			performance_metrics: {
				gpu_optimized: true,
				target_achieved: result.tokens_per_second >= 50,
				memory_efficient: result.gpu_metrics?.memory_utilization < 0.9,
				temperature_safe: result.gpu_metrics?.temperature < 80
			}
		};

		return json(response);

	} catch (error: any) {
		const processingTime = Date.now() - performance.now();
		
		console.error('CUDA-accelerated inference failed:', error);
		
		return json({
			success: false,
			error: 'CUDA inference failed',
			details: error.message,
			cuda_acceleration: false,
			processing_time_ms: processingTime,
			fallback_required: true
		}, { status: 500 });
	}
};

// GET endpoint for CUDA server status and metrics
export const GET: RequestHandler = async ({ url }) => {
	try {
		const operation = url.searchParams.get('operation') || 'status';
		
		switch (operation) {
			case 'status':
				const healthResponse = await fetch(`${CUDA_SERVER_URL}/health`);
				const healthData = await healthResponse.json();
				
				return json({
					success: true,
					cuda_server: {
						available: healthResponse.ok,
						...healthData
					},
					endpoints: {
						inference: `${CUDA_SERVER_URL}/api/legal/inference`,
						vector_search: `${CUDA_SERVER_URL}/api/legal/vector-search`,
						stream: `${CUDA_SERVER_URL}/api/legal/stream`,
						batch: `${CUDA_SERVER_URL}/api/legal/batch`
					}
				});

			case 'metrics':
				const metricsResponse = await fetch(`${CUDA_SERVER_URL}/metrics`);
				const metricsData = await metricsResponse.json();
				
				return json({
					success: true,
					...metricsData,
					rtx_3060_ti_optimization: {
						vram_total_gb: 8,
						cuda_cores: 4608,
						compute_capability: '8.6',
						memory_bandwidth: '448 GB/s'
					}
				});

			case 'gpu-status':
				const gpuResponse = await fetch(`${CUDA_SERVER_URL}/api/gpu/status`);
				const gpuData = await gpuResponse.json();
				
				return json({
					success: true,
					...gpuData
				});

			default:
				return json({
					success: true,
					message: 'CUDA-accelerated Legal AI API',
					available_operations: ['status', 'metrics', 'gpu-status'],
					cuda_server_url: CUDA_SERVER_URL,
					performance_targets: {
						tokens_per_second: 50,
						max_inference_time_ms: 2000,
						memory_efficiency: 0.85
					}
				});
		}

	} catch (error: any) {
		console.error('CUDA status check failed:', error);
		
		return json({
			success: false,
			error: 'Failed to get CUDA server status',
			details: error.message,
			cuda_available: false
		}, { status: 503 });
	}
};

// PATCH endpoint for vector search
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const searchRequest: VectorSearchRequest = await request.json();

		if (!searchRequest.query_vector || !Array.isArray(searchRequest.query_vector)) {
			return json({
				success: false,
				error: 'query_vector array is required'
			}, { status: 400 });
		}

		if (searchRequest.query_vector.length !== 768) {
			return json({
				success: false,
				error: 'query_vector must be 768-dimensional for compatibility with nomic-embed-text'
			}, { status: 400 });
		}

		const vectorSearchRequest = {
			query_vector: searchRequest.query_vector,
			top_k: searchRequest.top_k || 10,
			threshold: searchRequest.threshold || 0.5,
			legal_domain: searchRequest.legal_domain || 'general',
			include_metadata: searchRequest.include_metadata ?? true
		};

		const response = await fetch(`${CUDA_SERVER_URL}/api/legal/vector-search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(vectorSearchRequest),
			signal: AbortSignal.timeout(15000) // Vector search timeout
		});

		if (!response.ok) {
			throw new Error(`Vector search failed: ${response.status}`);
		}

		const result = await response.json();
		
		return json({
			...result,
			cuda_accelerated: true,
			vector_dimensions: 768,
			search_algorithm: 'cuda_optimized_cosine_similarity'
		});

	} catch (error: any) {
		return json({
			success: false,
			error: 'CUDA vector search failed',
			details: error.message
		}, { status: 500 });
	}
};

// PUT endpoint for batch inference
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const batchRequest: BatchInferenceRequest = await request.json();

		if (!batchRequest.queries || !Array.isArray(batchRequest.queries)) {
			return json({
				success: false,
				error: 'queries array is required'
			}, { status: 400 });
		}

		if (batchRequest.queries.length > 16) {
			return json({
				success: false,
				error: 'Maximum batch size is 16 queries for RTX 3060 Ti optimization'
			}, { status: 400 });
		}

		// Convert to CUDA server format
		const cudaBatchRequest = batchRequest.queries.map(query => ({
			query: query.query,
			max_tokens: query.max_tokens || 2048,
			temperature: query.temperature ?? 0.7,
			top_p: query.top_p ?? 0.9,
			enable_grpo: query.enable_grpo ?? true,
			legal_domain: query.legal_domain || 'general',
			user_id: query.user_id,
			session_id: query.session_id,
			metadata: {
				...query.metadata,
				batch_processing: true,
				rtx_3060_ti_optimized: true
			}
		}));

		const response = await fetch(`${CUDA_SERVER_URL}/api/legal/batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(cudaBatchRequest),
			signal: AbortSignal.timeout(60000) // Extended timeout for batch
		});

		if (!response.ok) {
			throw new Error(`Batch inference failed: ${response.status}`);
		}

		const result = await response.json();
		
		return json({
			...result,
			cuda_batch_processing: true,
			parallel_streams: 8,
			rtx_3060_ti_optimized: true
		});

	} catch (error: any) {
		return json({
			success: false,
			error: 'CUDA batch inference failed',
			details: error.message
		}, { status: 500 });
	}
};

// DELETE endpoint for cleanup and memory optimization
export const DELETE: RequestHandler = async () => {
	try {
		const response = await fetch(`${CUDA_SERVER_URL}/api/gpu/optimize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ force_cleanup: true })
		});

		if (!response.ok) {
			throw new Error(`Memory optimization failed: ${response.status}`);
		}

		const result = await response.json();
		
		return json({
			...result,
			message: 'GPU memory optimization completed',
			rtx_3060_ti_memory: '8GB VRAM optimized'
		});

	} catch (error: any) {
		return json({
			success: false,
			error: 'Memory optimization failed',
			details: error.message
		}, { status: 500 });
	}
};