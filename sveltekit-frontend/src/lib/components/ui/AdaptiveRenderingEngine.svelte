<script lang="ts">
  import { onMount } from 'svelte';

  // Quality tier definitions
  export type QualityTier = '8-BIT_NES' | '16-BIT_SNES' | '64-BIT_N64';

  export interface QualityConfig { tier: QualityTier, targetResolution: number;
    pixelScale: number;
    shaderComplexity: number;
    textureStreamingEnabled: boolean;
    chrRomCacheSize: number;
    antiAliasing: boolean;
    particleEffects: boolean;
    advancedLighting: boolean;
  }

  export interface SystemMetrics { fps: number, frameTime: number;
    memoryUsage: number;
    cacheHitRate: number;
    gpuUtilization: number;
    drawCalls: number;
  }

  interface Props {
    content?: unknown;
    assetType?: string;
    priority?: number;
    predictive?: boolean;
    className?: string;
  }

  let {
    content,
    assetType = 'general',
    priority = 50,
    predictive = false,
    className = ''
  }: Props = $props();

  // Reactive state using Svelte 5 runes
  let currentQuality = $state<QualityConfig>({
    tier: '8-BIT_NES',
    targetResolution: 540,
    pixelScale: 2.0,
    shaderComplexity: 1,
    textureStreamingEnabled: false,
    chrRomCacheSize: 50,
    antiAliasing: false,
    particleEffects: false,
    advancedLighting: false
  });

  let systemMetrics = $state<SystemMetrics>({
    fps: 60,
    frameTime: 16.67,
    memoryUsage: 50,
    cacheHitRate: 80,
    gpuUtilization: 30,
    drawCalls: 100
  });

  let isMonitoring = $state(false);
  let canvasElement = $state<HTMLCanvasElement | undefined>(undefined);
  let renderContext = $state<CanvasRenderingContext2D | null>(null);

  // Animation frame loop
  let animationFrameId: number;

  function create8BitConfig(): QualityConfig {
    return {
      tier: '8-BIT_NES',
      targetResolution: 540,
      pixelScale: 2.0,
      shaderComplexity: 1,
      textureStreamingEnabled: false,
      chrRomCacheSize: 50,
      antiAliasing: false,
      particleEffects: false,
      advancedLighting: false
    };
  }

  function create16BitConfig(): QualityConfig {
    return {
      tier: '16-BIT_SNES',
      targetResolution: 720,
      pixelScale: 1.5,
      shaderComplexity: 2,
      textureStreamingEnabled: true,
      chrRomCacheSize: 100,
      antiAliasing: true,
      particleEffects: true,
      advancedLighting: false
    };
  }

  function create64BitConfig(): QualityConfig {
    return {
      tier: '64-BIT_N64',
      targetResolution: 1080,
      pixelScale: 1.0,
      shaderComplexity: 3,
      textureStreamingEnabled: true,
      chrRomCacheSize: 200,
      antiAliasing: true,
      particleEffects: true,
      advancedLighting: true
    };
  }

  function renderContent() {
    if (!renderContext || !canvasElement) return;
    const ctx = renderContext;

    // Clear
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Render placeholder content
    ctx.fillStyle = currentQuality.tier === '8-BIT_NES' ? '#4A90E2' :
                    currentQuality.tier === '16-BIT_SNES' ? '#357ABD' : '#2E6BA8';
    ctx.fillRect(10, 10, 100, 100);

    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.fillText(assetType.toUpperCase(), 15, 25);
    ctx.fillText(currentQuality.tier, 15, 45);
  }

  function loop() {
    if (!isMonitoring) return;
    renderContent();

    // Simulate metrics update
    systemMetrics.fps = Math.round(55 + Math.random() * 5);

    animationFrameId = requestAnimationFrame(loop);
  }

  $effect(() => {
    if (canvasElement) {
      renderContext = canvasElement.getContext('2d');
      isMonitoring = true;
      loop();
    }

    return () => {
      isMonitoring = false;
      cancelAnimationFrame(animationFrameId);
    };
  });
</script>

<div class="adaptive-rendering-container {className}">
  <canvas
    bind:this={canvasElement}
    class="rendering-canvas"
    width={currentQuality.targetResolution}
    height={Math.round(currentQuality.targetResolution * 0.75)}
  ></canvas>

  <!-- Quality Indicator -->
  {#if isMonitoring}
    <div class="quality-indicator">
      <div class="tier-badge {currentQuality.tier === '8-BIT_NES' ? 'nes' : currentQuality.tier === '16-BIT_SNES' ? 'snes' : 'n64'}">
        {currentQuality.tier.replace(/_/g, ' ')}
      </div>
      <div class="performance-stats">
        <span class="fps">FPS: {systemMetrics.fps}</span>
        <span class="memory">MEM: {systemMetrics.memoryUsage}%</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .adaptive-rendering-container { position: relative;
		display: inline-block;
    border-radius: 4px;
    overflow: hidden;
    background: #000;
  }

  .rendering-canvas { width: 100%;
		height: auto;
    display: block;
  }

  .quality-indicator { position: absolute;
		top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }

  .tier-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: bold;
    text-align: center;
    color: white;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
  }

  .tier-badge.nes { background: linear-gradient(45deg, #ff4444, #ff6666); }
  .tier-badge.snes { background: linear-gradient(45deg, #4444ff, #6666ff); }
  .tier-badge.n64 { background: linear-gradient(45deg, #44ff44, #66ff66); }

  .performance-stats { display: flex;
		gap: 4px;
    font-size: 6px;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
  }
</style>
