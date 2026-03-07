<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token } -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
</script>
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  let isGenerating = $state(false);
  let results = $state([]);
  let selectedFormat = $state('webgpu');
  let selectedTier = $state('n64');
  let compressionTarget = $state(50);
  const demoPrompts = [
    { text: 'Contract analysis for merger agreement', style: 'corporate', evidence_id: 1001 },
    { text: 'Criminal evidence forensic examination', style: 'forensic', evidence_id: 1002 },
    { text: 'Intellectual property case documentation', style: 'legal', evidence_id: 1003 },
    { text: 'Detective investigation visual summary', style: 'detective', evidence_id: 1004 }
  ];
  let processingStats = $state({
    totalGenerated: 0,
    averageCompressionRatio: 0,
    averageProcessingTime: 0,
    bestCompressionRatio: 0,
    cumulativeStats: []
  });
  async function generateSIMDGlyph(prompt, customSettings = ) {
    try {
      isGenerating = true;
      const request = {
        evidence_id: prompt.evidence_id,
        prompt: prompt.text,
        style: prompt.style,
        dimensions: [512, 512],
        seed: Math.floor(Math.random() * 1000000),
        neural_sprite_config: {
          enable_compression true
          compression_ratio: compressionTarget / 10,
          predictive_frames: 3
        },
        simd_config: {
          enable_tiling: true
          tile_size: 16,
          compression_target: compressionTarget
          shader_format: selectedFormat
          adaptive_quality: true
          performance_tier: selectedTier
          ...customSettings
        }
      }
      console.log('🎨 Generating SIMD glyph:', request);
      const response = await fetch('/api/glyph/simd-embeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request);
      });
      if (!(response as { ok?: any; statusText?: any; json?: any }).ok) {
        throw new Error(`Generation failed: ${(response as { ok?: any; statusText?: any; json?: any }).statusText}`);
      }
      const result = await (response as { ok?: any; statusText?: any; json?: any }).json();
      if ((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).success) {
        const newResult = {
          id: `simd-${Date.now()}`,
          timestamp: new Date().toISOString(),
          prompt: prompt.text,
          style: prompt.style,
          evidence_id: prompt.evidence_id,
          glyph_url: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.glyph_url,
          enhanced_artifact_url: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.enhanced_artifact_url,
          simd_data: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.simd_shader_data,
          processing_time: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.generation_time_ms,
          tensor_count: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.tensor_ids.length,
          cache_hits: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).data.cache_hits,
          metadata: (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).metadata
        }
        results = [newResult, ...results.slice(0, 9)]; // Keep last 10 results
        // Update processing stats
        updateProcessingStats(newResult);
        console.log('✅ SIMD glyph generated:', newResult);
        return newResult;
      } else {
        throw new Error((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).error || 'Generation failed');
      }
    } catch (error) {
      console.error('SIMD glyph generation failed:', error);
      alert(`Generation failed: ${error.message}`);
    } finally {
      isGenerating = false;
    }
  }
  function updateProcessingStats(result) {
    processingStats.totalGenerated++;
    processingStats.cumulativeStats.push(result);
    const compressionRatios = processingStats.cumulativeStats
      .filter(item => item.map)(r => r.simd_data.compression_ratio);
    if (compressionRatios.length > 0) {
      processingStats.averageCompressionRatio = compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length;
      processingStats.bestCompressionRatio = Math.max(...compressionRatios);
    }
    const processingTimes = processingStats.cumulativeStats.map(r => r.processing_time);
    processingStats.averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
  }
  async function generateBatchDemo() {
    console.log('🚀 Starting SIMD batch generation demo...');
    for (const prompt of demoPrompts) {
      if (!isGenerating) break; // Allow cancellation
      await generateSIMDGlyph(prompt);
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between generations
    }
    console.log('🎯 Batch demo complete');
  }
  async function testCompressionLevels() {
    console.log('📊 Testing compression levels...');
    const testPrompt = demoPrompts[0];
    const compressionLevels = [10, 25, 50, 100];
    for (const level of compressionLevels) {
      if (!isGenerating) break;
      await generateSIMDGlyph(testPrompt, { compression_target: level });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  function downloadShaderCode(result) {
    if (!(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data?.shader_code) return;
    const blob = new Blob([(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.shader_code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simd-shader-${(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).id}.${(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.shader_code.includes('@compute') ? 'wgsl' : (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).metadata.shader_format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function getQualityTierColor(tier) {
    switch (tier) {
      case 'nes': return 'bg-yellow-100 text-yellow-800';
      case 'snes': return 'bg-blue-100 text-blue-800';
      case 'n64': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  function getCompressionColor(ratio) {
    if (ratio > 40) return 'text-green-600 font-bold';
    if (ratio > 20) return 'text-blue-600 font-semibold';
    if (ratio > 10) return 'text-orange-600';
    return 'text-red-600';
  }
  $effect(() => {
    console.log('🎨 SIMD Glyph Demo component mounted');
  });
</script>
<div class="p-6 max-w-7xl mx-auto space-y-6">
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        🧬 SIMD-Enhanced Legal Glyph Generation
        <span class="text-sm font-normal text-gray-500">
          GPU-Accelerated Evidence Visualization with Neural Sprite Compression
        </span>
      </h3>
    </div>
    <div class="yorha-panel-content space-y-6">
      <!-- Configuration Panel -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2" for="-shader-format-">
            Shader Format
          </label><select id="-shader-format-" bind:value={selectedFormat} class="w-full p-2 border rounded-md">
            <option value="webgpu">WebGPU Compute</option>
            <option value="webgl">WebGL Fragment</option>
            <option value="css">CSS Animation</option>
            <option value="svg">SVG Pattern</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2" for="-quality-tier-">
            Quality Tier
          </label><select id="-quality-tier-" bind:value={selectedTier} class="w-full p-2 border rounded-md">
            <option value="nes">NES (8-bit)</option>
            <option value="snes">SNES (16-bit)</option>
            <option value="n64">N64 (64-bit)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2" for="-compression-target-">
            Compression Target
          </label><select id="-compression-target-" bind:value={compressionTarget} class="w-full p-2 border rounded-md">
            <option value={10}>10:1 (High Quality)</option>
            <option value={25}>25:1 (Balanced)</option>
            <option value={50}>50:1 (High Compression)</option>
            <option value={100}>100:1 (Maximum)</option>
          </select>
        </div>
        <div class="flex items-end">
          <Button class="bits-btn"
            onclick={() =>
generateSIMDGlyph(demoPrompts[Math.floor(Math.random() * demoPrompts.length)])}
            disabled={isGenerating}
            class="w-full"
          >
            {isGenerating ? '🔄 Generating...' : '🎨 Generate'}
        </div>
      </div>
      <!-- Batch Actions -->
      <div class="flex gap-2">
        <Button class="bits-btn" onclick={generateBatchDemo} disabled={isGenerating} variant="ghost">
🚀 Batch Demo
        <Button class="bits-btn" onclick={testCompressionLevels} disabled={isGenerating} variant="ghost">
📊 Test Compression
        <Button class="bits-btn" onclick={() =>
results = []} variant="ghost">
          🗑️ Clear Results
      </div>
      <!-- Processing Statistics -->
      {#if processingStats.totalGenerated > 0}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{processingStats.totalGenerated}</div>
            <div class="text-sm text-gray-600">Generated</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">
              {processingStats.averageCompressionRatio.toFixed(1)}:1
            </div>
            <div class="text-sm text-gray-600">Avg Compression</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">
              {processingStats.bestCompressionRatio.toFixed(1)}:1
            </div>
            <div class="text-sm text-gray-600">Best Compression</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-600">
              {processingStats.averageProcessingTime.toFixed(0)}ms
            </div>
            <div class="text-sm text-gray-600">Avg Time</div>
          </div>
        {/if}
    </div>
  </div>
  <!-- Results Grid -->
  {#if results.length > 0}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each results as result ((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).id)}
        <div class="overflow-hidden nes-container">
          <div class="yorha-panel-header pb-2">
            <h3 class="nes-text is-primary text-lg flex items-center justify-between">
              <span class="truncate">{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).prompt}</span>
              <span class={`px-2 py-1 rounded-full text-xs ${getQualityTierColor((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).metadata.performance_tier)}`}>
                {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).metadata.performance_tier.toUpperCase()}
              </span>
            </h3>
            <div class="text-sm text-gray-500">
              Style: {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).style} • Evidence #{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).evidence_id}
            </div>
          </div>
          <div class="yorha-panel-content space-y-4">
            <!-- Generated Glyph Display -->
            <div class="flex gap-4">
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-700 mb-2">Original Glyph</div>
                <img
                  src={(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).glyph_url}
                  alt={`${(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).style} glyph`}
                  class="w-full h-32 object-cover rounded-lg border"
                />
              </div>
              {#if (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).enhanced_artifact_url && (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).enhanced_artifact_url !== (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).glyph_url}
                <div class="flex-1">
                  <div class="text-sm font-medium text-gray-700 mb-2">Enhanced Artifact</div>
                  <img
                    src={(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).enhanced_artifact_url}
                    alt={`Enhanced ${(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).style} artifact`}
                    class="w-full h-32 object-cover rounded-lg border-2 border-blue-200"
                  />
                {/if}
            </div>
            <!-- SIMD Optimization Stats -->
            {#if (result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data}
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="font-medium">Compression</span>
                  <span class={getCompressionColor((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.compression_ratio)}>
                    {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.compression_ratio.toFixed(1)}:1
                  </span>
                </div>
                <div>
                  <span class="font-medium">Tiles:</span>
                  <span class="text-blue-600">{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.tile_map.length}</span>
                </div>
                <div>
                  <span class="font-medium">SIMD Time:</span>
                  <span class="text-purple-600">{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.performance_stats.total_optimization_time_ms}ms</span>
                </div>
                <div>
                  <span class="font-medium">Cache Hits:</span>
                  <span class="text-green-600">{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).cache_hits}</span>
                </div>
              </div>
              <!-- Shader Code Preview -->
              <div class="bg-gray-800 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                <div class="flex justify-between items-center mb-2">
                  <span class="text-yellow-400">Generated {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).metadata.shader_format.toUpperCase()} Shader</span>
                  <Button class="bits-btn"
                    onclick={() =>
downloadShaderCode(result)}
                    size="sm"
                    variant="ghost"
                    class="text-xs"
                  >
                    📄 Download
                </div>
                <pre class="whitespace-pre-wrap break-all">{(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.shader_code.slice(0, 300)}...</pre>
              </div>
              <!-- Performance Breakdown -->
              <div class="space-y-2">
                <div class="text-sm font-medium text-gray-700">Processing Pipeline:</div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    Tiling: {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.performance_stats.tiling_time_ms}ms
                  </span>
                  <span class="px-2 py-1 bg-green-100 text-green-800 rounded">
                    Compression {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.performance_stats.compression_time_ms}ms
                  </span>
                  <span class="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                    Shader Gen: {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).simd_data.performance_stats.shader_generation_time_ms}ms
                  </span>
                </div>
              {/if}
            <div class="flex justify-between items-center text-xs text-gray-500 border-t pt-2">
              <span>Generated: {new Date((result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).timestamp).toLocaleTimeString()}</span>
              <span>Total: {(result as { success?: any; data?: any; metadata?: any; error?: any; simd_data?: any; id?: any; prompt?: any; style?: any; evidence_id?: any; glyph_url?: any; enhanced_artifact_url?: any; cache_hits?: any; timestamp?: any; processing_time?: any }).processing_time}ms</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="nes-container">
      <div class="yorha-panel-content text-center py-12 text-gray-500">
        <div class="text-6xl mb-4">🎨</div>
        <h3 class="text-lg font-medium mb-2">No SIMD Glyphs Generated Yet</h3>
        <p class="mb-4">Generate your first SIMD-optimized legal evidence glyph with GPU acceleration!</p>
        <Button class="bits-btn"
          onclick={() =>
generateSIMDGlyph(demoPrompts[0])}
          disabled={isGenerating}
        >
          🚀 Generate Demo Glyph
      </div>
    {/if}
</div>
<style>
  /* Add custom styles for better visual presentation */
  :global(.simd-glyph-demo) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  /* Enhance code blocks */
  pre {
    line-height: 1.4;
    max-height: 200px;
    overflow-y: auto;
  }
  /* Improve image hover effects */
  img:hover {
    transform: scale(1.02);
    transition: transform 0.2s ease-in-out;
  }
  /* Add loading animation: */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .generating {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
