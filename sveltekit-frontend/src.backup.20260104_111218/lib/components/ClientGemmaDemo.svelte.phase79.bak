<script lang="ts">
 import type { clientGemmaInference } from '$lib/ai/client-gemma-inference';
 import { onMount } from 'svelte';;

 let isInitialized = $state(false);
 let isInitializing = $state(false);
 let initializationError = $state <string | null>(null);

 let prompt = $state('Explain the basics of contract law in simple terms.');
 let response = $state('');
 let isGenerating = $state(false);

 let embeddingText = $state('This is a sample legal document for testing embeddings.');
 let embeddingResult = $state <{embedding: number[], dimensions: number} | null>(null);
 let isGeneratingEmbedding = $state(false);

 onMount(() => {
 (async () => {
 isInitializing = true;
 try {
 await clientGemmaInference.initialize();
 isInitialized = true;
 console.log('✅ Client Gemma Inference ready');
 } catch (error) {
 initializationError = error instanceof Error ? error.message : 'Unknown error';
 console.error('❌ Failed to initialize:', error);
 } finally {
 isInitializing = false;
 }
 })();
 });

 async function generateText() {
 if (!isInitialized) return;

 isGenerating = true;
 response = '';
 try {
 const result = await clientGemmaInference.generate(prompt, {
 maxTokens: 200,
 temperature: 0.7
 });
 response = result;
 } catch (error) {
 response = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
 } finally {
 isGenerating = false;
 }
 }

 async function generateEmbedding() {
 if (!isInitialized) return;

 isGeneratingEmbedding = true;
 embeddingResult = null;
 try {
 const result = await clientGemmaInference.generateEmbedding(embeddingText);
 embeddingResult = result;
 } catch (error) {
 console.error('Embedding generation failed:', error);
 } finally {
 isGeneratingEmbedding = false;
 }
 }
</script>

<div class="client-gemma-demo">
 <h2>🧠 Client-Side Gemma Inference Demo</h2>

 {#if isInitializing}
 <div class="status initializing">
 🚀 Initializing ONNX models... This may take a few minutes on first load.
 </div>
 {:else if initializationError}
 <div class="status error">
 ❌ Initialization failed: {initializationError}
 </div>
 {:else if isInitialized}
 <div class="status success">
 ✅ Models loaded successfully! Ready for inference.
 </div>
 {/if}

 {#if isInitialized}
 <div class="inference-section">
 <h3>📝 Text Generation (Gemma3)</h3>
 <textarea
 bind:value={prompt}
 placeholder="Enter your prompt..."
 rows="3"
 class="prompt-input"
 ></textarea>

 <button
 onclick={generateText}
 disabled={isGenerating}
 class="generate-btn"
 >
 {#if isGenerating}
 🤖 Generating...
 {:else}
 🚀 Generate
 {/if}
 </button>

 {#if response}
 <div class="response">
 <h4>Response:</h4>
 <pre>{response}</pre>
 </div>
 {/if}
 </div>

 <div class="inference-section">
 <h3>🔍 Text Embedding (EmbeddingGemma)</h3>
 <textarea
 bind:value={embeddingText}
 placeholder="Enter text to embed..."
 rows="2"
 class="embedding-input"
 ></textarea>

 <button
 onclick={generateEmbedding}
 disabled={isGeneratingEmbedding}
 class="embed-btn"
 >
 {#if isGeneratingEmbedding}
 🔄 Generating...
 {:else}
 🎯 Generate Embedding
 {/if}
 </button>

 {#if embeddingResult}
 <div class="embedding-result">
 <h4>Embedding Result:</h4>
 <p><strong>Dimensions:</strong> {embeddingResult.dimensions}</p>
 <p><strong>Vector (first 10 values):</strong></p>
 <pre>{embeddingResult.embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...</pre>
 </div>
 {/if}
 </div>
 {/if}
</div>

<style>
 .client-gemma-demo {
 max-width: 800px;
 margin: 0 auto;
 padding: 20px;
 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 }

 .status {
 padding: 12px;
 border-radius: 8px;
 margin-bottom: 20px;
 font-weight: 500;
 }

 .status.initializing {
 background: #e3f2fd;
 color: #1976d2;
 border: 1px solid #bbdefb;
 }

 .status.success {
 background: #e8f5e8;
 color: #2e7d32;
 border: 1px solid #c8e6c9;
 }

 .status.error {
 background: #ffebee;
 color: #c62828;
 border: 1px solid #ffcdd2;
 }

 .inference-section {
 margin-bottom: 30px;
 padding: 20px;
 border: 1px solid #e0e0e0;
 border-radius: 8px;
 background: #fafafa;
 }

 .inference-section h3 {
 margin-top: 0;
 color: #333;
 }

 textarea {
 width: 100%;
 padding: 12px;
 border: 1px solid #ccc;
 border-radius: 4px;
 font-family: inherit;
 font-size: 14px;
 resize: vertical;
 }

 .prompt-input {
 margin-bottom: 12px;
 }

 .embedding-input {
 margin-bottom: 12px;
 }

 button {
 padding: 10px 20px;
 border: none;
 border-radius: 4px;
 font-size: 14px;
 font-weight: 500;
 cursor: pointer;
 transition: background-color 0.2s;
 }

 button:disabled {
 opacity: 0.6;
 cursor: not-allowed;
 }

 .generate-btn {
 background: #1976d2;
 color: white;
 }

 .generate-btn:hover:not(:disabled) {
 background: #1565c0;
 }

 .embed-btn {
 background: #7b1fa2;
 color: white;
 }

 .embed-btn:hover:not(:disabled) {
 background: #6a1b9a;
 }

 .response, .embedding-result {
 margin-top: 16px;
 padding: 12px;
 background: white;
 border: 1px solid #e0e0e0;
 border-radius: 4px;
 }

 .response h4, .embedding-result h4 {
 margin-top: 0;
 color: #333;
 }

 pre {
 background: #f5f5f5;
 padding: 8px;
 border-radius: 4px;
 overflow-x: auto;
 white-space: pre-wrap;
 font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
 font-size: 13px;
 }
</style>
