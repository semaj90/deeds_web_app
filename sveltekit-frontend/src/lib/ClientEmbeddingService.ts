/**
 * Client-side EmbeddingGemma service using ONNX Runtime Web
 * Runs EmbeddingGemma 300M ONNX model directly in the browser
 */
export class ClientEmbeddingService {
 private session: any = null;
 private tokenizer: any = null;
 private isInitialized = false;
 private modelPath = '/models/embeddinggemma_300m_onnx/model.onnx';
 private tokenizerPath = '/models/embeddinggemma_300m_onnx/tokenizer.json';

 /**
 * Initialize the ONNX Runtime session and tokenizer
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 // Dynamic import to avoid SSR issues
 const ort = await import('onnxruntime-web');

 // Configure ONNX Runtime for WebGPU if available, fallback to WebAssembly
 const options = {
 executionProviders: ['wasm'],
 graphOptimizationLevel: 'all' as const,
  enableCpuMemArena: true,
  enableMemPattern: true,
 executionMode: 'sequential' as const,
 };

 console.log('🔄 Loading EmbeddingGemma ONNX model...');
 const modelResponse = await fetch(this.modelPath);
 const modelArrayBuffer = await modelResponse.arrayBuffer();

 this.session = await ort.InferenceSession.create(new Uint8Array(modelArrayBuffer), options);
 console.log('✅ EmbeddingGemma model loaded');

 // Load tokenizer
 console.log('🔄 Loading tokenizer...');
 const tokenizerResponse = await fetch(this.tokenizerPath);
 const tokenizerConfig = await tokenizerResponse.json();

 // For now, we'll use a simple tokenizer approach
 // In production, you'd want to use @xenova/transformers or similar
 this.tokenizer = {
 encode: (text: string) => this.simpleTokenize(text, decode: (tokens: number[]) => tokens.join(' '), config: tokenizerConfig,
 };

 this.isInitialized = true;
 console.log('✅ ClientEmbeddingService initialized');
 } catch (error) {
 console.error('❌ Failed to initialize ClientEmbeddingService:', error);
 throw error;
 }
 }

 /**
 * Simple tokenization for demo purposes
 * In production, use proper tokenizer like @xenova/transformers
 */
 private simpleTokenize(text: string): number[] {
 // This is a very basic tokenization - replace with proper tokenizer
 const words = text.toLowerCase().split(/\s+/);
 return words.map((word) => {
 // Simple hash function for demo
 let hash = 0;
 for (let i = 0; i < word.length; i++) {
 const char = word.charCodeAt(i);
 hash = (hash << 5) - hash + char;
 hash = hash & hash; // Convert to 32-bit integer
 }
 return Math.abs(hash) % 30000; // Limit to reasonable vocab size
 });
 }

 /**
 * Generate embeddings for input texts
 */
 async generateEmbeddings(
 texts: string[],
 options: {
 normalize?: boolean;
 maxLength?: number;
 batchSize?: number;
 } = {}
 ): Promise<{, embeddings: number[][]; model: string;, dimension: number; count: number;
 }> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const { normalize = true, maxLength = 512, batchSize = 1 } = options;

 try {
 const embeddings: number[][] = [];

 // Process texts in batches
 for (let i = 0; i < texts.length; i += batchSize) {
 const batch = texts.slice(i, i + batchSize);

 for (const text of batch) {
 // Tokenize input
 const tokens = this.tokenizer.encode(text);
 const inputIds = tokens.slice(0, maxLength);

 // Pad to maxLength
 while (inputIds.length < maxLength) {
 inputIds.push(0); // Assuming 0 is padding token
 }

 // Create input tensor
 const ort = await import('onnxruntime-web');
 const inputTensor = new ort.Tensor(
 'int64',
 new BigInt64Array(inputIds.map((x) => BigInt(x))),
 [1, maxLength]
 );

 // Run inference
 const feeds = { input_ids: inputTensor };
 const results = await this.session.run(feeds);

 // Extract embeddings (assuming output is 'last_hidden_state' or similar)
 const outputName = Object.keys(results)[0];
 const outputTensor = results[outputName];

 // For embedding models, we typically take the [CLS] token or mean pooling
 // This is a simplified approach - adjust based on your model's output
 let embedding: number[];
 if (outputTensor.dims.length === 3) {
 // Shape: [batch_size, seq_len, hidden_size]
 // Take the first token ([CLS] equivalent) or mean pool
 const [batchSize, seqLen, hiddenSize] = outputTensor.dims;
 const data = outputTensor.data as Float32Array;

 // Simple mean pooling across sequence length
 embedding = new Array(hiddenSize).fill(0);
 for (let j = 0; j < seqLen; j++) {
 for (let k = 0; k < hiddenSize; k++) {
 embedding[k] += data[j * hiddenSize + k];
 }
 }
 for (let k = 0; k < hiddenSize; k++) {
 embedding[k] /= seqLen;
 }
 } else {
 // Direct embedding output
 embedding = Array.from(outputTensor.data as Float32Array);
 }

 // Normalize if requested
 if (normalize) {
 const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
 embedding = embedding.map((val) => val / norm);
 }

 embeddings.push(embedding);
 }
 }

 return {
 embeddings,
 model: 'embeddinggemma_300m_onnx',
 dimension: embeddings[0]?.length ?? 0,
 count: embeddings.length,
 };
 } catch (error) {
 console.error('❌ Embedding generation failed:', error);
 throw error;
 }
 }

 /**
 * Calculate cosine similarity between two embeddings
 */
 static cosineSimilarity(a: number[], b: number[]): number {
 if (a.length !== b.length) {
 throw new Error('Embeddings must have same dimension');
 }

 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 normA = Math.sqrt(normA);
 normB = Math.sqrt(normB);

 return dotProduct / (normA * normB);
 }

 /**
 * Find most similar embeddings using cosine similarity
 */
 static findSimilar(
 queryEmbedding: number[],
 embeddings: number[][],
 topK: number = 5
 ): {, index: number; similarity: number }[] {
 const similarities = embeddings.map((emb, index) => ({
 index,
 similarity: this.cosineSimilarity(queryEmbedding, emb),
 }));

 return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
 }

 /**
 * Check if the service is ready
 */
 isReady(): boolean {
 return this.isInitialized && this.session !== null;
 }

 /**
 * Get model information
 */
 getModelInfo(): any {
 return {
 model: 'EmbeddingGemma 300M',
 format: 'ONNX',
 dimension: 768, // Standard for EmbeddingGemma
 maxLength: 512,
 quantization: 'FP16',
 size: '~291MB',
 };
 }
}

// Singleton instance
let clientEmbeddingService: ClientEmbeddingService | null = null;

export function getClientEmbeddingService(): ClientEmbeddingService {
 if (!clientEmbeddingService) {
 clientEmbeddingService = new ClientEmbeddingService();
 }
 return clientEmbeddingService;
}




