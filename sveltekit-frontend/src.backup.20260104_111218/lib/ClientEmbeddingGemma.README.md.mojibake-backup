# Client-Side EmbeddingGemma Implementation

This implementation enables running Google's EmbeddingGemma 300M model directly in the browser using ONNX Runtime Web with WebGPU acceleration.

## Features

- **Browser-Native**: No server required - runs entirely in the browser
- **WebGPU Accelerated**: Uses GPU acceleration when available
- **WebAssembly Fallback**: Falls back to CPU inference on unsupported devices
- **Legal Document Optimized**: Pre-trained for legal text embeddings
- **Semantic Search**: Built-in similarity search for legal documents

## Architecture

```
Browser Client
├── ClientEmbeddingGemma.ts (Main service)
├── SimpleTokenizer.ts (Lightweight tokenization)
├── ONNX Runtime Web (Inference engine)
└── Static Assets (/static/models/embeddinggemma_300m_onnx/)
    ├── model.onnx (291MB quantized model)
    ├── tokenizer.json (HuggingFace tokenizer config)
    └── special_tokens_map.json
```

## Usage

### Basic Setup

```typescript
import { getClientEmbeddingGemma } from '$lib/ClientEmbeddingGemma';

// Get singleton instance
const embeddingService = getClientEmbeddingGemma();

// Initialize (loads ~291MB model)
await embeddingService.initialize();

// Check if ready
if (embeddingService.isReady()) {
  // Service is ready for inference
}
```

### Generate Embeddings

```typescript
// Single text
const result = await embeddingService.generateEmbeddings([
  "This contract establishes binding legal obligations."
], {
  normalize: true,    // L2 normalize vectors
  maxLength: 512     // Maximum token length
});

console.log(result.embeddings[0]); // 384-dimensional vector
```

### Semantic Search

```typescript
import { findSimilar, cosineSimilarity } from '$lib/ClientEmbeddingGemma';

// Generate embeddings for document collection
const docEmbeddings = await embeddingService.generateEmbeddings(documents);

// Find similar documents to a query
const queryEmbedding = await embeddingService.generateEmbeddings([query]);
const similarities = findSimilar(
  queryEmbedding.embeddings[0],
  docEmbeddings.embeddings,
  5  // Top 5 results
);

// Results include index and similarity score
similarities.forEach(sim => {
  console.log(`Document ${sim.index}: ${sim.similarity * 100}% similar`);
});
```

## Model Details

- **Model**: EmbeddingGemma 300M
- **Dimension**: 384
- **Quantization**: INT8 (optimized for browser)
- **Size**: ~291MB ONNX file
- **Tokenization**: HuggingFace tokenizer (simplified for browser)
- **Pooling**: Mean pooling over sequence

## Browser Compatibility

- **WebGPU**: Chrome 113+, Edge 113+ (GPU acceleration)
- **WebAssembly**: All modern browsers (CPU fallback)
- **SharedArrayBuffer**: Required for WebGPU (cross-origin isolation needed)

## Performance

- **Initialization**: ~10-30 seconds (model download + compilation)
- **Inference**: ~50-200ms per document (depends on length)
- **Memory**: ~500MB peak during inference
- **GPU Memory**: ~300MB for WebGPU execution

## Demo

Visit `/dev/client-embedding-gemma` to see a live demo with:
- Legal document collection
- Real-time embedding generation
- Semantic similarity search
- Performance metrics

## Integration with Gemma3

This complements the existing Gemma3 client-side implementation:

```typescript
// Use EmbeddingGemma for semantic search
const embeddings = await embeddingService.generateEmbeddings([query]);
const similarDocs = findSimilar(embeddings.embeddings[0], docCollection);

// Use Gemma3 for generation
const response = await gemma3Service.generate({
  prompt: `Answer based on these documents: ${similarDocs.join(' ')}`,
  context: query
});
```

## Limitations

- **Model Size**: Large download (~291MB) on first use
- **Memory Usage**: Requires ~500MB RAM for inference
- **Tokenization**: Simplified tokenizer (may not handle all edge cases)
- **Precision**: INT8 quantization may reduce accuracy slightly
- **Browser Support**: WebGPU not available in all browsers

## Future Improvements

- **Progressive Loading**: Stream model chunks for faster startup
- **WebNN Support**: Additional execution provider for better compatibility
- **Advanced Tokenization**: Full HuggingFace tokenizer in browser
- **Quantization Options**: Multiple precision levels (FP16, INT4)
- **Batch Processing**: Optimize for multiple documents
- **Caching**: Persistent model caching across sessions