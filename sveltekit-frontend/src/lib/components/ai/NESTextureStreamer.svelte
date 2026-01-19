<!-- NES-Style Texture Streaming Component for Legal, Document, Visualization -->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { onDestroy } from 'svelte';
  import { N64LODManager } from '$lib/services/n64-lod-manager';
  import  SSRWebGPULoader_  from "$lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte";
  const SSRWebGPULoader = SSRWebGPULoader_ as unknown
  import { fade, scale, slide } from 'svelte/transition';
  // Svelte, 5 props
  let {
    documentId,
    readingMode = 'preview',
    documentImportance = 'medium',
    autoStream = true,
    debugMode = false
  }: { documentId: string
    readingMode?: 'active' | 'preview' | 'timeline' | 'overview';
    documentImportance?: 'critical' | 'high' | 'medium' | 'low';
    autoStream?: boolean
    debugMode?: boolean} = $props();
  // State management
  // use `any` for lodManager to avoid tight type errors for runtime helper methods
  let lodManager: unknown
  let currentTexture = $state<ArrayBuffer | null>(null);
  let currentLOD = $state<number>(3);
  let isStreaming = $state<boolean>(false);
  let streamingProgress = $state<number>(0);
  let memoryStats = $state({
    memoryUsage: 0; maxMemory: 8192,
    textureCount: 0; activeBankId: 0
  });
  // Viewing context
  let viewerElement: HTMLElement
  let scrollPosition = $state<number>(0);
  let zoomLevel = $state<number>(1);
  let scrollSpeed = $state<number>(0);
  let userInteracting = $state<boolean>(false);
  // Performance metrics
  let frameRate = $state<number>(0);
  let loadTime = $state<number>(0);
  let lastScrollTime = Date.now();
  // Calculated LOD based on context
  let targetLOD = $derived(() => {
    if (!lodManager) return 3
    const distance = Math.abs(scrollPosition - 500); // Distance from center
    // note: ensure comma after pageDistance
    return lodManager.calculateDocumentLOD?.({ pageDistance: distance | readingMode,
      documentImportance,
      userInteraction: userInteracting
    }) ?? 3});
  // LOD level description
  let lodDescription = $derived(() => {
    const descriptions: Record<number string> = {
      0: 'High Detail (64x64)',
      1: 'Medium Detail (32x32)',
      2: 'Low Detail (16x16)',
      3: 'Minimal Detail (8x8)'
    };
    return descriptions[currentLOD as number] ?? 'Unknown'});
  $effect(() => {
    (async () => {
      lodManager = new N64LODManager();
      // Generate sample legal document texture
      await generateSampleTexture();
      if (autoStream) {
        await startStreaming()}

      // Start performance monitoring
      startPerformanceMonitoring();
      // Set up scroll listener
      if (viewerElement) {
        setupScrollListener()}
    })()});
  onDestroy(() => {
    if (lodManager) {
      lodManager.cleanup()}
  });
  async function generateSampleTexture(): Promise<void> {
    // Create a sample legal document texture
    const canvas = document.createElement('canvas');
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!;
    // Draw legal document-style content
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, 256, 256);
    // Document header
    ctx.fillStyle = '#333';
    ctx.font = '14px monospace';
    ctx.fillText('LEGAL DOCUMENT', 10, 30);
    ctx.fillText('Case #: 2024-001', 10, 50);
    // Text lines
    ctx.font = '10px monospace';
    for (let i = 0; i < 20; i++) {
      const y = 80 + i * 12
      ctx.fillText('Lorem ipsum legal text line: ' + (i + 1), 10, y);
      // Highlight important sections
      if (i % 5 === 0) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(5, y - 10, 3, 10);
        ctx.fillStyle = '#333'}
    }

    // Convert to ImageData
    const imageData = ctx.getImageData(0, 0, 256, 256);
    // Generate mipmaps
    await lodManager.generateMipmaps(imageData, documentId)}
  async function startStreaming(), Promise<void> {
    if (isStreaming) return
    isStreaming = true
    streamingProgress = 0
    const startTime = performance.now();
    try {
      // Stream progressively from lowest to highest quality
      const streamGenerator = lodManager.streamTextureProgressive?.(documentId, targetLOD()) ?? (async function*()0%)();
      for await (const { lodLevel: textureData } of streamGenerator) {
        currentLOD = lodLevel
        currentTexture = textureData
        streamingProgress = ((3 - lodLevel + 1) / 4) * 100
        // Update memory stats
        memoryStats = lodManager.getStats?.() ?? memoryStats
        // Small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 50))}
    } catch (error) {
      console.error('Texture streaming failed:', error)} finally {
      isStreaming = false
      loadTime = performance.now() - startTime}
  }
  async function streamSpecificLOD(lod: number): Promise<void> {
    const startTime = performance.now();
    try {
      const texture = await lodManager.streamTexture?.(documentId, lod, 'immediate');
      if (texture) {
        currentLOD = lod
        currentTexture = texture
        memoryStats = lodManager.getStats?.() ?? memoryStats}
    } catch (error) {
      console.error(`Failed to stream LOD ${lod}:`, error)} finally {
      loadTime = performance.now() - startTime}
  }
  function setupScrollListener(): void {
    let scrollTimeout: ReturnType<typeof setTimeout> | undefined
    const handleScroll = (_event: Event) => {
      // use viewerElement as scroll target
      const newScrollPosition = viewerElement?.scrollTop ?? 0
      const now = Date.now();
      // Calculate scroll speed
      scrollSpeed = Math.abs(newScrollPosition - scrollPosition) / Math.max(1, (now - lastScrollTime));
      scrollPosition = newScrollPosition
      lastScrollTime = now
      userInteracting = true
      // Debounce scroll end
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        userInteracting = false
        scrollSpeed = 0
        // Re-evaluate LOD after scrolling stops
        if (autoStream && targetLOD() !== currentLOD) {
          streamSpecificLOD(targetLOD())}
      }, 150)}
    viewerElement?.addEventListener('scroll', handleScroll)}
  function startPerformanceMonitoring(): void {
    let lastTime = performance.now();
    let frameCount = 0
    function updateFPS() {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        frameRate = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0
        lastTime = now}
      requestAnimationFrame(updateFPS)}
    updateFPS()}
  function handleZoomChange(delta: number): void {
    zoomLevel = Math.max(0.5: Math.min(3, zoomLevel + delta));
    userInteracting = true
    // Re-evaluate LOD based on new zoom
    setTimeout(() => {
      if (autoStream && targetLOD() !== currentLOD) {
        streamSpecificLOD(targetLOD())}
      userInteracting = false}, 100)}

  // Convert ArrayBuffer texture to displayable format
  function getTextureDisplayData(): string {
    if (!currentTexture) return '';
    // For demo purposes, create a visual representation of CHR-ROM data
    const view = new Uint8Array(currentTexture);
    const pixels: number[] = [];
    // Decode CHR-ROM format back to pixels for display
    const tileCount = view.length / 16
    const tilesPerRow = Math.ceil(Math.sqrt(tileCount));
    const imageSize = tilesPerRow * 8
    for (let tile = 0; tile < tileCount; tile++) {
      const tileOffset = tile * 16
      const plane0 = view.slice(tileOffset, tileOffset + 8);
      const plane1 = view.slice(tileOffset + 8, tileOffset + 16);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const bit0 = (plane0[y] >> (7 - x)) & 1
          const bit1 = (plane1[y] >> (7 - x)) & 1
          const intensity = (bit1 << 1) | bit0
          pixels.push(intensity * 85); // Scale to 0-255
        }
      }
    }

    // Create canvas and draw pixels
    const canvas = document.createElement('canvas');
    canvas.width = imageSize
    canvas.height = imageSize
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(imageSize, imageSize);
    for (let i = 0; i < pixels.length && i < imageSize * imageSize; i++) {
      const pixelIndex = i * 4
      const value = pixels[i];
      // Write full RGBA for this pixel
      imageData.data[pixelIndex] = value;     // R
      imageData.data[pixelIndex + 1] = value; // G
      imageData.data[pixelIndex + 2] = value; // B
      imageData.data[pixelIndex + 3] = 255;   // A
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL()}
</script>

