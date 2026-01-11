#!/bin/bash

# build-legal-grpc-wasm.sh - Build WebAssembly gRPC client for legal CUDA streaming

set -e

echo "🚀 Building Legal gRPC WebAssembly Client"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/../../../static/wasm"

# Emscripten settings
EMSCRIPTEN_ROOT="${EMSCRIPTEN_ROOT:-$HOME/emsdk/upstream/emscripten}"
export PATH="$EMSCRIPTEN_ROOT:$PATH"

# Create build directories
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"

echo "📁 Build directory: $BUILD_DIR"
echo "📁 Output directory: $OUTPUT_DIR"

# Generate protocol buffer files
echo "⚙️  Generating protobuf files..."
cd "$PROJECT_ROOT/proto"

# Generate C++ protobuf files
protoc --cpp_out="$BUILD_DIR" \
       --grpc_out="$BUILD_DIR" \
       --plugin=protoc-gen-grpc=`which grpc_cpp_plugin` \
       legal_cuda_streaming.proto

echo "✅ Protobuf files generated"

# Copy source files to build directory
cp "$SCRIPT_DIR/legal_grpc_client.cpp" "$BUILD_DIR/"

# Emscripten compile settings
EMCC_FLAGS=(
    # Input files
    "$BUILD_DIR/legal_grpc_client.cpp"
    "$BUILD_DIR/legal_cuda_streaming.pb.cc"
    "$BUILD_DIR/legal_cuda_streaming.grpc.pb.cc"
    
    # Output
    "-o" "$OUTPUT_DIR/legal_grpc_client.js"
    
    # WebAssembly settings
    "-s" "WASM=1"
    "-s" "USE_PTHREADS=1"
    "-s" "PTHREAD_POOL_SIZE=4"
    "-s" "SHARED_MEMORY=1"
    
    # Memory settings
    "-s" "INITIAL_MEMORY=67108864"  # 64MB
    "-s" "MAXIMUM_MEMORY=134217728" # 128MB
    "-s" "ALLOW_MEMORY_GROWTH=1"
    "-s" "STACK_SIZE=8388608"       # 8MB stack
    
    # Emscripten bindings
    "--bind"
    
    # gRPC-Web specific settings
    "-s" "USE_LIBCXX=1"
    "-s" "DISABLE_EXCEPTION_CATCHING=0"
    
    # Optimization
    "-O3"
    "-s" "ASSERTIONS=0"
    "-s" "SAFE_HEAP=0"
    
    # Export settings
    "-s" "EXPORTED_FUNCTIONS=['_main']"
    "-s" "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']"
    "-s" "EXTRA_EXPORTED_RUNTIME_METHODS=['addOnInit','addOnExit']"
    
    # Module settings
    "-s" "MODULARIZE=1"
    "-s" "EXPORT_NAME='LegalGrpcModule'"
    "-s" "ENVIRONMENT=web,worker"
    
    # Networking
    "-s" "FETCH=1"
    "-s" "USE_ZLIB=1"
    
    # Include paths
    "-I$BUILD_DIR"
    "-I$EMSCRIPTEN_ROOT/system/include"
    
    # C++ standard
    "-std=c++17"
    
    # Debug info (for development)
    "-g"
    "--source-map-base" "http://localhost:5173/"
)

# gRPC-Web library paths (adjust based on your gRPC-Web installation)
GRPC_WEB_ROOT="${GRPC_WEB_ROOT:-$HOME/grpc-web}"
if [ -d "$GRPC_WEB_ROOT" ]; then
    EMCC_FLAGS+=(
        "-I$GRPC_WEB_ROOT/include"
        "-L$GRPC_WEB_ROOT/lib"
        "-lgrpc_web_client"
    )
else
    echo "⚠️  gRPC-Web not found at $GRPC_WEB_ROOT"
    echo "   Using system gRPC libraries"
    EMCC_FLAGS+=(
        "-lgrpc++"
        "-lgrpc"
        "-lprotobuf"
    )
fi

echo "🔨 Compiling with Emscripten..."
echo "Command: emcc ${EMCC_FLAGS[*]}"

cd "$BUILD_DIR"

# Run Emscripten compiler
emcc "${EMCC_FLAGS[@]}"

if [ $? -eq 0 ]; then
    echo "✅ WebAssembly compilation successful!"
    echo "📦 Generated files:"
    ls -la "$OUTPUT_DIR"/legal_grpc_client.*
    
    # Create TypeScript definitions
    echo "📝 Generating TypeScript definitions..."
    cat > "$OUTPUT_DIR/legal_grpc_client.d.ts" << 'EOF'
// TypeScript definitions for Legal gRPC WebAssembly client

export interface LegalGrpcClient {
  new(endpoint: string): LegalGrpcClient;
  
