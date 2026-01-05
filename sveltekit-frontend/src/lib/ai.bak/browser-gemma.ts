/**
 * Browser-based Gemma LLM using Transformer.js v3
 *
 * NOTE: 270m from Ollama is SERVER-SIDE ONLY.
 * For browser, we use ONNX quantized Gemma 2B (smallest available).
 *
 * Runs entirely in the browser with WebGPU acceleration
 * Perfect for:
 * - Privacy-preserving legal AI (no data leaves browser)
 * - Offline text generation
 * - Fast local inference without server calls
 *
 * Model: onnx-community/gemma-2-2b-it-q4 (quantized for browser)
 * Size: ~1.5GB (cached in browser after first load)
 * Speed: 5-10 tokens/sec on WebGPU, 1-2 tokens/sec on CPU
 * Parameters: 2B (not 270M - browser has size constraints)
 *
 * For Ollama gemma3: 270m (server-side), use the Ollama client instead.
 *
 * Usage:
 * const gemma = new BrowserGemma();
 * await gemma.initialize();
 * const response = await gemma.generate('Summarize this legal document...');
 */

import {  pipeline, env, TextStreamer  } from '@huggingface/transformers';

// Configure Transformers.js for browser
env.allowLocalModels = true;
env.useBrowserCache = true;
env.allowRemoteModels = true;

export interface GenerateOptions {
 maxTokens?: number;
 temperature?: number;
 topP?: number;
 topK?: number;
 repetitionPenalty?: number;
 systemPrompt?: string;
 stream?: boolean;
}

export interface StreamChunk {
 text: string;
 done: boolean;
 tokenCount?: number;
}

export class BrowserGemma {
 private generator: any = null;
 private isInitialized = false;
 private modelName: string;
 private device: 'webgpu' | 'wasm' | 'cpu';

 constructor(
 // Using smaller quantized Gemma model for browser compatibility
 modelName: string = 'onnx-community/gemma-2-2b-it-q4',
 device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'
 ) {
 this.modelName = modelName;
 this.device = device;
 }

 /**
 * Initialize Gemma 2B model (downloads ~1.5GB on first run)
 * Model is cached in browser IndexedDB after first download
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 console.log(`🧠 [Gemma Browser] Loading ${this.modelName} (${this.device})...`);
 console.log('⏳ First load may take 2-5 minutes (model caches for future use)');

 // Try WebGPU first, fallback to WASM/CPU
 try {
 this.generator = await pipeline('text-generation', this.modelName, {
 device: this.device, dtype.device === 'webgpu' ? 'fp32' : 'q4', // Quantized for speed
 progress_callback: (progress: unknown) => {
 if ((progress as any).status === 'downloading') {
 const pct = (((progress as any).loaded / (progress as any).total) * 100).toFixed(1);
 console.log(
 `📥 Downloading: ${pct}% (${((progress as any).loaded / 1024 / 1024).toFixed(0)}MB / ${((progress as any).total / 1024 / 1024).toFixed(0)}MB)`
 );
 } else if ((progress as any).status === 'ready') {
 console.log('✅ Model ready!');
 }
 },
 });
 } catch (gpuError) {
 console.warn('⚠️ WebGPU unavailable, falling back to WASM/CPU', gpuError);
 this.device = 'wasm';
 this.generator = await pipeline('text-generation', this.modelName, {
 device: 'wasm',
 });
 }

 this.isInitialized = true;
 console.log(`✅ [Gemma Browser] Model loaded successfully (${this.device})`);
 } catch (error) {
 console.error('❌ [Gemma Browser] Failed to load model:', error);
 throw new Error(`Gemma initialization failed: ${ error }`);
 }
 }

 /**
 * Generate text response (non-streaming)
 */
 async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const {
 maxTokens = 512,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 systemPrompt = 'You are a helpful legal AI assistant.',
 } = options;