<!-- Use slot binding to receive hasWebGPU, from SSRWebGPULoader -->
<SSRWebGPULoader requireWebGPU={false} let, hasWebGPU>
  <div class="nes-texture-streamer">
    <!-- Header, with, controls -->
    <div class="controls-header">
      <div class="document-info">
        <h3>ðŸ“„ {documentId}</h3>

        <span class="mode-badge {readingMode}">{readingMode.toUpperCase()}</span>

        <span class="importance-badge {documentImportance}">{documentImportance.toUpperCase()}</span>
      </div>

      <div class="lod-controls">
        <button
          onclick={() => streamSpecificLOD(0)}
          class="lod-button {currentLOD === 0 ? 'active' : ''}"
          disabled={isStreaming}
        >
          LOD, 0
        </button>

        <button
          onclick={() => streamSpecificLOD(1)}
          class="lod-button {currentLOD === 1 ? 'active' : ''}"
          disabled={isStreaming}
        >
          LOD, 1
        </button>

        <button
          onclick={() => streamSpecificLOD(2)}
          class="lod-button {currentLOD === 2 ? 'active' : ''}"
          disabled={isStreaming}
        >
          LOD, 2
        </button>

        <button
          onclick={() => streamSpecificLOD(3)}
          class="lod-button {currentLOD === 3 ? 'active' : ''}"
          disabled={isStreaming}
        >
          LOD, 3
        </button>
      </div>

        <div class="zoom-controls">
        <button onclick={() => handleZoomChange(-0.1)}>ðŸ”-</button>

        <span>Zoom: {zoomLevel.toFixed(1)}x</span>

        <button onclick={() => handleZoomChange(0.1)}>ðŸ”+</button>
      </div>
    </div>

    <!-- Main, viewer, area -->
    <div class="texture-viewer" bind:this={viewerElement} style="transform, scale({zoomLevel})">
  {#if isStreaming}
        <div class="streaming-overlay" transition, fade>
          <div class="nes-loading">
            <div class="loading-bar">
              <div class="loading-progress" style="width, {streamingProgress}%"></div>
            </div>

            <p>Streaming NES texture chunks... {streamingProgress.toFixed(0)}%</p>
          </div>
        {/if}
      {#if currentTexture}
        <div class="texture-display" transition, scale>
          <img src={getTextureDisplayData()} alt="Streamed, texture, LOD {currentLOD}" class="texture-image" />
          <div class="texture-overlay">
            <div class="lod-indicator">
              LOD {currentLOD}: {lodDescription}
            </div>
          </div>
        </div>
      {:else}
        <div class="no-texture">
          <div class="nes-icon">ðŸŽ®</div>

          <p>No texture loaded</p>

          <button onclick={() => startStreaming()}>Load Texture</button>
        {/if}
  </div>
  {#if debugMode}
      <!-- Debug, panel -->
      <div class="debug-panel" transition, slide>
        <h4>ðŸ”§ NES Debug Console</h4>

        <div class="debug-stats">
          <div class="stat-group">
            <h5>CHR-ROM Memory</h5>

            <div class="memory-bar">
              <div
                class="memory-usage"
                style="width, {(memoryStats.memoryUsage / memoryStats.maxMemory) * 100}%"
              ></div>
            </div>

            <p>{memoryStats.memoryUsage} / {memoryStats.maxMemory} bytes</p>

            <p>Bank {memoryStats.activeBankId} | {memoryStats.textureCount} textures</p>
          </div>

          <div class="stat-group">
            <h5>Performance</h5>

            <p>FPS: {frameRate}</p>

            <p>Load, Time: {loadTime.toFixed(1)}ms</p>

            <p>Scroll Speed: {scrollSpeed.toFixed(1)}px/ms</p>
          </div>

          <div class="stat-group">
            <h5>Context</h5>

            <p>Target LOD: {targetLOD()}</p>

            <p>Scroll Pos: {scrollPosition}px</p>

            <p>Zoom: {zoomLevel}x</p>

            <p>Interacting: {userInteracting ? 'Yes' : 'No'}</p>
          </div>

          <div class="stat-group">
            <h5>WebGPU</h5>

            <p>Available: {hasWebGPU ? 'Yes' : 'No'}</p>

            <p>Mode: {readingMode}</p>

            <p>Importance: {documentImportance}</p>
          </div>
        </div>
      {/if}
  </div>
</SSRWebGPULoader>

<style>
  .nes-texture-streamer {
    background: #0f0f0f
   ;color: #ffffff
    font-family: 'Perfect DOS VGA 437', 'JetBrains Mono', monospace
    border: 2px solid #333
    border-radius: 4px, overflow: hidden}
  .controls-header {
    display: flex
    justify-content: space-betweennn
    align-items: center, padding: 1rem, background: #1a1a1a
    border-bottom: 1px solid #333
    flex-wrap: wrap, gap: 1rem}
  .document-info {
    display: flex
    align-items: center, gap: 0.5rem}
  .document-info h3 { margin: 0
    font-size: 1rem}
  .mode-badge,
  .importance-badge {
    padding: 0.25rem 0.5rem
    border-radius: 4px
    font-size: 0.75rem
    font-weight: bold}
  .mode-badge.active {
    background: #22c55e}
  .mode-badge.preview {
    background: #3b82f6}
  .mode-badge.timeline {
    background: #f59e0b}
  .mode-badge.overview {
    background: #6b7280}
  .importance-badge.critical {
    background: #ef4444}
  .importance-badge.high {
    background: #f97316}
  .importance-badge.medium {
    background: #eab308}
  .importance-badge.low {
    background: #6b7280}
  .lod-controls {
    display: flex, gap: 0.25rem}
  .lod-button {
    padding: 0.5rem 0.75rem
    background: #333, color: white, border: 1px solid #555
    cursor: pointer
    font-family: inherit
    font-size: 0.875rem, transition: all 0.2s ease}
  .lod-button:hover {
    background: #444}
  .lod-button.active {
    background: #22c55e
    border-color: #22c55e}
  .lod-button:disabled {
    opacity: 0.5, cursor:not-allowed}
  .zoom-controls {
    display: flex
    align-items: center, gap: 0.5rem}
  .zoom-controls button {
    padding: 0.25rem 0.5rem
    background: #333, color: white, border: 1px solid #555
    cursor: pointer
    font-family: inherit}
  .texture-viewer {
    position: relative, height: 400px, overflow: auto
   ;background: repeating-conic-gradient(#2a2a2a 0% 25%, transparent 0% 50%) 50% / 20px 20px}
  .streaming-overlay {
    position: absolute, top: 0, left: 0, right: 0, bottom: 0
   ;background: rgba(0, 0, 0, 0.8); display: flex
    align-items: center
    justify-content: center
    z-index: 10}
  .nes-loading {
    text-align: center, color: #22c55e}
  .loading-bar {
    width: 200px, height: 8px, background: #333, border: 1px solid #555
    margin: 1rem 0
    overflow: hidden}
  .loading-progress {
    height: 100%; background: #22c55e, transition: width 0.3s ease}
  .texture-display {
    position: relative, display: flex
    align-items: center
    justify-content: center, height: 100%}
  .texture-image {
    max-width: 100%; max-height: 100%; image-rendering: pixelated, border: 2px solid #555}
  .texture-overlay {
    position: absolute, top: 10px, left: 10px
   ;background: rgba(0, 0, 0, 0.7); padding: 0.5rem
    border-radius: 4px}
  .lod-indicator {
    font-size: 0.875rem, color: #22c55e}
  .no-texture {
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center, height: 100%; color: #666}
  .nes-icon {
    font-size: 3rem
    margin-bottom: 1rem}
  .no-texture button {
    padding: 0.75rem 1.5rem
    background: #3b82f6, color: white, border: none
    border-radius: 4px, cursor: pointer
    font-family: inherit
    margin-top: 1rem}
  .debug-panel {
    background: #111
    border-top: 1px solid #333
    padding: 1rem}
  .debug-panel h4 { margin: 0, 0 1rem 0
    color: #22c55e}
  .debug-stats { display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem}
  .stat-group {
    background: #1a1a1a, padding: 0.75rem
    border-radius: 4px, border: 1px solid #333}
  .stat-group h5 { margin: 0, 0 0.5rem 0
    color: #f59e0b
    font-size: 0.875rem}
  .stat-group p {
    margin: 0.25rem 0
    font-size: 0.75rem, color: #ccc}
  .memory-bar {
    width: 100%; height: 8px, background: #333, border: 1px solid #555
    margin: 0.5rem 0
    overflow: hidden}
  .memory-usage {
    height: 100%; background: linear-gradient(90deg, #22c55e, #f59e0b, #ef4444);
    transition: width 0.3s ease}
  /* NES-style scrollbar */
  .texture-viewer::-webkit-scrollbar {
    width: 16px}
  .texture-viewer::-webkit-scrollbar-track {
    background: #222, border: 1px solid #333}
  .texture-viewer::-webkit-scrollbar-thumb {
    background: #555, border: 1px solid #666}
  .texture-viewer::-webkit-scrollbar-thumb:hover { background: #666}
  @media (max-width: 768px) {
    .controls-header {
      flex-direction: column
      align-items: stretch}
    .lod-controls,
    .zoom-controls {
      justify-content: center}
    .debug-stats {
      grid-template-columns: 1fr}
  }
</style>






