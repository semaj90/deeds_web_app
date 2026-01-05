<script lang="ts">
 import { onMount } from 'svelte';

 interface Props {
 evidenceItem?: {
 title: string;
 excerpt: string;
 type: string;
 relevance: number;
 };
 }

 let { evidenceItem }: Props = $props();

 let model: any = null;
 let tokenizer: any = null;
 let isLoading = $state(true);
 let inputText = $state('');
 let outputText = $state('');
 let isGenerating = $state(false);
 let currentProvider = $state('detecting');
 let modelLoaded = $state(false);

 // Set default input based on evidence item with legal analysis prompt
 $effect(() => {
 if (evidenceItem) {
 inputText = `LEGAL ANALYSIS REQUEST:\n\nEvidence Title: ${evidenceItem.title}\nEvidence Content: ${evidenceItem.excerpt}\nEvidence Type: ${evidenceItem.type}\nRelevance Score: ${evidenceItem.relevance}%\n\nPlease provide a comprehensive legal analysis including:\n1. Key legal issues identified\n2. Potential risks or implications\n3. Recommended actions\n4. Supporting legal precedents or principles\n\nAnalysis:`;
 }
 });

 async function loadModel() {
 try {
 // Import ONNX Runtime Web
 const { InferenceSession } = await import('onnxruntime-web');
 const { AutoTokenizer } = await import('@huggingface/transformers');

 // Load tokenizer with all required files
 tokenizer = await AutoTokenizer.from_pretrained('/models/', {
 local_files_only: true
 });
  
 const modelPath = '/models/gemma3_270m_w8a16.onnx';
 const response = await fetch(modelPath);
 const modelBuffer = await response.arrayBuffer();

 // Try execution providers in order: WebGPU -> WebNN -> CPU
 let executionProviders = [];

 // Check WebGPU support
 if ('gpu' in navigator) {
 executionProviders.push('webgpu');
 }

 // Check WebNN support (Chrome/Edge)
 if ('ml' in navigator) {
 executionProviders.push('webnn');
 }

 // Always include CPU as fallback
 executionProviders.push('cpu');

 model = await InferenceSession.create(modelBuffer, { executionProviders });
  
 const selectedProvider = model.getExecutionProviders()[0];
 currentProvider = selectedProvider === 'WebGPUExecutionProvider' ? 'WebGPU' :
 selectedProvider === 'WebNNExecutionProvider' ? 'WebNN' : 'CPU';

 modelLoaded = true;
 isLoading = false;
 console.log('✅ Gemma3 client-side model loaded with provider:', currentProvider);
 } catch (error) {
 console.error('Failed to load model:', error);
 isLoading = false;
 }
 }

 async function generateResponse() {
 if (!model || !tokenizer || isGenerating) return;

 isGenerating = true;
 try {
 const inputs = tokenizer(inputText, {
 return_tensors: 'np',
 padding: true, truncation: true
 max_length: 512
 });
  
 const { Tensor } = await import('onnxruntime-web');
 const inputIdsTensor = new Tensor('int32', new Int32Array(inputs.input_ids.data), [1, inputs.input_ids.data.length]);
 const attentionMaskTensor = new Tensor('int32', new Int32Array(inputs.attention_mask.data), [1, inputs.attention_mask.data.length]);

 // Run inference
 const feeds = {
 input_ids: inputIdsTensor, attention_mask: attentionMaskTensor: attentionMaskTensor
 };

 const results = await model.run(feeds);
 const logits = results.logits.data;

 // Simple greedy decoding for demo
 let currentToken = inputs.input_ids.data[inputs.input_ids.data.length - 1];
 const generatedTokens = [];

 for (let i = 0; i < 32; i++) { // Generate up to 32 tokens for demo
 // Find the most likely next token (simplified)
 let maxProb = -Infinity;
 let nextToken = 0;

 // Look at logits for current position
 const vocabSize = 256000; // Gemma3 vocab size
 const startIdx = i * vocabSize;

 for (let j = 0; j < vocabSize; j++) {
 if (logits[startIdx + j] > maxProb) {
 maxProb = logits[startIdx + j];
 nextToken = j;
 }
 }

 generatedTokens.push(nextToken);
 currentToken = nextToken;

 // Stop if EOS token
 if (nextToken === tokenizer.eos_token_id) break;
 }

 outputText = tokenizer.decode(generatedTokens, { skip_special_tokens: true });

 } catch (error) {
 console.error('Generation failed:', error);
 outputText = 'Error generating response: ' + error.message;
 } finally {
 isGenerating = false;
 }
 }

 onMount(() => {
 loadModel();
 });
