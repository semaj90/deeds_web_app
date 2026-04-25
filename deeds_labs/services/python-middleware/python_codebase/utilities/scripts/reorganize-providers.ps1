# Phase 3 Provider Directory Reorganization Script
# Moves existing AI providers to organized structure

Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Phase 3: Provider Directory Reorganization                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$projectRoot = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Set-Location $projectRoot

# Create new directory structure
Write-Host "📁 Creating provider directory structure..." -ForegroundColor Yellow

$directories = @(
    "src\lib\services\providers\tensorrt-triton",
    "src\lib\services\providers\ollama",
    "src\lib\services\providers\vllm",
    "src\lib\services\providers\openai",
    "src\lib\services\types"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  ✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Exists: $dir" -ForegroundColor Gray
    }
}

# Move Ollama files
Write-Host "`n📦 Moving Ollama provider files..." -ForegroundColor Yellow

$ollamaFiles = @{
    "src\lib\server\ai\ollama-service.ts" = "src\lib\services\providers\ollama\ollama-client.ts"
    "src\lib\server\ai\ollama-config.ts" = "src\lib\services\providers\ollama\config.ts"
    "src\lib\server\ai\ollama-local-llm.ts" = "src\lib\services\providers\ollama\local-llm.ts"
    "src\lib\server\ai\streaming-service.ts" = "src\lib\services\providers\ollama\streaming.ts"
}

foreach ($source in $ollamaFiles.Keys) {
    $dest = $ollamaFiles[$source]
    if (Test-Path $source) {
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        Copy-Item -Path $source -Destination $dest -Force
        Write-Host "  ✅ Moved: $(Split-Path -Leaf $source) -> $dest" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Not found: $source" -ForegroundColor Yellow
    }
}

# Create provider interface
Write-Host "`n📝 Creating provider interface..." -ForegroundColor Yellow

$providerInterface = @"
/**
 * AI Provider Interface
 * All providers (TensorRT-Triton, Ollama, vLLM, OpenAI) must implement this
 */

export interface InferenceRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  context?: string[];
}

export interface InferenceResponse {
  text: string;
  tokens: number;
  latency: number;
  provider: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'error';
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  modelName: string;
  priority: number;
  healthEndpoint?: string;
  capabilities: {
    streaming: boolean;
    embeddings: boolean;
    batchInference: boolean;
  };
}

export interface AIProvider {
  config: ProviderConfig;
  modelName: string;

  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;
  generate(request: InferenceRequest): Promise<InferenceResponse>;
  stream?(request: InferenceRequest): AsyncIterableIterator<string>;
  cleanup?(): Promise<void>;
}
"@

Set-Content -Path "src\lib\services\types\ai-provider.ts" -Value $providerInterface
Write-Host "  ✅ Created: src\lib\services\types\ai-provider.ts" -ForegroundColor Green

# Create vector search types
Write-Host "`n📝 Creating vector search types..." -ForegroundColor Yellow

$vectorTypes = @"
/**
 * Vector Search Types
 * For pgvector and Qdrant integration
 */

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
  source: 'qdrant' | 'pgvector';
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  useQdrant?: boolean;
  usePgVector?: boolean;
  hybrid?: boolean;
  filters?: Record<string, any>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface VectorDatabase {
  search(
    embedding: Float32Array,
    limit: number,
    threshold: number
  ): Promise<VectorSearchResult[]>;

  store(
    id: string,
    embedding: Float32Array,
    content: string,
    metadata: Record<string, any>
  ): Promise<void>;

  delete(id: string): Promise<void>;
}
"@

Set-Content -Path "src\lib\services\types\vector-search.ts" -Value $vectorTypes
Write-Host "  ✅ Created: src\lib\services\types\vector-search.ts" -ForegroundColor Green

# Create placeholder TensorRT client
Write-Host "`n📝 Creating TensorRT-Triton client stub..." -ForegroundColor Yellow

$tritonClient = @"
/**
 * TensorRT-Triton Inference Client
 * Primary GPU-accelerated inference provider
 */

import type { AIProvider, InferenceRequest, InferenceResponse, ProviderConfig } from '../../types/ai-provider';

export interface TritonConfig {
  httpUrl: string;
  grpcUrl: string;
  modelName: string;
  modelVersion: string;
}

export class TritonInferenceClient implements AIProvider {
  config: ProviderConfig;
  modelName: string;
  private httpUrl: string;
  private grpcUrl: string;
  private modelVersion: string;

