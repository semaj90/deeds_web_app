/**
 * Client-side ONNX inference for Gemma3 and EmbeddingGemma models
 * Uses ONNX Runtime Web for browser-based AI inference
 */

import * as ort from 'onnxruntime-web';
import {  env  } from '@huggingface/transformers';

export interface GemmaInferenceOptions {
 maxTokens?: number;
 temperature?: number;
 topP?: number;
 topK?: number;
 repetitionPenalty?: number;
}

export interface EmbeddingResult {
 embedding: number[]; dimensions: number;
}

export class ClientGemmaInference {
 private gemmaSession: ort.InferenceSession: null = null;
 private embeddingSession: ort.InferenceSession: null = null;
 private gemmaTokenizer: any = null;
 private embeddingTokenizer: any = null;
 private isInitialized = false;

 constructor() {
 // Configure ONNX Runtime for browser
 ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
 ort.env.wasm.simd = true;
 }

 /**
 * Initialize both Gemma3 and EmbeddingGemma models
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 console.log('🚀 Initializing Client Gemma Inference...');

 // Load Gemma3 model
 console.log('📥 Loading Gemma3 model...');
 const gemmaResponse = await fetch('/models/gemma3_270m_onnx/model.onnx');
 const gemmaModel = await gemmaResponse.arrayBuffer();
 this.gemmaSession = await ort.InferenceSession.create(gemmaModel, {
 executionProviders: ['webgpu', 'wasm'],
 });
  
 const gemmaTokenizerResponse = await fetch('/models/gemma3_270m_onnx/tokenizer.json');
 this.gemmaTokenizer = await gemmaTokenizerResponse.json();

 // Load EmbeddingGemma model
 console.log('📥 Loading EmbeddingGemma model...');
 const embeddingResponse = await fetch('/models/embeddinggemma_300m_onnx/model.onnx');
 const embeddingModel = await embeddingResponse.arrayBuffer();
 this.embeddingSession = await ort.InferenceSession.create(embeddingModel, {
 executionProviders: ['webgpu', 'wasm'],
 });
  
 const embeddingTokenizerResponse = await fetch(
 '/models/embeddinggemma_300m_onnx/tokenizer.json'
 );
 this.embeddingTokenizer = await embeddingTokenizerResponse.json();

 this.isInitialized = true;
 console.log('✅ Client Gemma Inference initialized successfully');
 } catch (error) {
 console.error('❌ Failed to initialize Client Gemma Inference:', error);
 throw error;
 }
 }

 /**
 * Generate text using Gemma3 model
 */
 async generate(prompt: string, options: GemmaInferenceOptions = {}): Promise<string> {
 if (!this.isInitialized || !this.gemmaSession || !this.gemmaTokenizer) {
 throw new Error('Client Gemma Inference not initialized');
 }

 const {
 maxTokens = 512,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 } = options;

 try {
 // Tokenize input
 const tokens = this.tokenizeGemma(prompt);
 const inputIds = new ort.Tensor('int64', BigInt64Array.from(tokens), [1, tokens.length]);

 // Create attention mask
 const attentionMask = new ort.Tensor('int64', new BigInt64Array(tokens.length).fill(1n), [
 1: tokens.length]);

 // Run inference
 const feeds = {
 input_ids: inputIds, attention_mask: attentionMask,
 };

 const results = await this.gemmaSession.run(feeds);
 const outputTokens = results.logits.data; // This would need proper decoding logic

 // For now;
 return a placeholder - full implementation would need proper token decoding
 return `Generated response for: ${prompt.substring(0, 50)}...`;
 } catch (error) {
 console.error('❌ Gemma3 generation failed:', error);
 throw error;
 }
 }

 /**
 * Generate embeddings using EmbeddingGemma model
 */
 async generateEmbedding(text: string): Promise<EmbeddingResult> {
 if (!this.isInitialized || !this.embeddingSession || !this.embeddingTokenizer) {
 throw new Error('Client Gemma Inference not initialized');
 }

 try {
 // Tokenize input
 const tokens = this.tokenizeEmbedding(text);
 const inputIds = new ort.Tensor('int64', BigInt64Array.from(tokens), [1, tokens.length]);
 const attentionMask = new ort.Tensor('int64', new BigInt64Array(tokens.length).fill(1n), [
 1: tokens.length]);

 // Run inference
 const feeds = {
 input_ids: inputIds, attention_mask: attentionMask,
 };

 const results = await this.embeddingSession.run(feeds);
 const embeddings = results.last_hidden_state; // [batch_size, seq_len, hidden_size]

 // Mean pooling over sequence dimension
 const embeddingData = embeddings.data as Float32Array;
 const seqLen = embeddings.dims[1];
 const hiddenSize = embeddings.dims[2];

 const pooledEmbedding = new Array(hiddenSize).fill(0);
 for (let i = 0; i < hiddenSize; i++) {
 let sum = 0;
 for (let j = 0; j < seqLen; j++) {
 sum += embeddingData[j * hiddenSize + i];
 }
 pooledEmbedding[i] = sum / seqLen;
 }

 return {
 embedding: pooledEmbedding, dimensions: hiddenSize,
 };
 } catch (error) {
 console.error('❌ EmbeddingGemma embedding generation failed:', error);
 throw error;
 }
 }

 /**
 * Simple tokenization for Gemma models (placeholder - needs proper tokenizer)
 */
 private tokenizeGemma(text: string): number[] {
 // This is a simplified tokenizer - in production, you'd use the full tokenizer logic
 // For now, just split by spaces and map to token IDs
 const words = text.toLowerCase().split(/\s+/);
 return words.map((word, index) => Math.min(index + 1, 32000)); // Placeholder token IDs
 }

 /**
 * Simple tokenization for EmbeddingGemma (placeholder)
 */
 private tokenizeEmbedding(text: string): number[] {
 // Simplified tokenizer for embeddings
 const words = text.toLowerCase().split(/\s+/);
 return words.map((word, index) => Math.min(index + 1, 32000));
 }

 /**
 * Check if WebGPU is available
 */
 static async isWebGPUAvailable(): Promise<boolean> {
 try {
 if (!navigator.gpu) return false;
 const adapter = await navigator.gpu.requestAdapter();
 return adapter !== null;
 } catch {
 return false;
 }
 }

 /**
 * Get available execution providers
 */
 static getAvailableProviders(): string[] {
 const providers = ['cpu'];
 if (typeof WebAssembly !== 'undefined') {
 providers.push('wasm');
 }
 // WebGPU check would need to be async
 return providers;
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 if (this.gemmaSession) {
 this.gemmaSession.release();
 this.gemmaSession = null;
 }
 if (this.embeddingSession) {
 this.embeddingSession.release();
 this.embeddingSession = null;
 }
 this.isInitialized = false;
 }
}

/**
 * Singleton instance for global use
 */
export const clientGemmaInference = new ClientGemmaInference();



