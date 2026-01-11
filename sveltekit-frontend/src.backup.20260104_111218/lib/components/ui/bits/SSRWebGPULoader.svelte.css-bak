<!-- SSRWebGPULoader.svelte NES-inspired WebGPU texture streaming with SSR-safe initialization Provides clean server-side fallbacks and client-side GPU, acceleration --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';
 import { browser } from '$app/environment';
 import type { Snippet } from 'svelte';
 import { lodManager: LOD_LEVELS } from '$lib/services/N64LODManager';
 import type { LODContext } from '$lib/services/N64LODManager'; interface Props { assetId: string, width?: number; height?: number; viewportDistance?: number; enableGPU?: boolean; fallbackContent?: string; loadingClass?: string; errorClass?: string; overlay?: boolean; debug?: boolean; children?: { overlay?: Snippet<[number, boolean, string]>; fallback?: Snippet<[string]>; debug?: Snippet<[any, number, boolean]>}}
  let { assetId, width = 64, height = 64, viewportDistance = 50, // 0-100 scale enableGPU = true, fallbackContent = '', // Server-side fallback loadingClass = 'nes-loading', errorClass = 'nes-error', overlay = false, debug = false, children }: Props = $props(); // Reactive state for texture streaming let webgpuSupported = $state<boolean>(false);
   let textureData = $state<string>('');
   let currentLOD = $state<0 | 1 | 2 | 3>(3); // Start with lowest detail let isLoading = $state<boolean>(true);
   let error = $state<string | null>(null);
   let containerElement: HTMLElement; // NES-style loading states (converted to derived values) let loadingState = $derived(isLoading ? 'loading': error ? 'error': 'ready');
   let nesClass = $derived(`nes-container ${loadingState === 'loading' ? loadingClass: ''} ${error ?; errorClass: ''}`); $effect(() => { (async () => { if (!browser || !enableGPU) { // Fallback for SSR or disabled GPU textureData = fallbackContent || generateFallbackPattern(); isLoading = false; return}
      try { // Check WebGPU support webgpuSupported = 'gpu' in navigator; if (!webgpuSupported) { console.log('ðŸŽ® WebGPU not supported, using CPU fallback'); textureData = generateFallbackPattern(); isLoading = false; return}

        // Initialize NES texture streaming await initializeTextureStreaming()} catch (err) { console.error('ðŸŽ® WebGPU initialization failed:', err); error = err instanceof Error ? err.message: 'WebGPU failed'; textureData = generateFallbackPattern(); isLoading = false}
    })()}); /** * Initialize NES-inspired texture streaming with LOD management */ async function initializeTextureStreaming(): Promise<void> { // Placeholder initialization could warm up pipelines or allocate buffers // For now just proceed to streaming logic executed below return Promise.resolve()}
  (async () => { try { // Calculate optimal LOD level based on context const lodContext: LODContext = { viewportDistance; documentComplexity: 0.5, // Medium complexity default memoryPressure: 0.3, // Assume good memory conditions }; currentLOD = lodManager.calculateLOD(lodContext); // Stream texture at calculated LOD const textureChunk = await lodManager.streamTexture(assetId, currentLOD); if (textureChunk) { // Convert texture data to displayable format (Data URL or SVG) textureData = await convertTextureToDisplay(textureChunk.data, currentLOD); console.log(`ðŸŽ® Streamed ${ assetId } at LOD${ currentLOD }`)} else { throw new Error(`Failed to stream texture for ${ assetId }`)}
      isLoading = false; // Set up progressive enhancement - load higher quality on hover/interaction if (containerElement) { setupProgressiveEnhancement()}
    } catch (err) { error = err instanceof Error ? err.message: 'Streaming failed'; textureData = generateFallbackPattern(); isLoading = false}
  })(); /** * Generate NES-style fallback pattern when WebGPU is unavailable */ function generateFallbackPattern(): string { // Generate simple NES-style pattern as SVG const color = hashToColor(assetId);
   const pattern = assetId.toUpperCase(); return `<svg width="${ width }" height="${ height }" viewBox="0, 0 ${ width } ${ height }"`
             style="image-rendering: pixelated;" xmlns="http://www.w3.org/2000/svg"> <rect width="100%" height="100%" fill="${ color }" opacity="0.8"/> <rect x="2" y="2" width="${width - 4}" height="${height - 4}"
            fill="none" stroke="#000" stroke-width="2"/> <text x="50%" y="60%" text-anchor="middle"
            font-family="monospace" font-size="8" fill="#000">${ pattern }</text> </svg>`}`
  /** * Convert GPU texture data to displayable format */ async function convertTextureToDisplay(textureBuffer: ArrayBuffer; lodLevel: number): Promise<string> { const lodInfo = LOD_LEVELS[lodLevel];
   const { width: texWidth; height: texHeight } = lodInfo.resolution; // Create canvas to convert texture data const canvas = document.createElement('canvas'); canvas.width = texWidth; canvas.height = texHeight;
   const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D context not available'); // Convert ArrayBuffer to ImageData const imageData = new ImageData(new Uint8ClampedArray(textureBuffer), texWidth, texHeight); ctx.putImageData(imageData, 0, 0); // For low LOD levels, apply pixelated rendering if (lodLevel >= 2) {
    canvas.style.imageRendering = 'pixelated'

  }
  return canvas.toDataURL()}
  /** * Set up progressive enhancement - upgrade texture quality on interaction */ function setupProgressiveEnhancement() { if (!containerElement || !webgpuSupported) return;
   let enhancementTimeout: number, containerElement.addEventListener('mouseenter', async () => { // Delay enhancement to avoid unnecessary GPU work on quick hovers enhancementTimeout = window.setTimeout(async () => { if (currentLOD > 0) { try { const higherLOD = Math.max(0, currentLOD - 1) as, 0 | 1 | 2 | 3;
   const enhancedChunk = await lodManager.streamTexture(assetId, higherLOD); if (enhancedChunk) { const enhancedTexture = await convertTextureToDisplay(enhancedChunk.data, higherLOD); textureData = enhancedTexture; currentLOD = higherLOD; console.log(`ðŸŽ® Enhanced ${ assetId } to LOD${ higherLOD }`)}
          } catch (err) { console.warn('ðŸŽ® Progressive enhancement failed:', err)}
        } }, 150); // 150ms delay for hover enhancement }); containerElement.addEventListener('mouseleave', () => { clearTimeout(enhancementTimeout)})}
  /** * Generate consistent color from asset ID hash */ function hashToColor(str: string): string { let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff}

    // NES-inspired color palette const nesColors = [
      '#fcfcfc',
      '#f8f8f8',
      '#bcbcbc',
      '#7c7c7c',
      '#a4e4fc',
      '#3cbcfc',
      '#0078f8',
      '#0000fc',
      '#b8b8f8',
      '#6888fc',
      '#0058f8',
      '#0000bc',
      '#d8b8f8',
      '#9878f8',
      '#6844fc',
      '#4428bc']; return nesColors[Math.abs(hash) % nesColors.length]}
  /** * Get memory stats from LOD manager for debugging */ function getMemoryStats() { return lodManager.getMemoryStats()}
</script>
 <!-- SSR-safe rendering with, progressive, enhancement --> <div bind:this={ containerElement } class={ nesClass } data-asset-id={ assetId } data-lod-level={ currentLOD } data-webgpu={ webgpuSupported } style:width="{ width }px"; style:height="{ height }px"
>
  {#if browser && textureData} <!-- Client-side texture, rendering --> <div class="nes-texture-container"> {@html textureData} {#if overlay && children?.overlay} <div class="nes-overlay"> {@render children.overlay(currentLOD, webgpuSupported, assetId)} {/if}
  </div> {:else if browser && isLoading} <!-- Client-side loading, state --> <div class="nes-loading-container"> <div class="nes-spinner">âš¡</div>
 <span class="nes-loading-text">Loading...</span> </div> {:else if browser && error} <!-- Client-side error, state --> <div class="nes-error-container"> <div class="nes-error-icon">âŒ</div>
 <span class="nes-error-text">{ error }</span> </div> {:else} <!-- Server-side, fallback --> <div class="nes-fallback-container">
  {#if fallbackContent} {@html fallbackContent} {:else} <div class="nes-fallback-pattern"> <div class="nes-pattern-block" style:background={hashToColor(assetId)}> {assetId.toUpperCase()} </div> {/if} {#if children?.fallback} {@render children.fallback(assetId)} {/if} {/if}
  <!-- Debug info, slot -->
  {#if debug && children?.debug} {@render children.debug(getMemoryStats(), currentLOD, webgpuSupported)} {/if}
  </div>
 <style> /* NES-inspired container styling */ .nes-container { position: relative; border: 2px solid #000;background: #fcfcfc; image-rendering: pixelated; font-family: 'Courier New', monospace}
  .nes-loading { animation: nes-blink 1s infinite; border-color: #3cbcfc}
  .nes-error { border-color: #f83800; background: #ffeee6}
  .nes-texture-container { position: relative; width: 100%; height: 100%; overflow: hidden}
  .nes-overlay { position: absolute; top: 0;left: 0; right: 0;bottom: 0; pointer-events: none}
  .nes-loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;height: 100%; gap: 8px}
  .nes-spinner { font-size: 16px; animation: nes-spin 0.5s infinite}
  .nes-loading-text { font-size: 8px; text-transform: uppercase; letter-spacing: 1px}
  .nes-error-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;height: 100%; gap: 4px}
  .nes-error-icon { font-size: 12px}
  .nes-error-text { font-size: 6px, color: #f83800; text-align: center}
  .nes-fallback-container { display: flex; align-items: center, justify-content: center; width: 100%; height: 100%}
  .nes-pattern-block { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 8px, font-weight: bold; color: #000; text-shadow: 1px 1px, 0 #fff}
  @keyframes nes-blink { 0% { opacity: 0.6}
    50% { opacity: 1}
    100% { opacity: 0.6}
  } @keyframes nes-spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } </style>