  constructor(tritonConfig: TritonConfig) {
    this.httpUrl = tritonConfig.httpUrl;
    this.grpcUrl = tritonConfig.grpcUrl;
    this.modelName = tritonConfig.modelName;
    this.modelVersion = tritonConfig.modelVersion;

    this.config = {
      name: 'tensorrt-triton',
      baseUrl: tritonConfig.httpUrl,
      modelName: tritonConfig.modelName,
      priority: 1, // Highest priority
      healthEndpoint: '/v2/health/ready',
      capabilities: {
        streaming: false, // TensorRT doesn't support streaming yet
        embeddings: false,
        batchInference: true
      }
    };
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing TensorRT-Triton client...');

    // Verify server is ready
    const healthy = await this.healthCheck();
    if (!healthy) {
      throw new Error('Triton server not ready');
    }

    // Load model metadata
    const metadataUrl = \`\${this.httpUrl}/v2/models/\${this.modelName}/versions/\${this.modelVersion}\`;
    const response = await fetch(metadataUrl);

    if (!response.ok) {
      throw new Error(\`Failed to load model metadata: \${response.statusText}\`);
    }

    const metadata = await response.json();
    console.log('✅ TensorRT-Triton initialized:', metadata.name);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(\`\${this.httpUrl}/v2/health/ready\`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: InferenceRequest): Promise<InferenceResponse> {
    const start = Date.now();

    // Tokenize prompt (simplified - use actual tokenizer in production)
    const inputIds = this.tokenize(request.prompt);

    // Prepare Triton inference request
    const tritonRequest = {
      inputs: [
        {
          name: 'input_ids',
          shape: [1, inputIds.length],
          datatype: 'INT32',
          data: inputIds
        },
        {
          name: 'input_lengths',
          shape: [1],
          datatype: 'INT32',
          data: [inputIds.length]
        },
        {
          name: 'request_output_len',
          shape: [1],
          datatype: 'INT32',
          data: [request.maxTokens || 512]
        }
      ]
    };

    // Call Triton inference endpoint
    const inferenceUrl = \`\${this.httpUrl}/v2/models/\${this.modelName}/versions/\${this.modelVersion}/infer\`;
    const response = await fetch(inferenceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tritonRequest)
    });

    if (!response.ok) {
      throw new Error(\`Triton inference failed: \${response.statusText}\`);
    }

    const result = await response.json();
    const outputIds = result.outputs[0].data;

    // Decode tokens (simplified - use actual tokenizer in production)
    const text = this.detokenize(outputIds);
    const latency = Date.now() - start;

    return {
      text,
      tokens: outputIds.length,
      latency,
      provider: 'tensorrt-triton',
      model: this.modelName,
      finishReason: 'stop'
    };
  }

  // Placeholder tokenization (replace with actual Gemma tokenizer)
  private tokenize(text: string): number[] {
    // TODO: Integrate proper Gemma tokenizer
    // For now, return dummy tokens
    return text.split('').map((_, i) => i);
  }

  private detokenize(tokens: number[]): string {
    // TODO: Integrate proper Gemma tokenizer
    // For now, return placeholder
    return 'TensorRT-Triton response (tokenizer integration pending)';
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up TensorRT-Triton client');
  }
}
"@

Set-Content -Path "src\lib\services\providers\tensorrt-triton\triton-client.ts" -Value $tritonClient
Write-Host "  ✅ Created: tensorrt-triton/triton-client.ts" -ForegroundColor Green

# Summary
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Reorganization Summary`n" -ForegroundColor Magenta

Write-Host "✅ Directories created:" -ForegroundColor Green
$directories | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }

Write-Host "`n✅ Type definitions created:" -ForegroundColor Green
Write-Host "   - src\lib\services\types\ai-provider.ts" -ForegroundColor Gray
Write-Host "   - src\lib\services\types\vector-search.ts" -ForegroundColor Gray

Write-Host "`n✅ Provider stubs created:" -ForegroundColor Green
Write-Host "   - providers/tensorrt-triton/triton-client.ts" -ForegroundColor Gray

Write-Host "`n🔄 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Update imports in existing files" -ForegroundColor Gray
Write-Host "   2. Move vLLM files to providers/vllm/ (if needed)" -ForegroundColor Gray
Write-Host "   3. Move OpenAI files to providers/openai/ (if needed)" -ForegroundColor Gray
Write-Host "   4. Create ai-service-orchestrator.ts" -ForegroundColor Gray
Write-Host "   5. Create vector-search-service.ts" -ForegroundColor Gray

Write-Host "`n═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
