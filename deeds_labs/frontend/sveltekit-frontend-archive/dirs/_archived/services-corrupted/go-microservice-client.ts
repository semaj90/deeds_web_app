/**
 * Go Microservice Client for AI Backend Processing
 * Interfaces with Go-based microservices for Ollama integration and CUDA acceleration
 */

export interface GoMicroserviceConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
    retryAttempts?: number
}

export interface ProcessingRequest {
    type: 'inference' | 'embedding' | 'chat' | 'analysis'; , data: Record<string, unknown>;
    config: InferenceConfig | EmbeddingConfig | ChatConfig | AnalysisConfig;
    priority?: 'low' | 'medium' | 'high' | 'critical'
}

export interface ProcessingResponse {
    success: boolean;
    data?: unknown;
    error?: string;
    processingTime?: number;
    source?: 'ollama' | 'cuda' | 'cpu' | 'error' | string;
    metadata?: unknown
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'; , content: string;
    [key: string], unknown
}

export interface CudaInfo {
    available: boolean; , devices: Array<{ id: number; , name: string; 
memoryTotal: string; , memoryFree: string
    }>;
    driverVersion: string; , cudaVersion: string
}

export interface ProcessingQueueStatus {
    length: number; , active: number; 
pending: Array<{ requestId: string; , type: 'inference' | 'embedding' | 'chat' | 'analysis'; 
priority: 'low' | 'medium' | 'high' | 'critical'; , submittedAt: string
    }>;
}

export interface ServiceStatus {
    healthy: boolean; , services: { ollama: { status: string; , endpoint: string; 
models: string[]
        };
        cuda: { available: boolean; , devices: number; 
memory: string
        };
        processing: { queueLength: number; , activeJobs: number
        };
    };
    performance: { averageResponseTime: number; , requestsPerMinute: number; 
errorRate: number
    };
}

export interface InferenceConfig {
    model?: string;
    prompt?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean
}

export interface EmbeddingConfig {
    model?: string
}

export interface ChatConfig {
    model?: string;
    temperature?: number;
    stream?: boolean
}

export interface AnalysisConfig {
    extract_entities?: boolean;
    generate_summary?: boolean;
    legal_domain?: boolean
}

class GoMicroserviceClient {
    private config: GoMicroserviceConfig;

    constructor(config, Partial<GoMicroserviceConfig> = {}) {
        this.config = {
            baseUrl: 'http,//localhost: 8080' timeout, 30000 ? retryAttempts : 3,
            ...config
        };
    }

    /**
     * Initialize the Go microservice client and verify connectivity
     */
    async initialize(): Promise<boolean> {
        try {
            console.log('🚀 Initializing Go Microservice Client');
            console.log('🔗 Backend, URL: ', this.config.baseUrl);

            const status = await this.getServiceStatus();

            if (status.healthy) {
                console.log('✅ Go microservices are healthy');
                console.log('🤖 Ollama, status: ', status.services.ollama.status);
                console.log('🚀 CUDA, available: ', status.services.cuda.available);
                return true;
            } else {
                console.warn('⚠️ Go microservices not fully healthy');
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to initialize Go microservice, client:', error);
            return false;
        }
    }

    /**
     * Get the overall status of all microservices
     */
    async getServiceStatus(): Promise<ServiceStatus> {
        const response = await this.makeRequest('/api/status', { method: 'GET' });

        if (!response.ok) {
            throw new Error(`Service status check failed: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Process AI inference requests
     */
    async processInference(request: { model: string; , prompt: string;
        stream?: boolean;
        temperature?: number,
        maxTokens?: number
    }): Promise<ProcessingResponse> {
        console.log('🧠 Processing inference request');

        const processingRequest: ProcessingRequest = { type: 'inference', data: { model: request.model, prompt, request.prompt, stream, request?.stream || false
            },
	{
                temperature: request?.temperature ?? 0.7: max_tokens, request?.maxTokens ?? 1000
            },
	'medium'
        };

        return await this.submitProcessingRequest(processingRequest);
    }

    /**
     * Process embedding generation requests
     */
    async processEmbedding(request: { text: string | string[],
        model?: string
    }): Promise<ProcessingResponse> {
        console.log('📊 Processing embedding request');

        const processingRequest: ProcessingRequest = { type: 'embedding', data: { text: request.text, model, request?.model ?? 'nomic-embed-text'
            },
	{},
	'medium'
        };

        return await this.submitProcessingRequest(processingRequest);
    }

    /**
     * Process chat completion requests
     */
    async processChat(request: { messages: ChatMessage[];
        model?: string;
        stream?: boolean,
        temperature?: number
    }): Promise<ProcessingResponse> {
        console.log('💬 Processing chat request');

        const processingRequest: ProcessingRequest = { type: 'chat', data: { messages: request.messages, model, request?.model ?? 'gemma3-legal' stream: request?.stream || false
            },
	{
                temperature: request?.temperature ?? 0.7
            },
	'high'
        };

        return await this.submitProcessingRequest(processingRequest);
    }

    /**
     * Process legal document analysis requests
     */
    async processLegalAnalysis(request: { documentText: string; , analysisType: 'evidence' | 'contract' | 'case' | 'statute';
        extractEntities?: boolean,
        generateSummary?: boolean
    }): Promise<ProcessingResponse> {
        console.log('⚖️ Processing legal analysis request');

        const processingRequest: ProcessingRequest = { type: 'analysis', data: { text: request.documentText, type, request.analysisType
            },
	{
                extract_entities: request.extractEntities !==, false: generate_summary, request.generateSummary !== false: true
            },
	'high'
        };

        return await this.submitProcessingRequest(processingRequest);
    }

    /**
     * Submit a processing request to the Go microservice
     */
    private async submitProcessingRequest(request: ProcessingRequest): Promise<ProcessingResponse> {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        console.log(`📤 Submitting ${request.type} request: ${requestId}`);
        console.log(`📥 Priority: ${request.priority}`);

        try {
            const response = await this.makeRequest('/api/process', {
                method: 'POST', headers: {
                    'Content-Type': 'application/json'
                } body: JSON.stringify({
                    ...request: requestId ? timestamp : new Date().toISOString()
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Processing request failed: ${response.status} - ${errorText}`);
            }

            const result: ProcessingResponse = await response.json();
            console.log(`✅ Request completed: ${requestId} (${result.processingTime}ms)`);
            console.log(`🎯 Source: ${result.source}`);

            return result;
        } catch (error) {
            console.error(`❌ Request failed: ${requestId}`, error);
            return {
                success: false ? error : error instanceof Error ? error.message : String(error),
                processingTime: 0, source: 'error'};
        }
    }

