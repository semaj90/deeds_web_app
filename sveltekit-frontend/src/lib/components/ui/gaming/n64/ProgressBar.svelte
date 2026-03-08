<!--
  N64 Progress Bar Component
  Advanced 3D progress indicator
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface Props {
    value?: number;
    max?: number;
    indeterminate?: boolean;
    showPercentage?: boolean;
    showValue?: boolean;
    label?: string;
    description?: string;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    animationStyle?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    meshComplexity?: 'low' | 'medium' | 'high' | 'ultra';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableTextureStreaming?: boolean;
    depth?: number;
    perspective?: number;
    barHeight?: number;
    enableParticles?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;
    enableProgressGlow?: boolean;
    enableWaveEffect?: boolean;
    animationDuration?: number;
    pulseOnComplete?: boolean;
    class?: string;
  }

  let {
    value = 0,
    max = 100,
    indeterminate = false,
    showPercentage = false,
    showValue = false,
    label,
    description,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    animationStyle = 'smooth',
    renderOptions = {},
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enableReflections = false,
    enableTextureStreaming = true,
    depth = 8,
    perspective = 1000,
    barHeight = 24,
    enableParticles = false,
    glowIntensity = 0.4,
    enableSpatialAudio = true,
    enableProgressGlow = true,
    enableWaveEffect = false,
    animationDuration = 500,
    pulseOnComplete = true,
    class: className = ''
  }: Props = $props();

  let progressElement = $state<HTMLElement | null>(null);

  let normalizedValue = $derived(Math.min(Math.max(value, 0), max));
  let percentage = $derived((normalizedValue / max) * 100);
  let displayValue = $derived(showPercentage ? `${Math.round(percentage)}%` : normalizedValue);
  let isComplete = $derived(percentage >= 100);

  const effectiveRenderOptions = $derived.by(() => ({
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  }));

</script>

<div class="n64-progress-container {className}">
  {#if label}
    <div class="progress-header">
      <span class="progress-label">{label}</span>
      {#if showValue || showPercentage}
        <span class="progress-value">{displayValue}</span>
      {/if}
    </div>
  {/if}

  {#if description}
    <div class="progress-description">{description}</div>
  {/if}

  <div
    bind:this={progressElement}
    class="n64-progress {materialType} mesh-{meshComplexity}"
    class:indeterminate
    class:complete={isComplete}
    role="progressbar"
    aria-valuenow={normalizedValue}
    aria-valuemin="0"
    aria-valuemax={max}
    style="
      --progress-height: {barHeight}px;
      --progress-value: {percentage}%;
      --perspective: {perspective}px;
      --depth: {depth}px;
      --glow-intensity: {glowIntensity};
    "
  >
    <div class="progress-track">
      <div class="progress-bar" style="width: {indeterminate ? '100%' : `${percentage}%`}">
        {#if enableTextureStreaming}
            <div class="texture-stream"></div>
        {/if}
        {#if enableProgressGlow}
            <div class="progress-glow"></div>
        {/if}
        {#if enableWaveEffect}
            <div class="wave-effect"></div>
        {/if}
      </div>

      {#if enableLighting}
        <div class="lighting-overlay"></div>
      {/if}
    </div>
  </div>
</div>

<style>
  .n64-progress-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: 'Rajdhani', sans-serif;
    width: 100%;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.9em;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  }

  .progress-description {
    font-size: 0.8em;
    color: rgba(255,255,255,0.7);
    margin-bottom: 4px;
  }

  .n64-progress {
    position: relative;
    height: var(--progress-height);
    background: #1a202c;
    border-radius: 999px;
    perspective: var(--perspective);
    overflow: hidden;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
  }

  .progress-track {
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
  }

  .progress-bar {
    height: 100%;
    background: #4a90e2;
    border-radius: 999px;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
  }

  .n64-progress.complete .progress-bar {
    background: #48bb78;
    box-shadow: 0 0 15px rgba(72, 187, 120, 0.6);
  }

  .n64-progress.indeterminate .progress-bar {
    width: 30% !important;
    position: absolute;
    animation: indeterminate 1.5s infinite linear;
    background: linear-gradient(90deg, transparent, #4a90e2, transparent);
  }

  @keyframes indeterminate {
    0% { left: -30%; }
    100% { left: 100%; }
  }

  .texture-stream {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 10px,
      rgba(255,255,255,0.1) 10px,
      rgba(255,255,255,0.1) 20px
    );
    animation: stream 20s linear infinite;
  }

  @keyframes stream {
    from { background-position: 0 0; }
    to { background-position: 100% 0; }
  }

  .progress-glow {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 20px;
    background: linear-gradient(90deg, transparent, white);
    opacity: 0.5;
    filter: blur(4px);
  }

  .wave-effect {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    animation: wave 2s infinite ease-in-out;
  }

  @keyframes wave {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .lighting-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,0.15), transparent);
    pointer-events: none;
    border-radius: 999px;
  }
</style>
