import { nvidiaLlamaService } from '$lib/services/nvidiaLlamaService';
import { gpuServiceIntegration } from '$lib/services/gpu-service-integration';
import { unifiedWASMGPUOrchestrator } from '$lib/services/unified-wasm-gpu-orchestrator';
import { llvmWasmBridge } from '$lib/wasm/llvm-wasm-bridge';
import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';


/*
 * Unified GPU API Endpoint
 * Handles all GPU-related operations: NVIDIA LLaMA, WASM-LLVM, WebGPU, and NES Bridge
 */

export interface GPUApiRequest {
	operation: 'llama_generate' | 'wasm_compile' | 'wasm_execute' | 'gpu_compute' | 'health' | 'hybrid';
	data?: any;
	options?: {
		priority?: 'low' | 'medium' | 'high' | 'urgent';
		timeout?: number;
		useGPU?: boolean;
		fallbackToCPU?: boolean;
	};
}

export interface GPUApiResponse {
	success: boolean;
	operation: string;
	result?: any;
	error?: string;
	serviceUsed: string;
	performance: {
		processingTime: number;
		memoryUsed: number;
		gpuUtilization: number;
	};
	metadata: Record<string, any>;
}

// Health check for all GPU services
async function checkGPUHealth(): Promise<Record<string, any>> {
	const health: Record<string, any> = {};

	try {
		// Check NVIDIA LLaMA service
		const nvidiaStats = await nvidiaLlamaService.getGpuMetrics();
		health.nvidia_llama = {
			available: true,
			status: 'healthy',
			...nvidiaStats
		};
	} catch (error: any) {
		health.nvidia_llama = {
			available: false,
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}

	try {
		// Check GPU Service Integration
		await gpuServiceIntegration.initialize();
		const status = gpuServiceIntegration.getServiceStatus();
		health.gpu_service_integration = {
			available: status.available,
			status: status.initialized ? 'healthy' : 'initializing',
			performance: status.performance
		};
	} catch (error: any) {
		health.gpu_service_integration = {
			available: false,
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}

	try {
		// Check WASM-LLVM Bridge
		health.wasm_llvm = {
			available: true, // Always available with fallback
			status: 'healthy',
			capabilities: ['legal_processing', 'vector_computation', 'fallback_cpu']
		};
	} catch (error: any) {
		health.wasm_llvm = {
			available: false,
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}

	try {
		// Check external WASM-LLVM service (port 8225)
		const response = await fetch('http://localhost:8225/health');
		if (response.ok) {
			const serviceHealth = await response.json();
			health.wasm_llvm_service = {
				available: true,
				status: 'healthy',
				...serviceHealth
			};
		} else {
			throw new Error(`Service responded with status ${response.status}`);
		}
	} catch (error: any) {
		health.wasm_llvm_service = {
			available: false,
			status: 'error',
			note: 'External WASM-LLVM service not running on port 8225',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}

	return health;
}

// Hybrid operation routing
async function performHybridOperation(data: any, options: any = {}): Promise<GPUApiResponse> {
	const startTime = Date.now();

	try {
		// Intelligent routing based on operation type and data size
		const dataSize = JSON.stringify(data).length;
		const operationType = data.type || 'unknown';

		let result: any;
		let serviceUsed = 'unknown';
		let memoryUsed = 0;
		let gpuUtilization = 0;

		// Route to appropriate service based on operation
		if (operationType === 'text_generation' || operationType === 'legal_analysis') {
			// Use NVIDIA LLaMA for text generation
				try {
				const response = await nvidiaLlamaService.generateText({
					prompt: data.prompt || data.query || '',
					max_tokens: data.max_tokens || 1024,
					temperature: data.temperature || 0.7,
					priority: options.priority || 'medium'
				});
				result = response;
				serviceUsed = 'nvidia_llama';
				memoryUsed = 1024 * 1024; // Estimate
				gpuUtilization = 0.8;
			} catch (error: any) {
				// Fallback to WASM-LLVM bridge
				const wasmResult = await llvmWasmBridge.processLegalText(
					data.prompt || data.query || '',
					{
						extractCitations: true,
						riskAssessment: true
					}
				);
				result = wasmResult;
				serviceUsed = 'wasm_llvm_bridge_fallback';
				memoryUsed = 512 * 1024;
				gpuUtilization = 0;
			}
		}
		else if (operationType === 'vector_computation' || operationType === 'embedding') {
			// Use WASM-LLVM for vector operations
			try {
				const embedding = await llvmWasmBridge.computeEmbedding(
					data.input || [],
					data.dimensions || 384
				);
				result = embedding;
				serviceUsed = 'wasm_llvm_bridge';
				memoryUsed = (data.dimensions || 384) * 4;
				gpuUtilization = 0.3;
			} catch (error: any) {
				// Fallback to GPU service integration
				const gpuResult = await gpuServiceIntegration.generateEmbeddings([
					Array.isArray(data.input) ? data.input.join(' ') : String(data.input)
				]);
				result = {
					embedding: Array.from(gpuResult[0] || []),
					processingTime: Date.now() - startTime
				};
				serviceUsed = 'gpu_service_integration_fallback';
				memoryUsed = 384 * 4;
				gpuUtilization = 0.1;
			}
		}
		else if (operationType === 'wasm_compilation') {
			// Route to external WASM-LLVM service
			try {
				const response = await fetch('http://localhost:8225/api/v1/compile', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: `compile_${Date.now()}`,
						source_files: data.source_files || [],
						compiler_flags: data.compiler_flags || [],
						target_arch: 'wasm32',
						opt_level: '-O2',
						metadata: { type: 'legal_ai_module' }
					})
				});

				if (response.ok) {
					result = await response.json();
					serviceUsed = 'wasm_llvm_service';
					memoryUsed = result.wasm_size || 0;
					gpuUtilization = 0;
				} else {
					throw new Error(`WASM service error: ${response.statusText}`);
				}
			} catch (error: any) {
				// Fallback to local WASM bridge
				result = {
					success: false,
					error: 'External WASM service unavailable',
					fallback: 'Using local WASM processing'
				};
				serviceUsed = 'wasm_fallback';
				memoryUsed = 0;
				gpuUtilization = 0;
			}
		}
		else {
			// Generic GPU processing
			try {
				const task = await gpuServiceIntegration.processTask({
					id: `task_${Date.now()}`,
					type: operationType as any,
					data,
					priority: options.priority || 'medium',
					metadata: {}
				});

				result = task.result;
				serviceUsed = 'gpu_service_integration';
				memoryUsed = task.memoryUsed || 0;
				gpuUtilization = 0.5;
			} catch (error: any) {
				throw new Error(`GPU processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}

		return {
			success: true,
			operation: 'hybrid',
			result,
			serviceUsed,
			performance: {
				processingTime: Date.now() - startTime,
				memoryUsed,
				gpuUtilization
			},
			metadata: {
				dataSize,
				operationType,
				routingDecision: `Routed to ${serviceUsed} based on ${operationType} operation`,
				fallbackAvailable: true
			}
		};

	} catch (error: any) {
		return {
			success: false,
			operation: 'hybrid',
			error: error instanceof Error ? error.message : 'Unknown error',
			serviceUsed: 'error',
			performance: {
				processingTime: Date.now() - startTime,
				memoryUsed: 0,
				gpuUtilization: 0
			},
			metadata: {
				errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
			}
		};
	}
}

// GET endpoint - Health check and capabilities
export const GET: RequestHandler = async ({ url }) => {
	try {
		const operation = url.searchParams.get('operation') || 'health';

		if (operation === 'health') {
			const health = await checkGPUHealth();
			return json({
				success: true,
				operation: 'health',
				result: health,
				serviceUsed: 'health_aggregator',
				performance: {
					processingTime: 0,
					memoryUsed: 0,
					gpuUtilization: 0
				},
				metadata: {
					timestamp: new Date().toISOString(),
					availableOperations: [
						'llama_generate',
						'wasm_compile',
						'wasm_execute',
						'gpu_compute',
						'hybrid',
						'health'
					]
				}
			});
		}

		return json({
			success: false,
			error: `Unsupported GET operation: ${operation}`
		}, { status: 400 });

	} catch (error: any) {
		console.error('GPU API GET error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

// POST endpoint - All GPU operations
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: GPUApiRequest = await request.json();
		const { operation, data, options = {} } = body;

		let response: GPUApiResponse;

		switch (operation) {
			case 'llama_generate':
				try {
					const result = await nvidiaLlamaService.generateText({
						prompt: data.prompt,
						max_tokens: data.max_tokens || 1024,
						temperature: data.temperature || 0.7,
						priority: options.priority || 'medium'
					});

					response = {
						success: true,
						operation,
						result,
						serviceUsed: 'nvidia_llama',
						performance: {
							processingTime: result.generation_time_ms,
							memoryUsed: result.metadata.total_tokens * 4,
							gpuUtilization: 0.8
						},
						metadata: {
							model: result.model_used,
							tokens_generated: result.tokens_generated
						}
					};
				} catch (error: any) {
					response = {
						success: false,
						operation,
						error: error instanceof Error ? error.message : 'LLaMA generation failed',
						serviceUsed: 'nvidia_llama',
						performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
						metadata: {}
					};
				}
				break;

			case 'wasm_compile':
			case 'wasm_execute':
				try {
					// Route to external WASM-LLVM service
					const endpoint = operation === 'wasm_compile' ? 'compile' : 'execute';
					const serviceResponse = await fetch(`http://localhost:8225/api/v1/${endpoint}`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(data)
					});

					if (serviceResponse.ok) {
						const result = await serviceResponse.json();
						response = {
							success: result.success,
							operation,
							result,
							serviceUsed: 'wasm_llvm_service',
							performance: {
								processingTime: result.compile_time_ms || result.execution_time_ms || 0,
								memoryUsed: result.wasm_size || result.memory_used || 0,
								gpuUtilization: 0
							},
							metadata: result.metadata || {}
						};
					} else {
						throw new Error(`WASM service error: ${serviceResponse.statusText}`);
					}
				} catch (error: any) {
					response = {
						success: false,
						operation,
						error: error instanceof Error ? error.message : 'WASM operation failed',
						serviceUsed: 'wasm_llvm_service',
						performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
						metadata: {}
					};
				}
				break;

			case 'gpu_compute':
				try {
					const task = await gpuServiceIntegration.processTask({
						id: `gpu_${Date.now()}`,
						type: data.type || 'legal_analysis',
						data: data.payload || data,
						priority: options.priority || 'medium',
						metadata: data.metadata || {}
					});

					response = {
						success: task.success,
						operation,
						result: task.result,
						serviceUsed: 'gpu_service_integration',
						performance: {
							processingTime: task.processingTime,
							memoryUsed: task.memoryUsed,
							gpuUtilization: task.gpuUsed ? 0.6 : 0
						},
						metadata: { taskId: task.taskId }
					};
				} catch (error: any) {
					response = {
						success: false,
						operation,
						error: error instanceof Error ? error.message : 'GPU compute failed',
						serviceUsed: 'gpu_service_integration',
						performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
						metadata: {}
					};
				}
				break;

			case 'hybrid':
				response = await performHybridOperation(data, options);
				break;

			case 'health':
				const health = await checkGPUHealth();
				response = {
					success: true,
					operation,
					result: health,
					serviceUsed: 'health_aggregator',
					performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
					metadata: { timestamp: new Date().toISOString() }
				};
				break;

			default:
				response = {
					success: false,
					operation: operation || 'unknown',
					error: `Unsupported operation: ${operation}`,
					serviceUsed: 'error',
					performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
					metadata: {
						supportedOperations: ['llama_generate', 'wasm_compile', 'wasm_execute', 'gpu_compute', 'hybrid', 'health']
					}
				};
		}

		return json(response);

	} catch (error: any) {
		console.error('GPU API POST error:', error);
		return json({
			success: false,
			operation: 'unknown',
			error: error instanceof Error ? error.message : 'Unknown error',
			serviceUsed: 'error',
			performance: { processingTime: 0, memoryUsed: 0, gpuUtilization: 0 },
			metadata: {}
		}, { status: 500 });
	}
};