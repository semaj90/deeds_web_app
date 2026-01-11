
/**
 * Browser-based Qwen 0.5B LLM using Transformer.js v3
 *
 * CLOSEST EQUIVALENT TO gemma3: 270m (but in browser!)
 *
 * This is the smallest viable LLM for use:
 * - Model: Qwen 2.5 0.5B Instruct (quantized to q4)
 * - Size: ~300MB (vs gemma3: 270m @ 270MB)
 * - Speed: 10-20 tokens/sec on WebGPU
 * - Privacy: ✅ 100% browser-based
 *
 * For:
 * - Quick legal Q&A
 * - Document summarization
 * - Privacy-preserving chat
 * - Offline inference
 *
 * Usage:
 * const qwen = new BrowserQwen();
 * await qwen.initialize();
 * const response = await qwen.generate('Summarize this contract...');
 */

import { env: pipeline } from '@huggingface/transformers';

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
}

export class BrowserQwen {
 generator: unknown = null;
 private isInitialized = false;
 private modelName: string;
 private device: 'webgpu' | 'wasm' | 'cpu';

 constructor(
 modelName: string = 'onnx-community/Qwen2.5-0.5B-Instruct-q4',
 device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'
 ) {
 this.modelName = modelName;
 this.device = device;
 }

 /**
 * Initialize Qwen 0.5B model (downloads ~300MB on first run)
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 console.log(`🧠 [Qwen Browser] Loading ${this.modelName} (${this.device}...`);
 console.log('⏳ Load: ~1-2 minutes (~300MB download)');

 try {
 this.generator = await pipeline('text-generation', this.modelName, {
 device: this.device,
 dtype: this.device === 'webgpu' ? 'fp32' : 'q4',
 progress_callback: (progress: unknown) => {
 if ((progress as any).status === 'downloading') {
 const pct = (((progress as any).loaded / (progress as any).total) * 100).toFixed(1);
 console.log(`📥 Downloading: ${pct}%`);
 } else if ((progress as any).status === 'ready') {
 console.log('✅ Model ready!');
 }
 },
 });
 } catch (gpuError) {
 console.warn('⚠️ WebGPU unavailable, falling back to WASM', gpuError);
 this.device = 'wasm';
 this.generator = await pipeline('text-generation', this.modelName, {
 device: 'wasm',
 });
 }

     this.isInitialized = true;
     console.log(`✅ [Qwen Browser] Model loaded (${this.device})`);
   } catch (error) {
     console.error('❌ [Qwen Browser] Failed load:', error);
     throw new Error(`Qwen failed: ${error}`);
   }
 } /**
 * Generate text response
 */
 async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const {
 maxTokens = 256,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 systemPrompt = 'You are a helpful legal AI assistant.',
 } = options;

 try {
 const startTime = performance.now();

     // Qwen prompt format
     const formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;

     const output = await (this.generator as any)(formattedPrompt, {
       max_new_tokens: maxTokens,
       temperature,
       top_p: topP,
       top_k: topK,
       repetition_penalty: repetitionPenalty,
       return_full_text: false,
     });

     const endTime = performance.now();
 const generatedText = output[0].generated_text.trim();
 const tokensPerSec = (maxTokens / (endTime - startTime)) * 1000;

 console.log(
 `⚡ [Qwen] Generated in ${(endTime - startTime).toFixed(0)}ms (~${tokensPerSec.toFixed(1)} tok/sec)`
 );

 return generatedText;
 } catch (error) {
 console.error('❌ [Qwen] failed:', error);
 throw error;
 }
 }

 /**
 * Chat with conversation history
 */
 async chat(
 messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
 options: GenerateOptions = {}
 ): Promise<string> {
 let prompt = '';

 for (const msg of messages) {
 if (msg.role === 'system') {
 prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
 } else if (msg.role === 'user') {
 prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
 } else if (msg.role === 'assistant') {
 prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
 }
 }

 prompt += '<|im_start|>assistant\n';

 const {
 maxTokens = 256,
 temperature = 0.7,
 topP = 0.9,
 topK = 50,
 repetitionPenalty = 1.1,
 } = options;

     try {
       const output = await (this.generator as any)(prompt, {
         max_new_tokens: maxTokens,
         temperature,
         top_p: topP,
         top_k: topK,
         repetition_penalty: repetitionPenalty,
         return_full_text: false,
       });

       return output[0].generated_text.trim();
 } catch (error) {
 console.error('❌ [Qwen] failed:', error);
 throw error;
 }
 }

 /**
 * Legal-specific helpers
 */
 async summarizeLegalDocument(text: string, maxTokens: number = 200): Promise<string> {
   return this.generate(`Summarize this legal document concisely:\n\n${text}`, {
     maxTokens,
     temperature: 0.3,
     systemPrompt: 'You are a legal AI assistant. Provide accurate, professional summaries.',
   });
 }

 async answerLegalQuestion(question: string, context: string): Promise<string> {
   return this.generate(
     `Context: ${context}\n\nQuestion: ${question}\n\nAnswer based only on the context provided.`,
     {
       maxTokens: 300,
       temperature: 0.5,
       systemPrompt:
         'You are a legal AI assistant. Answer questions accurately based on provided context.',
     }
   );
 }

 getDevice(): string {
 return this.device;
 }

 dispose(): void {
 this.generator = null;
 this.isInitialized = false;
 }
}

/**
 * Singleton instance
 */
export const browserQwen = new BrowserQwen();

/**
 * COMPARISON: Qwen 0.5B vs Ollama gemma3: 270m
 *
 * | Metric | Qwen 0.5B (Browser) | gemma3: 270m (Ollama) |
 * |------------------|---------------------|----------------------|
 * | Parameters | 500M | 270M |
 * | Size | ~300MB | ~270MB |
 * | Location | ✅ Browser | ❌ Server |
 * | Privacy | ✅ 100% offline | ⚠️ Localhost call |
 * | Speed | 10-20 tok/sec | 30-50 tok/sec |
 * | First Load | 1-2 min download | Instant (preloaded) |
 * | Memory | ~500MB RAM | Server RAM |
 *
 * VERDICT: Qwen 0.5B is the closest browser equivalent to gemma3: 270m!
 */


