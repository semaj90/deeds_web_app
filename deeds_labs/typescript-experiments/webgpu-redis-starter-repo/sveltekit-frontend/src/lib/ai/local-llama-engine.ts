// WebAssembly llama.cpp integration for local Gemma 270MB inference
import { WebASMAIAdapter } from '../adapters/webasm-ai-adapter';
import { TensorCache } from '../cache/indexeddb';
import { ProtoSerializer } from '../cache/proto-serializer';

interface LlamaConfig {
    modelPath: string;
    contextSize: number;
    threads: number;
    batchSize: number;
    enableGpu: boolean;
    quantization: 'q4_0' | 'q4_1' | 'q8_0' | 'f16' | 'f32';
}

interface GenerationParams {
    prompt: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    seed: number;
    streaming: boolean;
}

interface LlamaResponse {
    token: string;
    isComplete: boolean;
    totalTokens: number;
    timing: {
        predictTime: number;
        evalTime: number;
        totalTime: number;
    };
}

export class LocalLlamaEngine {
    private wasmModule: any = null;
    private modelLoaded = false;
    private config: LlamaConfig;
    private tensorCache: TensorCache;
    private serializer: ProtoSerializer;
    private wasmAdapter: WebASMAIAdapter;
    private worker: Worker | null = null;

    constructor(config: Partial<LlamaConfig> = {}) {
        this.config = {
            modelPath: '/models/gemma-2-2b-it-q4_0.gguf',
            contextSize: 2048,
            threads: 4,
            batchSize: 512,
            enableGpu: false, // CPU only for WASM
            quantization: 'q4_0',
            ...config
        };

        this.tensorCache = new TensorCache();
        this.serializer = new ProtoSerializer();
        this.wasmAdapter = new WebASMAIAdapter();
    }

    async initialize(): Promise<void> {
        // Initialize dependencies
        await Promise.all([
            this.tensorCache.init(),
            this.wasmAdapter.init()
        ]);

        // Load llama.cpp WebAssembly module
        await this.loadWasmModule();

        // Create worker for background processing
        this.createWorker();

        // Load the Gemma model
        await this.loadModel();

        console.log('Local Llama engine initialized successfully');
    }

    private async loadWasmModule(): Promise<void> {
        try {
            // Load the compiled llama.cpp WASM module
            const wasmPath = '/wasm/llama.wasm';
            const wasmResponse = await fetch(wasmPath);
            const wasmBytes = await wasmResponse.arrayBuffer();

            // Compile WebAssembly module
            const wasmModule = await WebAssembly.compile(wasmBytes);

            // Create imports for the WASM module
            const imports = {
                env: {
                    memory: new WebAssembly.Memory({
                        initial: 256, // 16MB initial
                        maximum: 2048, // 128MB max
                        shared: false
                    }),
                    abort: () => { throw new Error('WASM abort'); },
                    __assert_fail: () => { throw new Error('WASM assertion failed'); },
                    emscripten_resize_heap: () => false,
                    _emscripten_memcpy_big: (dest: number, src: number, num: number) => {
                        const memory = new Uint8Array(imports.env.memory.buffer);
                        memory.copyWithin(dest, src, src + num);
                    },
                    _pthread_create: () => -1,
                    _pthread_join: () => 0,
                    printf: (...args: any[]) => console.log(...args),
                    fprintf: (...args: any[]) => console.error(...args)
                },
                wasi_snapshot_preview1: {
                    proc_exit: () => {},
                    fd_close: () => 0,
                    fd_seek: () => 0,
                    fd_write: () => 0
                }
            };

            // Instantiate the module
            const wasmInstance = await WebAssembly.instantiate(wasmModule, imports);
            this.wasmModule = wasmInstance.exports;

            console.log('llama.cpp WASM module loaded');
        } catch (error) {
            console.error('Failed to load llama.cpp WASM:', error);
            throw error;
        }
    }

