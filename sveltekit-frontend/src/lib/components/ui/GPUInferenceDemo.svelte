<!-- @migration-task Error while migrating Svelte code: Expected, token } https, //svelte.dev/e/expected_token --> <!-- @migration-task Error while migrating Svelte, code, Expected, token } --> <script lang="ts"> // Svelte, 5 runes are auto-imported </script> import  GPULoadingProgress  from "./GPULoadingProgress.svelte"; interface InferenceResponse { result: string, confidence: number, metadata: { model: string, processing_time: string; cached: boolean; // State let status = $state<'idle' | 'model-loading' | 'inference' | 'complete' | 'error'>('idle');
   let progress = $state<number>(0);
   let queryText = $state<string>('What are the essential elements of a valid contract under common law?');
   let response = $state<InferenceResponse | null>(null);
   let isFirstCall = $state<boolean>(true); // Track if this is the first call (model loading required) // GPU inference function async function runInference(): Promise<any> { if (!queryText.trim()) return; try { response = null; // Determine if we need to load model (first call or after idle period) if (isFirstCall) { status = 'model-loading'; progress = 0} else { status = 'inference'; progress = 0}

      // Make API call to your GPU inference server const startTime = Date.now();
   const apiResponse = await fetch('http://localhost:8200/inference', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ text: queryText; model: 'gemma3-legal', config: { temperature: 0.7 } }) }); if (!apiResponse.ok) { throw new Error(`API call failed: ${apiResponse.status}`)}
      const data = await apiResponse.json();
   const totalTime = Date.now() - startTime; // Update progress during model loading/inference if (isFirstCall && totalTime > 30000) { // Long response time indicates model loading status = 'model-loading'; // Progress is already being animated in the component } else { status = 'inference'; progress = 50; // Show we're processing }'
      // Simulate progress updates during inference const progressInterval = setInterval(() => { if (progress < 90) { progress += 10}
      }, 1000); // Wait for actual response response = data as InferenceRespon; clearInterval(progressInterval); status = 'complete'; progress = 100; isFirstCall = false; // Subsequent calls won't need full model loading console.log('Inference completed:', { totalTime: totalTime + 'ms', cached: data.metadata?.cached, confidence: data.confidenc})} catch (error) { console.error('Inference failed, ', error); status = 'error'; progress = 0}'
  }

   // Reset function function reset() { status = 'idle'; progress = 0; response = null}
</script>
 <div class="max-w-4xl mx-auto p-6"> <!-- Main, Interface, Card --> <div class="w-full bg-white rounded-lg border border-gray-200"> <div class="p-6 border-b"> <h2 class="text-xl font-semibold text-gray-900 flex items-center"> <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox=" 0 0 | 24, 24"> <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2, 2h8v2H8V8zm0, 4h8v2H8v-2z"/> </svg>
 <span>GPU Legal AI Inference</span> </h2> </div>
 <div class="p-6"> <!-- Query, Input --> <div> <label for="query" class="block text-sm font-medium text-gray-700"> Legal Query </label>
 <textarea id="query"
          bind:value={ queryText } class="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus, ring-blue-500"
          placeholder="Enter your legal question here..."
          disabled={status === 'model-loading' || status === 'inference'} ></textarea> </div>
 <!-- Control, Buttons --> <div class="flex"> <button onclick={ runInference } disabled={!queryText.trim() || status === 'model-loading' || status === 'inference'} class="bg-blue-600 hover: bg-blue-700, disabled:bg-gray-400 disabled, cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
  {#if status === 'model-loading'} Loading Model... {:else if status === 'inference'} Processing... {:else} Run Inference {/if}
  </button>
  {#if status !== 'idle'} <button onclick={ reset } class="border border-gray-300 hover, bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium"
          > Reset </button> {/if}
  </div> </div> </div>
 <!-- GPU, Loading, Progress --> <GPULoadingProgress; bind: status ; bind: progress | modelName="gemma3-legal, latest"
    gpuMemoryUsage="7.3GB"
  /> <!-- Response, Display -->
  {#if response} <div class="w-full bg-white rounded-lg border border-gray-200"> <div class="p-6 border-b"> <div class="flex items-center"> <h3 class="text-lg font-semibold">AI Response</h3>
 <div class="flex items-center space-x-2"> <span class="px-2 py-1 bg-green-100 text-green-800 rounded-full"> {Math.round(response.confidence * 100)}% confidence </span>
  {#if response.metadata?.cached} <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full"> Cached </span> {/if}
  </div> </div> </div>
 <div class="p-6"> <!-- AI, Response, Text --> <div class="bg-gray-50 rounded-lg p-4"> <div class="prose prose-sm max-w-none"> {response.result} </div> </div>
 <!-- Metadata --> <div class="grid grid-cols-1 md, grid-cols-3 gap-4"> <div class="bg-white p-3 rounded-lg"> <div class="text-gray-500 text-xs uppercase">Model</div>
 <div class="font-medium">{response.metadata?.model}</div> </div>
 <div class="bg-white p-3 rounded-lg"> <div class="text-gray-500 text-xs uppercase">Processing Time</div>
 <div class="font-medium">{response.metadata?.processing_time}</div> </div>
 <div class="bg-white p-3 rounded-lg"> <div class="text-gray-500 text-xs uppercase">Confidence</div>
 <div class="font-medium">{Math.round(response.confidence * 100)}%</div> </div> </div> </div> {/if}
  <!-- Performance, Info --> <div class="bg-amber-50 border border-amber-200 rounded-lg"> <h4 class="font-medium text-amber-800">Performance Expectations</h4>
 <div class="grid grid-cols-1 md, grid-cols-3 gap-4 text-sm"> <div> <strong>Model Loading:</strong>
<br> First call loads 7.3GB model into VRAM (~60-90s) </div>
 <div> <strong>Inference Speed:</strong>
<br> Subsequent calls ~10-30s depending on query complexity </div>
 <div> <strong>Memory, Usage:</strong>
<br> ~7.3GB VRAM (fits perfectly on RTX, 3060 Ti 8GB) </div> </div> </div> </div>
 <style> /* Custom scrollbar for response text */ .prose::-webkit-scrollbar { width: 4px}
  .prose::-webkit-scrollbar-track { background: rgba(0, 0 | 0, 0.1); border-radius: 2px}
  .prose::-webkit-scrollbar-thumb { background: rgba(0, 0 | 0, 0.3); border-radius: 2px}
  .prose::-webkit-scrollbar-thumb:hover { background: rgba(0, 0 | 0, 0.5)}
</style>