  setResponseCallback(callback: (response: string) => void): void;
  setErrorCallback(callback: (error: string) => void): void;
  setCompletionCallback(callback: () => void): void;
  
  startBidirectionalStream(sessionId: string): string;
  sendEmbeddingRequest(sessionId: string, text: string, isFinal?: boolean): boolean;
  sendSearchRequest(sessionId: string, embedding: number[], isFinal?: boolean): boolean;
  
  processLegalDocument(
    documentId: string,
    content: string,
    type: string,
    progressCallback: (response: DocumentProgress) => void
  ): void;
  
  performSemanticSearch(
    query: string,
    collection: string,
    topK: number,
    resultsCallback: (results: SearchResults) => void
  ): void;
  
  analyzeCaseSimilarity(
    baseCaseId: string,
    compareCaseIds: string[],
    similarityCallback: (similarity: CaseSimilarity) => void
  ): void;
  
  closeStream(sessionId: string): boolean;
  isConnected(): boolean;
}

export interface DocumentProgress {
  document_id: string;
  stage: ProcessingStage;
  progress: number;
  results?: any;
}

export interface SearchResults {
  query_id: string;
  matches: SearchMatch[];
  total_matches: number;
  is_complete: boolean;
}

export interface SearchMatch {
  document_id: string;
  similarity_score: number;
  title: string;
  snippet: string;
  metadata: Record<string, string>;
}

export interface CaseSimilarity {
  base_case_id: string;
  similarities: Array<{
    case_id: string;
    similarity: number;
    metrics: Record<string, number>;
  }>;
}

export interface CudaResponse {
  session_id: string;
  operation_type: string;
  status: number;
  embeddings?: number[];
  performance?: {
    processing_time_us: number;
    gpu_utilization: number;
    gpu_model: string;
  };
}

export enum ProcessingStage {
  INITIALIZATION = 0,
  TEXT_EXTRACTION = 1,
  ENTITY_EXTRACTION = 2,
  EMBEDDING_GENERATION = 3,
  ANALYSIS = 4,
  FINALIZATION = 5
}

declare global {
  interface Window {
    LegalGrpcModule: () => Promise<{
      LegalGrpcWebClient: new (endpoint: string) => LegalGrpcClient;
    }>;
  }
}

export {};
EOF
    
    echo "✅ TypeScript definitions created"
    
    # Create integration helper
    echo "🔧 Creating integration helper..."
    cat > "$SCRIPT_DIR/../services/legal-cuda-grpc-client.ts" << 'EOF'
// Integration helper for Legal CUDA gRPC WebAssembly client
import type { LegalGrpcClient, CudaResponse, DocumentProgress, SearchResults } from '../wasm/legal_grpc_client';

export class LegalCudaGrpcService {
    private client: LegalGrpcClient | null = null;
    private moduleReady: Promise<void>;
    
    constructor(private endpoint: string = 'http://localhost:50052') {
        this.moduleReady = this.initializeModule();
    }
    
    private async initializeModule(): Promise<void> {
        if (typeof window === 'undefined') {
            throw new Error('Legal CUDA gRPC client only works in browser environment');
        }
        
        // Load WebAssembly module
        const script = document.createElement('script');
        script.src = '/wasm/legal_grpc_client.js';
        document.head.appendChild(script);
        
        return new Promise((resolve, reject) => {
            script.onload = async () => {
                try {
                    const module = await window.LegalGrpcModule();
                    this.client = new module.LegalGrpcWebClient(this.endpoint);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = reject;
        });
    }
    
    async startEmbeddingStream(
        sessionId: string,
        onResponse: (response: CudaResponse) => void,
        onError: (error: string) => void,
        onComplete: () => void
    ): Promise<string> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        this.client.setResponseCallback(onResponse);
        this.client.setErrorCallback(onError);
        this.client.setCompletionCallback(onComplete);
        
        return this.client.startBidirectionalStream(sessionId);
    }
    
    async sendTextForEmbedding(sessionId: string, text: string, isFinal = false): Promise<boolean> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        return this.client.sendEmbeddingRequest(sessionId, text, isFinal);
    }
    
    async processDocument(
        documentId: string,
        content: string,
        type: string,
        onProgress: (progress: DocumentProgress) => void
    ): Promise<void> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        return this.client.processLegalDocument(documentId, content, type, onProgress);
    }
    
    async searchSemantic(
        query: string,
        collection: string,
        topK: number,
        onResults: (results: SearchResults) => void
    ): Promise<void> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        return this.client.performSemanticSearch(query, collection, topK, onResults);
    }
    
    async analyzeCases(
        baseCaseId: string,
        compareCaseIds: string[],
        onSimilarity: (similarity: any) => void
    ): Promise<void> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        return this.client.analyzeCaseSimilarity(baseCaseId, compareCaseIds, onSimilarity);
    }
    
    async closeStream(sessionId: string): Promise<boolean> {
        await this.moduleReady;
        if (!this.client) throw new Error('Client not initialized');
        
        return this.client.closeStream(sessionId);
    }
    
    async isConnected(): Promise<boolean> {
        await this.moduleReady;
        if (!this.client) return false;
        
        return this.client.isConnected();
    }
}
EOF
    
    echo "✅ Integration helper created"
    
    # Create usage example
    echo "📖 Creating usage example..."
    cat > "$SCRIPT_DIR/../components/examples/LegalCudaExample.svelte" << 'EOF'