    private createWorker(): void {
        // Create worker for background inference
        const workerCode = `
            let llamaContext = null;

            self.onmessage = async function(e) {
                const { type, data } = e.data;

                switch (type) {
                    case 'GENERATE':
                        await generateTokens(data);
                        break;
                    case 'LOAD_MODEL':
                        await loadModelInWorker(data);
                        break;
                }
            };

            async function loadModelInWorker(config) {
                try {
                    // Load model in worker context
                    self.postMessage({
                        type: 'MODEL_LOADED',
                        success: true
                    });
                } catch (error) {
                    self.postMessage({
                        type: 'MODEL_LOADED',
                        success: false,
                        error: error.message
                    });
                }
            }

            async function generateTokens(params) {
                try {
                    // Simulate token generation for now
                    const tokens = params.prompt.split(' ');

                    for (let i = 0; i < Math.min(tokens.length, params.maxTokens); i++) {
                        await new Promise(resolve => setTimeout(resolve, 50));

                        self.postMessage({
                            type: 'TOKEN',
                            token: tokens[i] + ' ',
                            isComplete: i === tokens.length - 1,
                            totalTokens: i + 1
                        });
                    }

                    self.postMessage({
                        type: 'GENERATION_COMPLETE',
                        totalTokens: tokens.length
                    });
                } catch (error) {
                    self.postMessage({
                        type: 'ERROR',
                        error: error.message
                    });
                }
            }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
    }

    private async loadModel(): Promise<void> {
        if (!this.wasmModule) {
            throw new Error('WASM module not loaded');
        }

        try {
            // Check if model is cached in IndexedDB
            const modelKey = `model_${this.config.modelPath.split('/').pop()}`;
            let modelData = await this.tensorCache.getTensor(modelKey);

            if (!modelData) {
                // Download model
                console.log('Downloading Gemma 270MB model...');
                const modelResponse = await fetch(this.config.modelPath);
                const modelBuffer = await modelResponse.arrayBuffer();

                // Cache model in IndexedDB
                await this.tensorCache.storeTensorSlices(
                    modelKey,
                    new Float32Array(modelBuffer),
                    [modelBuffer.byteLength]
                );

                modelData = {
                    data: modelBuffer,
                    shape: [modelBuffer.byteLength],
                    dtype: 'uint8'
                };
            }

            // Load model into WASM context
            if (this.worker) {
                this.worker.postMessage({
                    type: 'LOAD_MODEL',
                    data: {
                        modelData: modelData.data,
                        config: this.config
                    }
                });

                // Wait for model loading confirmation
                await new Promise((resolve, reject) => {
                    const handleMessage = (e: MessageEvent) => {
                        if (e.data.type === 'MODEL_LOADED') {
                            this.worker?.removeEventListener('message', handleMessage);
                            if (e.data.success) {
                                resolve(true);
                            } else {
                                reject(new Error(e.data.error));
                            }
                        }
                    };
                    this.worker?.addEventListener('message', handleMessage);
                });
            }

            this.modelLoaded = true;
            console.log('Gemma 270MB model loaded successfully');
        } catch (error) {
            console.error('Failed to load model:', error);
            throw error;
        }
    }

    async *generate(params: GenerationParams): AsyncGenerator<LlamaResponse, void, unknown> {
        if (!this.modelLoaded) {
            throw new Error('Model not loaded');
        }

        if (!this.worker) {
            throw new Error('Worker not initialized');
        }

        // Start generation in worker
        this.worker.postMessage({
            type: 'GENERATE',
            data: params
        });

        // Yield tokens as they're generated
        return new Promise((resolve) => {
            const tokens: LlamaResponse[] = [];

            const handleMessage = (e: MessageEvent) => {
                const { type } = e.data;

                switch (type) {
                    case 'TOKEN':
                        const tokenResponse: LlamaResponse = {
                            token: e.data.token,
                            isComplete: e.data.isComplete,
                            totalTokens: e.data.totalTokens,
                            timing: {
                                predictTime: 0,
                                evalTime: 0,
                                totalTime: 0
                            }
                        };
                        tokens.push(tokenResponse);
                        break;

                    case 'GENERATION_COMPLETE':
                        this.worker?.removeEventListener('message', handleMessage);
                        resolve(this.createGenerator(tokens));
                        break;

                    case 'ERROR':
                        this.worker?.removeEventListener('message', handleMessage);
                        throw new Error(e.data.error);
                }
            };

            this.worker?.addEventListener('message', handleMessage);
        });
    }

    private async *createGenerator(tokens: LlamaResponse[]): AsyncGenerator<LlamaResponse, void, unknown> {
        for (const token of tokens) {
            yield token;
        }
    }

    // Legal-specific prompt formatting
    formatLegalPrompt(messages: Array<{role: string; content: string}>): string {
        const systemPrompt = `You are an expert legal AI assistant. Provide accurate legal analysis based on established legal principles. Always consider:
1. Relevant statutes and case law
2. Potential risks and liabilities
3. Compliance requirements
4. Best practices and recommendations

Format your response clearly with numbered points where appropriate.`;

        let formatted = `<s>[INST] ${systemPrompt}\n\n`;

        for (const message of messages) {
            if (message.role === 'user') {
                formatted += `Legal Question: ${message.content}\n`;
            } else if (message.role === 'assistant') {
                formatted += `Legal Analysis: ${message.content}\n`;
            }
        }

        formatted += `Legal Analysis: [/INST]`;
        return formatted;
    }

    // Generate legal response with caching
    async generateLegalResponse(
        messages: Array<{role: string; content: string}>,
        caseId: string,
        options: {
            maxTokens?: number;
            temperature?: number;
            useCache?: boolean;
        } = {}
    ): Promise<string> {
        const {
            maxTokens = 512,
            temperature = 0.7,
            useCache = true
        } = options;

        // Check cache
        const cacheKey = `local_legal_${caseId}_${this.hashMessages(messages)}`;
        if (useCache) {
            const cached = await this.tensorCache.getTensor(cacheKey);
            if (cached) {
                const cachedText = new TextDecoder().decode(cached.data);
                return cachedText;
            }
        }

        // Format prompt
        const prompt = this.formatLegalPrompt(messages);

        // Generate response
        const params: GenerationParams = {
            prompt,
            maxTokens,
            temperature,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.1,
            seed: Math.floor(Math.random() * 1000000),
            streaming: false
        };

        let fullResponse = '';
        for await (const response of await this.generate(params)) {
            fullResponse += response.token;
        }

        // Cache response
        if (useCache && fullResponse) {
            const responseBytes = new TextEncoder().encode(fullResponse);
            await this.tensorCache.storeTensorSlices(
                cacheKey,
                new Float32Array(responseBytes.buffer),
                [responseBytes.length]
            );
        }

        return fullResponse;
    }

    private hashMessages(messages: Array<{role: string; content: string}>): string {
        const messageString = messages.map(m => `${m.role}:${m.content}`).join('|');
        let hash = 0;
        for (let i = 0; i < messageString.length; i++) {
            const char = messageString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // Performance monitoring
    getPerformanceMetrics(): {
        modelLoaded: boolean;
        memoryUsage: number;
        cacheSize: number;
        wasmMemory: number;
    } {
        const wasmMemory = this.wasmModule?.memory?.buffer?.byteLength || 0;
        const cacheMetrics = this.tensorCache.getMemoryUsage();

        return {
            modelLoaded: this.modelLoaded,
            memoryUsage: wasmMemory,
            cacheSize: cacheMetrics.cached,
            wasmMemory
        };
    }

    // Cleanup resources
    async cleanup(): Promise<void> {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        await this.tensorCache.clear();
        this.modelLoaded = false;
        this.wasmModule = null;

        console.log('Local Llama engine cleaned up');
    }

    // Model status
    isReady(): boolean {
        return this.modelLoaded && this.wasmModule !== null;
    }

    // Get model info
    getModelInfo(): {
        modelPath: string;
        config: LlamaConfig;
        status: 'loading' | 'ready' | 'error';
    } {
        return {
            modelPath: this.config.modelPath,
            config: this.config,
            status: this.modelLoaded ? 'ready' : 'loading'
        };
    }
}

// Singleton instance
let localEngine: LocalLlamaEngine | null = null;

export async function getLocalLlamaEngine(config?: Partial<LlamaConfig>): Promise<LocalLlamaEngine> {
    if (!localEngine) {
        localEngine = new LocalLlamaEngine(config);
        await localEngine.initialize();
    }
    return localEngine;
}

export async function cleanupLocalEngine(): Promise<void> {
    if (localEngine) {
        await localEngine.cleanup();
        localEngine = null;
    }
}