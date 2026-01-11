import * as ort from 'onnxruntime-web';

/**
 * Client-side EmbeddingGemma service using ONNX Runtime Web
 * Runs EmbeddingGemma 300M ONNX model directly in the browser for embeddings
 */
export class ClientEmbeddingGemma {
 private session: ort.InferenceSession | null = null;
 private tokenizer: any = null;
 private isInitialized = false;

 private modelPath = '/models/embeddinggemma_300m_onnx/model.onnx';
 private tokenizerPath = '/models/embeddinggemma_300m_onnx/tokenizer.json';
 private configPath = '/models/embeddinggemma_300m_onnx/tokenizer_config.json';

 /**
 * Initialize the ONNX Runtime session and tokenizer
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 console.log('🔄 Loading EmbeddingGemma ONNX model...');

 // Configure ONNX Runtime for WebGPU if available, fallback to WebAssembly
 const options: ort.InferenceSession.SessionOptions = {
 executionProviders: [
 { name: 'webgpu' },
 { name: 'wasm' }
 ],
 graphOptimizationLevel: 'all',
 enableCpuMemArena: true,
 enableMemPattern: true,
 executionMode: 'sequential',
 }; // Load model
 const modelResponse = await fetch(this.modelPath);
 const modelArrayBuffer = await modelResponse.arrayBuffer();
 this.session = await ort.InferenceSession.create(modelArrayBuffer, options);

 console.log('✅ EmbeddingGemma model loaded');

 // Load tokenizer config
 const configResponse = await fetch(this.configPath);
 const tokenizerConfig = await configResponse.json();

 // Load tokenizer JSON
 const tokenizerResponse = await fetch(this.tokenizerPath);
 const tokenizerData = await tokenizerResponse.json();

 // Create simple tokenizer
 this.tokenizer = new SimpleTokenizer(tokenizerData, tokenizerConfig);

 this.isInitialized = true;
 console.log('✅ ClientEmbeddingGemma initialized');
 } catch (error) {
 console.error('❌ Failed to initialize ClientEmbeddingGemma:', error);
 throw error;
 }
 }

 /**
 * Generate embeddings for input texts
 */
 async generateEmbeddings(
 texts: string | string[],
 options: {
 normalize?: boolean;
 maxLength?: number;
 } = {}
 ): Promise<{ embeddings: number[][]; model: string; dimension: number; count: number;
 }> {
 if (!this.isInitialized || !this.session || !this.tokenizer) {
 await this.initialize();
 }

 const { normalize = true, maxLength = 512 } = options;

 if (!this.session || !this.tokenizer) {
 throw new Error('ClientEmbeddingGemma not properly initialized');
 }

 try {
 // Ensure texts is an array
 const textArray = Array.isArray(texts) ? texts : [texts];

 console.log(`🎯 Generating embeddings for ${textArray.length} text(s)...`);

 const embeddings: number[][] = [];

 for (const text of textArray) {
 // Tokenize
 const encoded = this.tokenizer.encode(text, maxLength);

 // Create tensors
 const inputIdsTensor = new ort.Tensor('int64', encoded.input_ids, [
 1, encoded.input_ids.length,
 ]);
 const attentionMaskTensor = new ort.Tensor('int64', encoded.attention_mask, [
 1, encoded.attention_mask.length,
 ]);

 // Run inference
 const feeds = {
 input_ids: inputIdsTensor,
 attention_mask: attentionMaskTensor,
 };

 const results = await this.session.run(feeds);

 // Get embeddings (assuming output name is 'last_hidden_state' or similar)
 const outputNames = Object.keys(results);
 const outputName = outputNames.find((name) => name.includes('hidden')) || outputNames[0];
 const outputTensor = results[outputName];

 if (!outputTensor) {
 throw new Error(
 `No valid output tensor found. Available outputs: ${outputNames.join(', ')}`
 );
 }

 // Extract and pool embeddings
 const embedding = this.poolEmbeddings(outputTensor, encoded.attention_mask);

 // Normalize if requested
 const finalEmbedding = normalize ? this.normalizeEmbedding(embedding) : embedding;

 embeddings.push(finalEmbedding);
 }

 return {
 embeddings,
 model: 'embeddinggemma_300m_onnx',
 dimension: embeddings[0]?.length || 0,
 count: embeddings.length,
 };
 } catch (error) {
 console.error('❌ Embedding generation failed:', error);
 throw error;
 }
 }