<script lang="ts">
    import { onMount } from 'svelte';
    import { LegalCudaGrpcService } from '../../services/legal-cuda-grpc-client';
    
    let cudaService: LegalCudaGrpcService;
    let isConnected = false;
    let sessionId = '';
    let textInput = '';
    let responses: any[] = [];
    let processing = false;
    
    onMount(async () => {
        try {
            cudaService = new LegalCudaGrpcService('http://localhost:50052');
            isConnected = await cudaService.isConnected();
        } catch (error) {
            console.error('Failed to initialize CUDA gRPC service:', error);
        }
    });
    
    async function startEmbeddingSession() {
        if (!cudaService) return;
        
        processing = true;
        sessionId = 'session_' + Date.now();
        responses = [];
        
        try {
            await cudaService.startEmbeddingStream(
                sessionId,
                (response) => {
                    responses = [...responses, response];
                },
                (error) => {
                    console.error('Stream error:', error);
                    processing = false;
                },
                () => {
                    console.log('Stream completed');
                    processing = false;
                }
            );
        } catch (error) {
            console.error('Failed to start embedding stream:', error);
            processing = false;
        }
    }
    
    async function sendTextForProcessing() {
        if (!cudaService || !sessionId || !textInput.trim()) return;
        
        try {
            await cudaService.sendTextForEmbedding(sessionId, textInput, true);
            textInput = '';
        } catch (error) {
            console.error('Failed to send text:', error);
        }
    }
    
    async function performSearch() {
        if (!cudaService) return;
        
        try {
            await cudaService.searchSemantic(
                'contract termination clause',
                'legal_documents',
                10,
                (results) => {
                    console.log('Search results:', results);
                    responses = [...responses, { type: 'search', data: results }];
                }
            );
        } catch (error) {
            console.error('Search failed:', error);
        }
    }
</script>

<div class="legal-cuda-demo">
    <h2>🚀 Legal CUDA gRPC Streaming Demo</h2>
    
    <div class="status">
        <p>Connection Status: 
            <span class="status-indicator" class:connected={isConnected}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
        </p>
        <p>Session ID: <code>{sessionId || 'None'}</code></p>
    </div>
    
    <div class="controls">
        <button on:click={startEmbeddingSession} disabled={!isConnected || processing}>
            {processing ? '⏳ Processing...' : '🚀 Start Embedding Session'}
        </button>
        
        <button on:click={performSearch} disabled={!isConnected}>
            🔍 Test Semantic Search
        </button>
    </div>
    
    <div class="input-section">
        <textarea 
            bind:value={textInput}
            placeholder="Enter legal text to process..."
            rows="4"
            disabled={!sessionId}
        ></textarea>
        
        <button on:click={sendTextForProcessing} disabled={!sessionId || !textInput.trim()}>
            📝 Send for CUDA Processing
        </button>
    </div>
    
    <div class="responses">
        <h3>🔄 Real-time Responses</h3>
        {#each responses as response, i}
            <div class="response-item">
                <strong>Response {i + 1}:</strong>
                <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
        {/each}
    </div>
</div>

<style>
    .legal-cuda-demo {
        max-width: 800px;
        margin: 2rem auto;
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 8px;
    }
    
    .status {
        background: #f5f5f5;
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 1rem;
    }
    
    .status-indicator.connected {
        color: green;
    }
    
    .controls {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    
    .input-section {
        margin-bottom: 1rem;
    }
    
    textarea {
        width: 100%;
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    
    .responses {
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid #eee;
        padding: 1rem;
        background: #f9f9f9;
    }
    
    .response-item {
        margin-bottom: 1rem;
        padding: 0.5rem;
        background: white;
        border-radius: 4px;
    }
    
    pre {
        font-size: 0.8rem;
        white-space: pre-wrap;
    }
    
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
EOF
    
    echo "✅ Usage example created"
    echo ""
    echo "🎉 Legal CUDA gRPC WebAssembly build complete!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Set up gRPC-Web proxy (Envoy)"
    echo "   2. Build and run CUDA C++ server"
    echo "   3. Include WebAssembly client in your SvelteKit app"
    echo "   4. Test streaming functionality"
    echo ""
    
else
    echo "❌ WebAssembly compilation failed!"
    exit 1
fi