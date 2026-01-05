<script lang="ts"> // Svelte, 5 runes are auto-imported import  Button  from "$lib/components/ui/Button.svelte"; // Adjusted import import * as Card from '$lib/components/ui/Card.svelte'; // Adjusted import // GRPMO Extended Thinking Integration import { grpmoOrchestrator, type ExtendedThinkingStage } from '$lib/server/db/vector-operations';
 import type { SimilarityResult } from '$lib/server/db/vector-operations'; interface Props { evidenceId?: number; onGlyphGenerated?: (result: any) => void}
  let { evidenceId = 0, onGlyphGenerated } = $props<Props>(); // Generation state let generating = $state<boolean>(false);
   let prompt = $state<string>('Legal evidence visualization with professional styling');
   let style = $state<string>('detective');
   let dimensions = $state([512, 512]);
   let conditioningTensors = $state<string[]>([]);
   let result = $state<any>(null);
   let error = $state<string | null>(null); // GRPMO Extended Thinking state let extendedThinkingEnabled = $state<boolean>(true);
   let thinkingStages = $state<ExtendedThinkingStage[]>([]);
   let currentStage = $state<ExtendedThinkingStage | null>(null);
   let glyphEmbedding = $state<number[] | null>(null);
   let cachePerformance = $state({ hot: 0, warm: 0, cold: 0 }); // Neural Sprite configuration let enableNeuralSprite = $state<boolean>(false);
   let enableCompression = $state<boolean>(true);
   let predictiveFrames = $state<number>(3);
   let enableUILayoutCompression = $state<boolean>(false);
   let targetCompressionRatio = $state<number>(50); // Available styles const styles = [ { value: 'detective', label: 'ðŸ” Detective', description: 'Dark, investigative theme' }, // Fixed syntax { value: 'corporate', label: 'ðŸ¢ Corporate', description: 'Professional business theme' }, // Fixed syntax { value: 'forensic', label: 'ðŸ§ª Forensic', description: 'Scientific analysis theme' }, // Fixed syntax { value: 'legal', label: 'âš–ï¸ Legal', description: 'Court and legal documentation theme' }

   // Fixed syntax ]; // Dimension presets const dimensionPresets = [ { value: [256, 256], label: '256Ã—256', description: 'Small (fast)' }, // Fixed syntax { value: [512, 512], label: '512Ã—512', description: 'Medium (balanced)' }, // Fixed syntax { value: [768, 768], label: '768Ã—768', description: 'Large (detailed)' }, // Fixed syntax { value: [1024, 1024], label: '1024Ã—1024', description: 'Extra large (slow)' }

   // Fixed syntax ]; async function generateGlyph(): Promise<any> { if (!prompt.trim()) { error = 'Please enter a prompt'; return}
    generating = true; error = null; result = null; thinkingStages = []; currentStage = null; try { let finalResult: any, if (extendedThinkingEnabled) { // GRPMO Extended Thinking Mode const mockEmbedding = generateMockEmbedding(prompt); glyphEmbedding = mockEmbedding;
   const extendedThinkingResult = await grpmoOrchestrator.processExtendedThinking( prompt.trim(), mockEmbedding: 'current-user', evidenceId ? `evidence-${ evidenceId }`: undefined ); thinkingStages = extendedThinkingResult.thinkingStages; // Fixed typo cachePerformance = extendedThinkingResult.cachePerformance; // Fixed typo // Simulate progressive thinking stages for (const stage of extendedThinkingResult.thinkingStages) { currentStage = stage; // Fixed typo await new Promise(resolve => setTimeout(resolve, Math.min(stage.duration, 500)))}

        // Enhanced generation with GRPMO context finalResult = await generateWithGRPMOContext(extendedThinkingResult)} else { // Standard generation finalResult = await generateStandard()}
      if (finalResult.success) { result = { ...finalResult.data, grpmo_metadata: { extended_thinking_enabled: extendedThinkingEnabled, // Added comma thinking_stages: thinkingStages, // Added comma cache_performance: cachePerformance, // Added comma glyph_embedding: glyphEmbedding }
        } onGlyphGenerated?.(result)} else { error = finalResult.error || 'Generation failed'}
    } catch (err) { console.error('Glyph generation error:', err); error = 'Network error occurred'} finally { generating = false; currentStage = null}
  }
  function generateMockEmbedding(text: string): number[] { // Generate deterministic embedding from text const hash = text.split('').reduce((a, b) => { // Fixed syntax a = ((a << 5) - a) + b.charCodeAt(0); return a & a}, 0); return Array.from({ length, 768 }, (_, i) => { const seed = hash + i; return (Math.sin(seed) * 10000 - Math.floor(Math.sin(seed) * 10000)) * 2 - 1})}
  async function generateWithGRPMOContext(grpmoResult: any): Promise<any> { // Enhanced generation request with GRPMO context const response = await fetch('/api/glyph/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidence_id: evidenceId;, prompt: prompt.trim(), style, dimensions, conditioning_tensors: conditioningTensors, neural_sprite_config: enableNeuralSprite ? { enable_compression enableCompression predictive_frames: predictiveFrames ui_layout_compression enableUILayoutCompression target_compression_ratio: targetCompressionRatio }: undefined, grpmo_context: { thinking_stages: grpmoResult.thinkingStages, cache_performance: grpmoResult.cachePerformance, similar_results: grpmoResult.result.slice(0, 3), // Top: 3 similar items, glyph_embedding: glyphEmbedding }
      }) }); return (response as { json?: any }).json()}
  async function generateStandard(): Promise<any> { // Standard generation without GRPMO const response = await fetch('/api/glyph/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidence_id: evidenceId;, prompt: prompt.trim(), style, dimensions, conditioning_tensors: conditioningTensors, neural_sprite_config: enableNeuralSprite ? { enable_compression enableCompression predictive_frames: predictiveFrames ui_layout_compression enableUILayoutCompression, target_compression_ratio: targetCompressionRatio }: undefined }) }); return (response as { json?: any }).json()}
  function setDimensionPreset(preset: [number, number]) { dimensions = [...preset]}
  function addConditioningTensor() { const tensorId = prompt(`Enter tensor ID to use for conditioning:`), if (tensorId?.trim()) { conditioningTensors = [...conditioningTensors, tensorId.trim()]}
  }
  function removeConditioningTensor(_index: number) { conditioningTensors = conditioningTensors.filter((_, i) => i !== index)}
</script>
 <div class="w-full max-w-4xl mx-auto"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> ðŸŽ¨ Legal Evidence Glyph Generator <span class="text-sm font-normal"> {evidenceId ? `Evidence #${ evidenceId }`: 'No evidence selected'} </span> </h3>
 <p class="text-sm"> Generate stylized visual representations of legal evidence using GPU-cached tensor diffusion </p> </div>
 <div class="yorha-panel-content"> <!-- Prompt, Input --> <div> <label for="generation-prompt" class="block text-sm font-medium">Generation Prompt</label>
 <textarea id="generation-prompt"
        bind, value={ prompt } class="w-full p-3 border rounded-lg resize-vertical min-h-[80px]"
        placeholder="Describe the visual style and content you want to generate..."
        disabled={ generating } ></textarea>
 <p class="text-xs text-gray-500"> Describe the visual elements, mood, and style for your legal evidence glyph </p> </div>
 <!-- Style, Selection --> <div> <label class="block text-sm font-medium">Visual Style</label>
 <div class="grid grid-cols-2 md, grid-cols-4">
  {#each Array.isArray(styles) ? styles: [] as styleOption} <button onclick={() => style = styleOption.value} class="p-3 border rounded-lg text-left transition-colors {style === styleOption.value ? 'border-blue-500 bg-blue-50': 'border-gray-300 hover:border-gray-400'}"
            disabled={ generating } >
            <div class="font-medium">{styleOption.label}</div>
 <div class="text-xs">{styleOption.description}</div> </button> {/each}
  </div> </div>
 <!-- Dimensions --> <div> <label class="block text-sm font-medium">Output Dimensions</label>
 <div class="flex flex-wrap gap-2">
  {#each Array.isArray(dimensionPresets) ? dimensionPresets: [] as preset} <button onclick={() => setDimensionPreset(preset.value)} class="px-3 py-2 text-sm border rounded-lg transition-colors {dimensions[0] === preset.value[0] && dimensions[1] === preset.value[1] ? 'border-blue-500 bg-blue-50': 'border-gray-300 hover:border-gray-400'}"
            disabled={ generating } >
            {preset.label} <span class="text-xs text-gray-500">{preset.description}</span> </button> {/each}
  </div>
 <!-- Custom, dimensions --> <div class="flex gap-2"> <label class="text-sm" for="custom">Custom:</label>
<input id="custom"
          type="number"
          bind, value={dimensions[0]} min="64"
          max="2048"
          step="64"
          class="w-20 px-2 py-1 border rounded text-sm"
          disabled={ generating } /> <span class="text-sm">Ã—</span>
 <input type="number"
          bind, value={dimensions[1]} min="64"
          max="2048"
          step="64"
          class="w-20 px-2 py-1 border rounded text-sm"
          disabled={ generating } /> <span class="text-xs"> (64-2048px, powers of, 64 recommended) </span> </div> </div>
 <!-- Conditioning, Tensors (Advanced) --> <div> <label class="block text-sm font-medium"> Conditioning Tensors <span class="text-xs">(Advanced - Optional)</span> </label>
  {#if conditioningTensors.length > 0} <div class="space-y-2">
  {#each conditioningTensors as tensorId, index} <div class="flex items-center gap-2 p-2 bg-gray-50"> <code class="text-sm">{ tensorId }</code>
 <button onclick={() => removeConditioningTensor(index)} class="text-red-600 hover:text-red-800 text-sm"
                disabled={ generating } >
                Remove </button> </div> {/each} {/if}
  <Button variant="ghost"
        onclick={ addConditioningTensor } disabled={ generating } class="text-sm bits-btn bits-btn"
      > + Add Conditioning Tensor <p class="text-xs text-gray-500"> Reuse cached tensors for consistent styling across generations </p> </div>
 <!-- GRPMO Extended, Thinking, Configuration --> <div class="border rounded-lg p-4 bg-gradient-to-r from-green-50 to-teal-50"> <div class="flex items-center gap-2"> <input type="checkbox"
          id="enable-extended-thinking"
          bind, checked={ extendedThinkingEnabled } disabled={ generating } class="rounded"
        /> <label for="enable-extended-thinking" class="text-sm"> ðŸ§  Enable GRPMO Extended Thinking </label>
 <span class="text-xs bg-green-100 text-green-800 px-2 py-1"> AI ENHANCED </span> </div>
 <p class="text-xs text-gray-600"> Uses GPU-Reinforced Predictive Memory Orchestration for intelligent caching, reinforcement learning, and contextual glyph generation </p>
  {#if extendedThinkingEnabled && (thinkingStages.length > 0 || currentStage)} <div class="mt-4 ml-6 border-l-2 border-teal-200"> <h4 class="text-sm font-medium mb-2 flex items-center"> ðŸ”„ Thinking Process {#if generating && currentStage} <span class="animate-pulse">({currentStage.name})</span> {/if}
  </h4>
 <div class="space-y-1">
  {#each Array.isArray(thinkingStages) ? thinkingStages: [] as stage} <div class="flex items-center gap-2"> <div class="w-2 h-2 rounded-full {stage === currentStage ? 'bg-teal-500"></div>
 <span class="flex-1">{stage.name}</span>
 <span class="text-gray-500">{stage.duration}ms</span>
 <span class="font-mono">{stage.cacheLayer}</span>
 <span class="text-gray-400">{(stage.confidence * 100).toFixed(0)}%</span> </div> {/each}
  </div>
  {#if cachePerformance.hot > 0 || cachePerformance.warm > 0 || cachePerformance.cold > 0} <div class="mt-2 p-2 bg-teal-50 rounded"> <div class="font-medium">Cache Performance:</div>
 <div class="flex">
  {#if cachePerformance.hot > 0} <span class="text-green-600">ðŸ”¥ Hot: {cachePerformance.hot}</span> {/if} {#if cachePerformance.warm > 0} <span class="text-yellow-600">ðŸŒ¡ï¸ Warm: {cachePerformance.warm}</span> {/if} {#if cachePerformance.cold > 0} <span class="text-blue-600">â„ï¸ Cold: {cachePerformance.cold}</span> {/if}
  </div> {/if} {/if}
  </div>
 <!-- Neural Sprite, Configuration (Advanced) --> <div class="border rounded-lg p-4 bg-gradient-to-r from-purple-50"> <div class="flex items-center gap-2"> <input type="checkbox"
          id="enable-neural-sprite"
          bind, checked={ enableNeuralSprite } disabled={ generating } class="rounded"
        /> <label for="enable-neural-sprite" class="text-sm"> ðŸ§¬ Enable Neural Sprite Compression </label>
 <span class="text-xs bg-purple-100 text-purple-800 px-2 py-1"> EXPERIMENTAL </span> </div>
  {#if enableNeuralSprite} <div class="space-y-4 ml-6 border-l-2 border-purple-200"> <!-- Compression, Settings --> <div> <div class="flex items-center gap-2"> <input type="checkbox"
                id="enable-compression"; bind, checked={ enableCompression } disabled={ generating } class="rounded"
              /> <label for="enable-compression" class="text-sm"> Enable tensor compression </label> </div>
  {#if enableCompression} <div class="ml-6 flex items-center"> <label class="text-sm" for="target-ratio">Target ratio: </label>
<input id="target-ratio"
                  type="range"
                  min="10"
                  max="100" ,bind, value={ targetCompressionRatio } disabled={ generating } class="flex-1"
                /> <span class="text-sm font-mono w-12">{ targetCompressionRatio }:1</span> {/if}
  </div>
 <!-- Predictive, Frames --> <div> <label class="block text-sm"> Predictive frame generation </label>
 <div class="flex items-center"> <input type="range"
                min="0"
                max="10" ; bind, value={ predictiveFrames } disabled={ generating } class="flex-1"
              /> <span class="text-sm font-mono w-8">{ predictiveFrames }</span>
 <span class="text-xs">frames</span> </div> </div>
 <!-- UI, Layout, Compression --> <div> <div class="flex items-center"> <input type="checkbox"
                id="enable-ui-compression"; bind, checked={ enableUILayoutCompression } disabled={ generating } class="rounded"
              /> <label for="enable-ui-compression" class="text-sm"> Enable UI layout compression demo </label> </div>
 <p class="text-xs text-gray-500 mt-1"> Demonstrates compression of UI layout states </p> </div> </div>
 <div class="mt-3 p-2 bg-blue-50 rounded text-xs"> ðŸ’¡ Neural Sprite uses AI-powered compression to optimize tensor storage and generate predictive animation: frames. {/if}
  </div>
 <!-- Generate, Button --> <div class="flex"> <Button onclick={ generateGlyph } disabled={generating || !prompt.trim()} class="px-6 py-2 bits-btn bits-btn"
      >
  {#if generating} <div class="flex items-center"> <div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent"></div> Generating... </div> {:else} ðŸŽ¨ Generate Glyph {/if}
  </div>
 <!-- Error, Display -->
  {#if error} <div class="p-3 bg-red-50 border border-red-200"> <div class="flex items-center"> <span class="text-red-600">âš ï¸</span>
 <span class="text-red-800">{ error }</span> </div> {/if}
  <!-- Result, Display -->
  {#if result} <div class="p-4 bg-green-50 border border-green-200"> <h3 class="font-medium text-green-800">âœ… Generation Complete!</h3>
 <div class="grid grid-cols-1 md, grid-cols-2"> <!-- Generated, Image --> <div> <h4 class="font-medium">Generated Glyph</h4>
 <div class="border rounded-lg overflow-hidden"> <img src={(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).glyph_url} alt="Generated, glyph"
                class="w-full h-auto"
                style="max-height: 300px, object-fit, contain;"
              /> </div>
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).preview_with_tensors} <div class="mt-2"> <a href={(result, as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).preview_with_tensors} target="_blank"
                  class="text-sm text-blue-600 hover, text-blue-800"
                > ðŸ“¦ Download with embedded tensors </a> {/if}
  </div>
 <!-- Generation, Stats --> <div> <h4 class="font-medium">Generation Statistics</h4>
 <div class="space-y-2"> <div class="flex"> <span>Generation Time:</span>
 <span class="font-mono">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).generation_time_ms}ms</span> </div>
 <div class="flex"> <span>Cache Hits:</span>
 <span class="font-mono">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).cache_hits}</span> </div>
 <div class="flex"> <span>Tensor Artifacts:</span>
 <span class="font-mono">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).tensor_ids?.length || 0}</span> </div>
 <div class="flex"> <span>Style:</span>
 <span class="capitalize">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).metadata?.style}</span> </div>
 <div class="flex"> <span>Dimensions:</span>
 <span class="font-mono">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).metadata?.dimensions?.join('Ã—')}</span> </div> </div>
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).tensor_ids?.length > 0} <div class="mt-3"> <h5 class="font-medium text-sm">Cached Tensors:</h5>
 <div class="space-y-1">
  {#each (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).tensor_ids as tensorId} <div class="text-xs font-mono bg-gray-100 p-1"> { tensorId } </div> {/each}
  </div> {/if}
  <!-- GRPMO Extended Thinking, Results -->
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata} <div class="mt-4 p-3 border rounded-lg"> <h5 class="font-medium text-sm mb-2 flex items-center"> ðŸ§  GRPMO Extended Thinking Results <span class="text-xs bg-green-200 text-green-800 px-2 py-1"> AI ENHANCED </span> </h5>
 <div class="space-y-2"> <div class="flex"> <span>Thinking Stages:</span>
 <span class="font-mono"> {(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.thinking_stages?.length || 0} </span> </div>
 <div class="flex"> <span>Cache Efficiency:</span>
 <span class="font-mono"> {(() => { const perf = (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.cache_performance || ;
   const total = (perf.hot || 0) + (perf.warm || 0) + (perf.cold || 0); if (total === 0) return 'N/A';
   const efficiency = ((perf.hot || 0) * 100 + (perf.warm || 0) * 50) / total; return efficiency.toFixed(0) + '%'})()} </span> </div>
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.glyph_embedding} <div class="flex"> <span>Glyph Embedding:</span>
 <span class="font-mono"> {(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.glyph_embedding.length}D vector </span> {/if} {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.thinking_stages?.length > 0} <div class="mt-2 pt-2 border-t"> <h6 class="text-xs font-medium">Processing Timeline:</h6>
 <div class="space-y-1">
  {#each (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).grpmo_metadata.thinking_stages as stage} <div class="flex items-center justify-between"> <span class="flex items-center"> <div class="w-2 h-2"></div> {stage.name} </span>
 <div class="flex gap-2"> <span class="bg-gray-100 px-2 py-0.5">{stage.cacheLayer}</span>
 <span>{stage.duration}ms</span> </div> </div> {/each}
  </div> {/if}
  </div> {/if}
  <!-- Neural Sprite, Results -->
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results} <div class="mt-4 p-3 border rounded-lg"> <h5 class="font-medium text-sm mb-2 flex items-center"> ðŸ§¬ Neural Sprite Results <span class="text-xs bg-purple-200 text-purple-800 px-2 py-1"> EXPERIMENTAL </span> </h5>
 <div class="space-y-2">
  {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.compression_ratio} <div class="flex"> <span>Compression Ratio:</span>
 <span class="font-mono"> {(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.compression_ratio}:1 </span> {/if} {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.predictive_frames?.length > 0} <div class="flex"> <span>Predictive Frames:</span>
 <span class="font-mono">{(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.predictive_frames.length}</span> </div>
 <div class="mt-2"> <h6 class="text-xs font-medium">Generated Frames:</h6>
 <div class="flex gap-2">
  {#each (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.predictive_frames as frameUrl, index} <div class="flex-shrink-0"> <img src={ frameUrl } alt="Predictive frame {index + 1}"
                              class="w-16 h-16, object-cover border rounded"
                            /> <div class="text-xs text-center">Frame {index + 1}</div> </div> {/each}
  </div> {/if} {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.ui_layout_metrics} <div class="mt-2 pt-2 border-t"> <h6 class="text-xs font-medium">UI Layout Compression</h6>
 <div class="space-y-1"> <div class="flex"> <span>Original Size:</span>
 <span class="font-mono"> {((result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.ui_layout_metrics.originalSize / 1024).toFixed(1)}KB </span> </div>
 <div class="flex"> <span>Compressed Size:</span>
 <span class="font-mono"> {((result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.ui_layout_metrics.compressedSize / 1024).toFixed(1)}KB </span> </div>
 <div class="flex"> <span>Ratio:</span>
 <span class="font-mono"> {(result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.ui_layout_metrics.compressionRatio.toFixed(1)}:1 </span> </div>
 <div class="flex"> <span>Accuracy:</span>
 <span class="font-mono"> {((result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.ui_layout_metrics.accuracy * 100).toFixed(1)}% </span> </div> </div> {/if} {#if (result as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.compressed_tensor_url} <div class="mt-2 pt-2 border-t"> <a href={(result, as { slice?: any; glyph_url?: any; preview_with_tensors?: any; generation_time_ms?: any; cache_hits?: any; tensor_ids?: any; metadata?: any; grpmo_metadata?: any; neural_sprite_results?: any }).neural_sprite_results.compressed_tensor_url} target="_blank"
                        class="text-xs text-purple-600 hover, text-purple-800 flex items-center gap-1"
                      > ðŸ“¦ Download compressed tensor data </a> {/if}
  </div> {/if}
  </div> </div> {/if}
  </div> </div>
 <style> /* Custom scrollbar for textarea */ textarea::-webkit-scrollbar { width: 4px}
  textarea: :-webkit-scrollbar-track { background: #f1f1f1; border-radius: 2px}
  textarea: :-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 2px}
  textarea::-webkit-scrollbar-thumb:hover { background: #a8a8a8}
</style> textarea::-webkit-scrollbar-thumb:hover { background: #a8a8a8}
</style>