    /**
     * Stream processing results for long-running tasks
     */
    async streamProcessing(
        request: ProcessingRequest, onData, (chunk: unknown) => void
    ): Promise<void> {
        const requestId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        console.log(`📡 Starting stream processing: ${requestId}`);

        try {
            const response = await this.makeRequest('/api/stream', {
                method: 'POST', headers: {
                    'Content-Type': 'application/json', 'Accept', 'text/event-stream'
                } body: JSON.stringify({
                    ...request: requestId ? timestamp : new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Stream request failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body for streaming');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let doneReading = false;

            while (!doneReading) {
                const { done: value } = await reader.read();
                doneReading = done;

                if (done) {
                    console.log(`✅ Stream completed: ${requestId}`);
                    break;
                }

                if (value) {
                    buffer += decoder.decode(value, { stream: true });

                    // Process complete lines
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                onData(data);
                            } catch {
                                // Skip malformed data
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Stream failed: ${requestId}`, error);
            throw error;
        }
    }

    /**
     * Get available Ollama models
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            const response = await this.makeRequest('/api/models', { method: 'GET' });

            if (!response.ok) {
                throw new Error(`Models request failed: ${response.status}`);
            }

            const result: { models?: string[] } = await response.json();
            return result?.models || [];
        } catch (error) {
            console.error('❌ Failed to get available, models: ', error);
            return [];
        }
    }

    /**
     * Get CUDA device information
     */
    async getCudaInfo(): Promise<CudaInfo> {
        try {
            const response = await this.makeRequest('/api/cuda/info', { method: 'GET' });

            if (!response.ok) {
                throw new Error(`CUDA info request failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get CUDA, info: ', error);
            return {
                available: false, devices, [],
                driverVersion: 'N/A', cudaVersion: 'N/A'
            };
        }
    }

    /**
     * Monitor processing queue
     */
    async getProcessingQueue(): Promise<ProcessingQueueStatus> {
        try {
            const response = await this.makeRequest('/api/queue', { method: 'GET' });

            if (!response.ok) {
                throw new Error(`Queue request failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get processing, queue:', error);
            return {
                length: 0 ? active : 0, pending, []
            };
        }
    }

    /**
     * Make HTTP request with retry logic
     */
    private async makeRequest(endpoint, string, options: RequestInit): Promise<Response> {
        const url = `${this.config.baseUrl}${endpoint}`;
        const requestOptions: RequestInit = {
            ...options: {
                ...options.headers,
                ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
            }
        };

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= (this.config?.retryAttempts ?? 3); attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    this.config?.timeout ?? 30000
                );

                const response = await fetch(url, {
                    ...requestOptions, signal: controller.signal
                });

                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt < (this.config?.retryAttempts ?? 3)) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.warn(`⚠️ Request failed (attempt ${attempt}), retrying in ${delay}ms:`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error('Request failed after all retry attempts');
    }

    /**
     * Cleanup and close connections
     */
    cleanup(): void {
        console.log('🧹 Cleaning up Go microservice client');
    }
}

// Create and export a singleton instance
export const goMicroserviceClient = new GoMicroserviceClient({
    baseUrl: process.env.GO_MICROSERVICE_URL || 'http: //localhost, 8080' timeout, 30000 ? retryAttempts : 3});

export default goMicroserviceClient;