 /**
 * Pool embeddings using attention mask for proper mean pooling
 */
 private poolEmbeddings(outputTensor: ort.Tensor, attentionMask: number[]): number[] {
		const data = outputTensor.data as Float32Array;
		const [batchSize, seqLen, hiddenSize] = outputTensor.dims as unknown as [number, number, number];

		// Mean pool with attention mask
 const pooled = new Array(hiddenSize).fill(0);
 let validTokens = 0;

 for (let seq = 0; seq < seqLen; seq++) {
 if (attentionMask[seq] === 1) {
 // Only consider non-padded tokens
 for (let dim = 0; dim < hiddenSize; dim++) {
 pooled[dim] += data[seq * hiddenSize + dim];
 }
 validTokens++;
 }
 }

 // Average
 if (validTokens > 0) {
 for (let dim = 0; dim < hiddenSize; dim++) {
 pooled[dim] /= validTokens;
 }
 }

 return pooled;
 }

 /**
 * L2 normalize embedding
 */
 private normalizeEmbedding(embedding: number[]): number[] {
 const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
 if (norm > 0) {
 return embedding.map((val) => val / norm);
 }
 return embedding;
 }

 /**
 * Check if service is ready
 */
 isReady(): boolean {
 return this.isInitialized && this.session !== null && this.tokenizer !== null;
 }

 /**
 * Get model information
 */
 getModelInfo(): any {
 return {
 model: 'EmbeddingGemma 300M',
 format: 'ONNX',
 dimension: 768,
 maxLength: 512,
 quantization: 'FP16',
 size: '~291MB',
 providers: [], // this.session?.getProviders?.() || [],
 };
 }
}/**
 * Simple tokenizer for EmbeddingGemma
 * Basic implementation - in production, use proper tokenizer
 */
class SimpleTokenizer {
 constructor(
 private vocab: any,
 private config: any
 ) {}

 encode(
 text: string,
 maxLength: number = 512
 ): { input_ids: BigInt64Array; attention_mask: number[] } {
 // Very basic tokenization - replace with proper implementation
 const words = text
 .toLowerCase()
 .split(/\s+/)
 .slice(0, maxLength - 2); // Leave room for BOS/EOS

 const tokens: number[] = [this.config.bos_token_id || 2]; // BOS

 for (const word of words) {
 // Simple hash-based tokenization
 let hash = 0;
 for (let i = 0; i < word.length; i++) {
 hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
 }
 const tokenId = (Math.abs(hash) % 250000) + 1000; // Avoid special tokens
 tokens.push(tokenId);
 }

 tokens.push(this.config.eos_token_id || 1); // EOS

 // Pad/truncate
 const attentionMask = new Array(tokens.length).fill(1);
 while (tokens.length < maxLength) {
 tokens.push(this.config.pad_token_id || 0);
 attentionMask.push(0);
 }

 if (tokens.length > maxLength) {
 tokens.splice(maxLength);
 attentionMask.splice(maxLength);
 }

 return {
 input_ids: new BigInt64Array(tokens.map((t) => BigInt(t), attention_mask: attentionMask,
 };
 }
}

// Singleton instance
let clientEmbeddingGemma: ClientEmbeddingGemma | null = null;

export function getClientEmbeddingGemma(): ClientEmbeddingGemma {
 if (!clientEmbeddingGemma) {
 clientEmbeddingGemma = new ClientEmbeddingGemma();
 }
 return clientEmbeddingGemma;
}

// Utility functions
export function cosineSimilarity(a: number[], b: number[]): number {
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

export function findSimilar(
 queryEmbedding: number[],
 embeddings: number[][],
 topK: number = 5
): { index: number; similarity: number }[] {
 const similarities = embeddings.map((emb, index) => ({
 index,
 similarity: cosineSimilarity(queryEmbedding, emb),
 }));

 return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}