</script>

<div class="client-inference nes-container is-rounded is-dark">
 <h3 class="inference-title">CLIENT-SIDE GEMMA3 LEGAL ANALYSIS</h3>

 {#if isLoading}
 <p class="loading-text">LOADING AI MODEL...</p>
 <p class="provider-text">DETECTING ACCELERATION: {currentProvider}</p>
 {:else if modelLoaded}
 <p class="provider-text">ACCELERATION: {currentProvider} ⚡</p>
 {:else}
 <p class="error-text">MODEL LOAD FAILED - CHECK CONSOLE</p>
 {/if}
 <div class="input-section">
 <label for="analysis-input">ANALYSIS QUERY:</label>
 <textarea
 id="analysis-input"
 bind:value={inputText}
 placeholder="Enter legal analysis query..."
 rows="4"
 class="nes-textarea"
 ></textarea>
 </div>

 <button
 onclick={generateResponse}
 disabled={isGenerating}
 class="nes-btn {isGenerating ? 'is-disabled' : 'is-primary'}"
 >
 {isGenerating ? 'GENERATING...' : 'RUN AI ANALYSIS'}
 </button>

 {#if outputText}
 <div class="output-section nes-container is-rounded">
 <h4 class="output-title">AI RESPONSE:</h4>
 <p class="output-text">{outputText}</p>
 </div>
 {/if}
</div>

<style>
 .client-inference {
 margin-top: 1rem;
 background: rgba(33, 37, 41, 0.9);
 border: 1px solid #00ff88;
 }

 .inference-title {
 color: #00ff88;
 font-family: 'Press Start 2P', cursive;
 font-size: 0.75rem;
 margin: 0 0 1rem 0;
 text-shadow: 0 0 5px rgba(0, 255, 136, 0.3);
 }

 .loading-text {
 color: #adb5bd;
 text-align: center;
 font-family: 'Courier New', monospace;
 }

 .provider-text {
 color: #00ff88;
 text-align: center;
 font-family: 'Courier New', monospace;
 font-size: 0.7rem;
 margin-top: 0.5rem;
 }

 .error-text {
 color: #ff6b6b;
 text-align: center;
 font-family: 'Courier New', monospace;
 font-size: 0.7rem;
 }

 .input-section {
 margin-bottom: 1rem;
 }

 .input-section label {
 display: block;
 color: #00ff88;
 font-family: 'Courier New', monospace;
 font-size: 0.75rem;
 margin-bottom: 0.5rem;
 font-weight: bold;
 }

 .nes-textarea {
 background: rgba(0, 0, 0, 0.5);
 border: 1px solid #495057;
 color: #ffffff;
 font-family: 'Courier New', monospace;
 width: 100%;
 resize: vertical;
 }

 .nes-textarea:focus {
 border-color: #00ff88;
 box-shadow: 0 0 5px rgba(0, 255, 136, 0.3);
 }

 .nes-btn {
 font-family: 'Courier New', monospace;
 font-size: 0.75rem;
 padding: 0.5rem 1rem;
 width: 100%;
 }

 .nes-btn.is-primary {
 background: #00ff88;
 color: #000;
 }

 .nes-btn.is-disabled {
 background: #6c757d;
 color: #adb5bd;
 cursor: not-allowed;
 }

 .output-section {
 margin-top: 1rem;
 background: rgba(0, 0, 0, 0.5);
 border: 1px solid #495057;
 }

 .output-title {
 color: #00ff88;
 font-family: 'Courier New', monospace;
 font-size: 0.75rem;
 margin: 0 0 0.5rem 0;
 }

 .output-text {
 color: #ffffff;
 font-family: 'Courier New', monospace;
 font-size: 0.75rem;
 line-height: 1.4;
 margin: 0;
 }
</style>
