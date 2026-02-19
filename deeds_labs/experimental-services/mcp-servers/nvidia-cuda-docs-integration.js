#!/usr/bin/env node

/**
 * NVIDIA CUDA C++ JSON Documentation Integration
 * Integrates with Context7 MCP server for GPU optimization documentation
 * Provides CUDA libraries, Tensor Core operations, and legal AI optimization docs
 */

const { MCPClient } = require('./mcp-context7-wrapper');
const fs = require('fs').promises;
const path = require('path');

class NVIDIACudaDocsClient {
  constructor() {
    this.mcpClient = new MCPClient({
      serverPath: './mcp-context7-wrapper.js',
      timeout: 15000
    });
    
    this.cudaLibraries = [
      'cuBLAS',
      'cuDNN', 
      'cuSPARSE',
      'cuFFT',
      'cuRAND',
      'Thrust',
      'CUB',
      'cuTENSOR',
      'TensorRT'
    ];
    
    this.legalAIOptimizations = [
      'tensor-cores-legal-text',
      'fp16-embedding-optimization',
      'batch-processing-rtx3060ti',
      'memory-management-legal-docs',
      'cuda-streams-embedding',
      'gpu-acceleration-nlp'
    ];
  }

  /**
   * Query NVIDIA documentation via Context7 MCP
   */
  async queryCudaDocumentation(query, options = {}) {
    try {
      const searchQuery = `NVIDIA CUDA C++ ${query} JSON documentation`;
      const mcpResponse = await this.mcpClient.query({
        query: searchQuery,
        format: 'json',
        maxResults: options.maxResults || 10,
        includeCode: true,
        language: 'cpp'
      });

      return {
        success: true,
        query: searchQuery,
        results: mcpResponse.results || [],
        documentation: this.extractCudaAPIs(mcpResponse.results),
        optimization_tips: this.generateOptimizationTips(query),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('CUDA documentation query failed:', error);
      return {
        success: false,
        query,
        error: error.message,
        fallback_docs: await this.getFallbackCudaDocs(query)
      };
    }
  }

  /**
   * Extract CUDA API information from documentation
   */
  extractCudaAPIs(results) {
    const apis = [];
    
    for (const result of results || []) {
      if (result.content) {
        // Look for CUDA API patterns
        const cudaPatterns = [
          /cuda\w+\(/gi,
          /cub::\w+/gi,
          /thrust::\w+/gi,
          /__global__\s+void\s+\w+/gi,
          /__device__\s+\w+/gi,
          /cudaMemcpy\w*/gi,
          /cudaMalloc\w*/gi
        ];

        const foundAPIs = [];
        for (const pattern of cudaPatterns) {
          const matches = result.content.match(pattern) || [];
          foundAPIs.push(...matches);
        }

        if (foundAPIs.length > 0) {
          apis.push({
            source: result.title || 'NVIDIA Documentation',
            url: result.url,
            apis: [...new Set(foundAPIs)], // Remove duplicates
            context: result.content.substring(0, 500),
            relevance: this.calculateRelevance(result.content, foundAPIs.length)
          });
        }
      }
    }

    return apis.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Calculate relevance score for legal AI optimization
   */
  calculateRelevance(content, apiCount) {
    let score = apiCount * 10; // Base score from API count

    // Boost score for legal AI relevant terms
    const legalTerms = ['embedding', 'tensor', 'batch', 'fp16', 'optimization', 'memory', 'performance'];
    for (const term of legalTerms) {
      const matches = (content.toLowerCase().match(new RegExp(term, 'g')) || []).length;
      score += matches * 5;
    }

    // Boost for RTX 3060 Ti specific optimizations
    if (content.toLowerCase().includes('tensor core')) score += 50;
    if (content.toLowerCase().includes('ampere')) score += 30;
    if (content.toLowerCase().includes('fp16') || content.toLowerCase().includes('half precision')) score += 40;

    return score;
  }

  /**
   * Generate optimization tips based on query
   */
  generateOptimizationTips(query) {
    const tips = [];
    const queryLower = query.toLowerCase();

    if (queryLower.includes('embedding') || queryLower.includes('text')) {
      tips.push({
        category: 'Text Embedding Optimization',
        tip: 'Use FP16 with autocast for RTX 3060 Ti Tensor Cores - up to 2x speedup for embedding generation',
        code_example: `
// Enable Tensor Core optimization
with torch.cuda.amp.autocast():
    embeddings = model.encode(texts, convert_to_tensor=True)
        `.trim()
      });
    }

    if (queryLower.includes('batch') || queryLower.includes('performance')) {
      tips.push({
        category: 'Batch Processing',
        tip: 'RTX 3060 Ti optimal batch size: 64-128 for legal document embeddings',
        code_example: `
// Optimal batching for RTX 3060 Ti
const int OPTIMAL_BATCH_SIZE = 128;
const int THREADS_PER_BLOCK = 256;
dim3 grid((batch_size + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK);
dim3 block(THREADS_PER_BLOCK);
        `.trim()
      });
    }

    if (queryLower.includes('memory')) {
      tips.push({
        category: 'Memory Management',
        tip: 'Use pinned memory and CUDA streams for async legal document processing',
        code_example: `
// Pinned memory for faster transfers
cudaHostAlloc((void**)&pinned_ptr, size, cudaHostAllocDefault);
cudaStream_t stream;
cudaStreamCreate(&stream);
cudaMemcpyAsync(gpu_ptr, pinned_ptr, size, cudaMemcpyHostToDevice, stream);
        `.trim()
      });
    }

    return tips;
  }

  /**
   * Get fallback CUDA documentation for common legal AI operations
   */
  async getFallbackCudaDocs(query) {
    const fallbackDocs = {
      'embedding': {
        title: 'CUDA Embedding Optimization',
        apis: ['cudaMemcpy', 'cublasSgemm', '__global__ embedding_kernel'],
        description: 'Legal document embedding with CUDA acceleration',
        example: `
__global__ void legal_embedding_kernel(float* texts, float* embeddings, int batch_size) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < batch_size) {
        // Process legal text embedding with Tensor Cores
        // Use FP16 operations for RTX 3060 Ti optimization
    }
}
        `.trim()
      },
      'tensor': {
        title: 'Tensor Core Operations',
        apis: ['wmma::load_matrix_sync', 'wmma::mma_sync', 'wmma::store_matrix_sync'],
        description: 'RTX 3060 Ti Tensor Core programming for legal AI',
        example: `
#include <mma.h>
using namespace nvcuda;

__global__ void tensor_core_legal_ai() {
    wmma::fragment<wmma::matrix_a, 16, 16, 16, wmma::half, wmma::row_major> a_frag;
    wmma::fragment<wmma::matrix_b, 16, 16, 16, wmma::half, wmma::col_major> b_frag;
    wmma::fragment<wmma::accumulator, 16, 16, 16, float> acc_frag;
    
    wmma::load_matrix_sync(a_frag, legal_text_matrix, 16);
    wmma::load_matrix_sync(b_frag, embedding_weights, 16);
    wmma::mma_sync(acc_frag, a_frag, b_frag, acc_frag);
}
        `.trim()
      },
      'optimization': {
        title: 'Legal AI GPU Optimization Patterns',
        apis: ['cudaStreamCreate', 'cudaEventRecord', 'cudaDeviceGetAttribute'],
        description: 'Performance optimization patterns for legal document processing',
        example: `
// Legal AI GPU optimization pattern
cudaStream_t embedding_stream, preprocessing_stream;
cudaStreamCreate(&embedding_stream);
cudaStreamCreate(&preprocessing_stream);

// Async legal document processing
preprocess_legal_docs<<<grid, block, 0, preprocessing_stream>>>(docs, processed_docs);
generate_embeddings<<<grid, block, 0, embedding_stream>>>(processed_docs, embeddings);
        `.trim()
      }
    };

    // Return most relevant fallback
    for (const [key, doc] of Object.entries(fallbackDocs)) {
      if (query.toLowerCase().includes(key)) {
        return doc;
      }
    }

    return fallbackDocs['optimization']; // Default fallback
  }

  /**
   * Get RTX 3060 Ti specific optimization documentation
   */
  async getRTXOptimizations() {
    const rtxOptimizations = {
      architecture: 'GA106 (Ampere)',
      cuda_cores: 3584,
      rt_cores: 28,
      tensor_cores: 112, // 2nd Gen RT Cores
      memory: '8GB GDDR6',
      memory_bandwidth: '448 GB/s',
      
      legal_ai_optimizations: [
        {
          name: 'FP16 Tensor Core Embeddings',
          speedup: '1.5-2x',
          description: 'Use half precision for legal text embeddings',
          implementation: `
// Enable FP16 Tensor Cores for legal embeddings
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

with torch.cuda.amp.autocast():
    legal_embeddings = model.encode(legal_texts, convert_to_tensor=True)
          `.trim()
        },
        {
          name: 'Optimal Batch Sizing',
          optimal_batch: 128,
          description: 'RTX 3060 Ti sweet spot for legal document batches',
          memory_usage: '~6GB for 128 legal documents (512 tokens each)'
        },
        {
          name: 'CUDA Streams',
          benefit: 'Overlap CPU preprocessing with GPU embedding',
          implementation: `
stream1 = torch.cuda.Stream()
stream2 = torch.cuda.Stream()

with torch.cuda.stream(stream1):
    batch1_embeddings = model.encode(legal_batch1)
    
with torch.cuda.stream(stream2):
    batch2_embeddings = model.encode(legal_batch2)
          `.trim()
        }
      ]
    };

    return rtxOptimizations;
  }

  /**
   * Query legal AI specific CUDA optimizations
   */
  async queryLegalAIOptimizations(optimization_type = 'all') {
    try {
      const results = {};

      if (optimization_type === 'all' || optimization_type === 'embedding') {
        results.embedding = await this.queryCudaDocumentation('text embedding tensor cores legal documents');
      }

      if (optimization_type === 'all' || optimization_type === 'memory') {
        results.memory = await this.queryCudaDocumentation('GPU memory optimization legal AI batch processing');
      }

      if (optimization_type === 'all' || optimization_type === 'performance') {
        results.performance = await this.queryCudaDocumentation('CUDA performance optimization RTX 3060 Ti');
      }

      // Add RTX-specific optimizations
      results.rtx_optimizations = await this.getRTXOptimizations();

      return {
        success: true,
        optimization_type,
        legal_ai_docs: results,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Legal AI optimization query failed:', error);
      return {
        success: false,
        error: error.message,
        fallback_optimizations: await this.getRTXOptimizations()
      };
    }
  }

  /**
   * Generate CUDA C++ code template for legal AI operations
   */
  async generateCudaTemplate(operation_type) {
    const templates = {
      'legal_embedding': `
// Legal Document Embedding CUDA Kernel (RTX 3060 Ti Optimized)
#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <mma.h>

__global__ void legal_embedding_kernel(
    const half* __restrict__ legal_texts,
    half* __restrict__ embeddings,
    const int batch_size,
    const int sequence_length,
    const int embedding_dim
) {
    // Use Tensor Cores for legal text processing
    using namespace nvcuda;
    
    int batch_idx = blockIdx.x;
    int thread_idx = threadIdx.x;
    
    if (batch_idx < batch_size) {
        // RTX 3060 Ti optimized embedding computation
        // Process legal document with FP16 precision
        
        extern __shared__ half shared_memory[];
        
        // Load legal text data into shared memory
        for (int i = thread_idx; i < sequence_length; i += blockDim.x) {
            shared_memory[i] = legal_texts[batch_idx * sequence_length + i];
        }
        
        __syncthreads();
        
        // Compute embeddings using Tensor Cores
        // ... embedding computation logic ...
        
        // Store results
        if (thread_idx < embedding_dim) {
            embeddings[batch_idx * embedding_dim + thread_idx] = 
                /* computed embedding value */;
        }
    }
}
      `.trim(),

      'legal_similarity': `
// Legal Document Similarity CUDA Kernel
__global__ void legal_similarity_kernel(
    const float* __restrict__ doc_embeddings,
    const float* __restrict__ query_embedding,
    float* __restrict__ similarities,
    const int num_docs,
    const int embedding_dim
) {
    int doc_idx = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (doc_idx < num_docs) {
        float similarity = 0.0f;
        
        // Compute cosine similarity for legal documents
        for (int i = 0; i < embedding_dim; i++) {
            similarity += doc_embeddings[doc_idx * embedding_dim + i] * 
                         query_embedding[i];
        }
        
        similarities[doc_idx] = similarity;
    }
}
      `.trim(),

      'legal_batch_processing': `
// Legal Document Batch Processing (RTX 3060 Ti Optimized)
class LegalDocumentProcessor {
private:
    cudaStream_t embedding_stream;
    cudaStream_t preprocessing_stream;
    
    // Pinned memory for faster transfers
    half* h_legal_texts;
    half* d_legal_texts;
    half* d_embeddings;
    
public:
    LegalDocumentProcessor(int max_batch_size, int max_seq_len) {
        // Initialize CUDA streams for async processing
        cudaStreamCreate(&embedding_stream);
        cudaStreamCreate(&preprocessing_stream);
        
        // Allocate pinned memory
        size_t text_size = max_batch_size * max_seq_len * sizeof(half);
        cudaHostAlloc((void**)&h_legal_texts, text_size, cudaHostAllocDefault);
        cudaMalloc((void**)&d_legal_texts, text_size);
        
        // Set RTX 3060 Ti optimal configuration
        cudaDeviceSetCacheConfig(cudaFuncCachePreferL1);
    }
    
    void processLegalBatch(const std::vector<std::string>& legal_docs) {
        // Optimal batch size for RTX 3060 Ti
        const int OPTIMAL_BATCH = 128;
        const int THREADS_PER_BLOCK = 256;
        
        dim3 grid((legal_docs.size() + OPTIMAL_BATCH - 1) / OPTIMAL_BATCH);
        dim3 block(THREADS_PER_BLOCK);
        
        // Launch legal embedding kernel
        legal_embedding_kernel<<<grid, block, 
            THREADS_PER_BLOCK * sizeof(half), embedding_stream>>>(
            d_legal_texts, d_embeddings, 
            legal_docs.size(), MAX_SEQ_LEN, EMBEDDING_DIM
        );
    }
};
      `.trim()
    };

    return templates[operation_type] || templates['legal_embedding'];
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const query = args[1];

  const client = new NVIDIACudaDocsClient();

  try {
    switch (command) {
      case 'query':
        if (!query) {
          console.error('Usage: node nvidia-cuda-docs-integration.js query "your query"');
          process.exit(1);
        }
        const result = await client.queryCudaDocumentation(query);
        console.log(JSON.stringify(result, null, 2));
        break;

      case 'legal-ai':
        const optimization_type = query || 'all';
        const legalResult = await client.queryLegalAIOptimizations(optimization_type);
        console.log(JSON.stringify(legalResult, null, 2));
        break;

      case 'template':
        const operation = query || 'legal_embedding';
        const template = await client.generateCudaTemplate(operation);
        console.log(template);
        break;

      case 'rtx':
        const rtxOptims = await client.getRTXOptimizations();
        console.log(JSON.stringify(rtxOptims, null, 2));
        break;

      default:
        console.log(`
NVIDIA CUDA C++ Documentation Integration for Legal AI

Usage:
  node nvidia-cuda-docs-integration.js query "tensor cores embedding"
  node nvidia-cuda-docs-integration.js legal-ai [embedding|memory|performance|all]
  node nvidia-cuda-docs-integration.js template [legal_embedding|legal_similarity|legal_batch_processing]
  node nvidia-cuda-docs-integration.js rtx

Examples:
  node nvidia-cuda-docs-integration.js query "cuBLAS legal document processing"
  node nvidia-cuda-docs-integration.js legal-ai embedding
  node nvidia-cuda-docs-integration.js template legal_embedding
        `);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { NVIDIACudaDocsClient };

// Run CLI if executed directly
if (require.main === module) {
  main();
}