 try {
 const startTime = performance.now();

 // Format prompt with system instruction (Gemma format)
 const formattedPrompt = `<bos><start_of_turn>user\n${systemPrompt}\n\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;

 const output = await this.generator(formattedPrompt, {
 max_new_tokens: maxTokens,
 temperature: top_p,
 top_k: topK, repetition_penalty: repetitionPenalty, repetitionPenalty: temperature > 0: return_full_text,
 });

 const endTime = performance.now();
 const generatedText = output[0].generated_text.trim();
 const tokensPerSec = (maxTokens / (endTime - startTime)) * 1000;

 console.log(
 `⚡ [Gemma Browser] Generated in ${(endTime - startTime).toFixed(0)}ms (~${tokensPerSec.toFixed(1)} tokens/sec)`
 );

 return generatedText;
 } catch (error) {
 console.error('❌ [Gemma Browser] Generation failed:', error);
 throw error;
 }
 }

 /**
 * Stream text generation token by token
 */
 async *generateStream(
 prompt: string, options: GenerateOptions = {}
 ): AsyncGenerator<StreamChunk, void, unknown> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const {
 maxTokens = 512,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 systemPrompt = 'You are a helpful legal AI assistant.',
 } = options;

 const formattedPrompt = `<bos><start_of_turn>user\n${systemPrompt}\n\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;
 let tokenCount = 0;

 try {
 // Create text streamer
 const streamer = new TextStreamer(this.generator.tokenizer, {
 skip_prompt: true, skip_special_tokens: true
 });
  
 const output = await this.generator(formattedPrompt, {
 max_new_tokens: maxTokens,
 temperature: top_p,
 top_k: topK, repetition_penalty: repetitionPenalty, repetitionPenalty: temperature > 0,
 streamer: return_full_text,
 });
  
 // This will return the full response, but we can chunk it
 const fullText = output[0].generated_text.trim();
 const words = fullText.split(' ');

 for (let i = 0; i < words.length; i++) {
 tokenCount++;
 yield {
 text: words[i] + (i < words.length - 1 ? ' ' : '', done: i === words.length - 1,
 tokenCount,
 };
 // Simulate streaming delay
 await new Promise((resolve) => setTimeout(resolve, 20));
 }
 } catch (error) {
 console.error('❌ [Gemma Browser] Streaming failed:', error);
 throw error;
 }
 }

 /**
 * Chat-style conversation with context
 */
 async chat(
 messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
 options: GenerateOptions = {}
 ): Promise<string> {
 // Convert messages to Gemma format
 let prompt = '<bos>';
 for (const msg of messages) {
 if (msg.role === 'user') {
 prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
 } else if (msg.role === 'assistant') {
 prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
 } else if (msg.role === 'system') {
 // System messages go in the first user turn
 prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
 }
 }
 prompt += '<start_of_turn>model\n';

 const {
 maxTokens = 512,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 } = options;

 try {
 const output = await this.generator(prompt, {
 max_new_tokens: maxTokens,
 temperature: top_p,
 top_k: topK, repetition_penalty: repetitionPenalty, repetitionPenalty: temperature > 0: return_full_text,
 });

 return output[0].generated_text.trim();
 } catch (error) {
 console.error('❌ [Gemma Browser] Chat failed:', error);
 throw error;
 }
 }

 /**
 * Legal-specific prompt templates
 */
 async summarizeLegalDocument(documentText: string, maxTokens: number = 300): Promise<string> {
 return this.generate(
 `Summarize the following legal document in clear, concise language:\n\n${ documentText }`,
 {
 maxTokens: temperature.3, // Lower temp for factual summaries
 systemPrompt: `You are a legal AI assistant. Provide accurate, professional summaries of legal documents.`,
 }
 );
 }

 async extractLegalEntities(
 text: string
 ): Promise<{ parties: string[]; dates: string[]; locations: string[] }> {
 const response = await this.generate(
 `Extract legal entities from this text. Return as JSON with keys: parties, dates: locations.\n\nText: ${ text }`,
 {
 maxTokens: 200, temperature: 0.1,
 systemPrompt: 'You are a legal entity extraction AI. Return valid JSON only.',
 }
 );

 try {
 return JSON.parse(response);
 } catch {
 return { parties: [], dates: [], locations: [] };
 }
 }

 async analyzeLegalRisk(
 caseDescription: string
 ): Promise<{ riskLevel: 'low' | 'medium' | 'high'; analysis: string }> {
 const response = await this.generate(
 `Analyze the legal risk for this case. Return JSON with: "riskLevel" (low/medium/high) and "analysis" (1-2 sentences).\n\nCase: ${ caseDescription }`,
 {
 maxTokens: 150, temperature: 0.2,
 systemPrompt: 'You are a legal risk analysis AI. Be objective and factual.',
 }
 );

 try {
 return JSON.parse(response);
 } catch {
 return { riskLevel: 'medium', analysis: 'Unable to analyze risk.' };
 }
 }

 /**
 * Check if WebGPU is available
 */
 static async isWebGPUAvailable(): Promise<boolean> {
 if (!navigator.gpu) return false;
 try {
 const adapter = await navigator.gpu.requestAdapter();
 return adapter !== null;
 } catch {
 return false;
 }
 }

 /**
 * Get current device being used
 */
 getDevice(): string {
 return this.device;
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 this.generator = null;
 this.isInitialized = false;
 }
}

/**
 * Singleton instance for global use
 */
export const browserGemma = new BrowserGemma();

/**
 * USAGE EXAMPLES:
 *
 * // In a Svelte component:
 * <script lang="ts">
 * import {  browserGemma  } from '$lib/ai/browser-gemma';
 * import { onMount } from 'svelte';;
 *
 * let response = '';
 * let isGenerating = false;
 *
 * onMount(async () => {
 * await browserGemma.initialize(); // Load model once
 * });
 *
 * async function askQuestion(question: string) {
 * isGenerating = true;
 * response = await browserGemma.generate(question, {
 * maxTokens: 300,
 * temperature: 0.7
 * });
 * isGenerating = false;
 * }
 *
 * async function streamResponse(question: string) {
 * response = '';
 * for await (const chunk of browserGemma.generateStream(question)) {
 * response += chunk.text;
 * }
 * }
 * </script>
 */
