<!--
  N64 Input Component
  Advanced 3D text input with texture filtering
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface Props {
    type?: string;
    value?: string;
    placeholder?: string;
    name?: string;
    id?: string;
    required?: boolean;
    minlength?: number;
    maxlength?: number;
    pattern?: string;
    readonly?: boolean;
    disabled?: boolean;
    autocomplete?: HTMLInputElement['autocomplete'];

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    loading?: boolean;
    animationStyle?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    meshComplexity?: 'low' | 'medium' | 'high';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableInputGlow?: boolean;
    depth?: number;
    perspective?: number;
    rotationX?: number;
    enableParticles?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;

    // State
    error?: string;
    success?: string;
    class?: string;

    // Events
    oninput?: (e: Event) => void;
    onfocus?: (e: FocusEvent) => void;
    onblur?: (e: FocusEvent) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  let {
    type = 'text',
    value = $bindable(''),
    placeholder = '',
    name,
    id,
    required = false,
    minlength,
    maxlength,
    pattern,
    readonly = false,
    disabled = false,
    autocomplete,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    loading = false,
    animationStyle = 'smooth',
    renderOptions = {},
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enableReflections = false,
    enableInputGlow = true,
    depth = 8,
    perspective = 1000,
    rotationX = 0,
    enableParticles = false,
    glowIntensity = 0.3,
    enableSpatialAudio = true,
    error,
    success,
    class: className = '',

    oninput,
    onfocus,
    onblur,
    onkeydown
  }: Props = $props();

  let isFocused = $state(false);
  let isHovered = $state(false);
  let hasContent = $derived(value.length > 0);
  let inputElement = $state<HTMLInputElement | null>(null);

  const effectiveRenderOptions = $derived.by(() => ({
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  }));

  function handleInput(e: Event) {
    if (disabled) return;
    oninput?.(e);
  }

  function handleFocus(e: FocusEvent) {
      isFocused = true;
      onfocus?.(e);
  }

  function handleBlur(e: FocusEvent) {
      isFocused = false;
      onblur?.(e);
  }

  function getSizeStyles(s: string) {
      const map: Record<string, any> = {
          small: { padding: '8px 12px', fontSize: '12px' },
          medium: { padding: '12px 16px', fontSize: '14px' },
          large: { padding: '16px 20px', fontSize: '16px' },
          xl: { padding: '20px 24px', fontSize: '18px' }
      };
      return map[s] || map.medium;
  }

  const sizeStyle = $derived(getSizeStyles(size));

</script>

<div class="n64-input-container {className}">
  <div class="n64-input-wrapper">
    <input
      bind:this={inputElement}
      bind:value
      {type}
      {name}
      {id}
      {required}
      {minlength}
      {maxlength}
      {pattern}
      {readonly}
      {disabled}
      {autocomplete}
      {placeholder}
      oninput={handleInput}
      onfocus={handleFocus}
      onblur={handleBlur}
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
      onkeydown={onkeydown}
      class="n64-input {materialType} mesh-{meshComplexity}"
      class:error={!!error}
      class:success={!!success}
      class:disabled
      style="
        --input-padding: {sizeStyle.padding};
        --input-font-size: {sizeStyle.fontSize};
        --glow-intensity: {glowIntensity};
        --perspective: {perspective}px;
      "
      aria-invalid={!!error}
    />

    {#if enableLighting}
        <div class="lighting-overlay"></div>
    {/if}

    {#if enableInputGlow && isFocused}
        <div class="input-glow"></div>
    {/if}
  </div>

  {#if error || success}
    <div class="input-message" class:error={!!error} class:success={!!success}>
      {error || success}
    </div>
  {/if}
</div>

<style>
  .n64-input-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: 'Rajdhani', sans-serif;
    position: relative;
  }

  .n64-input-wrapper {
    position: relative;
    transform-style: preserve-3d;
    perspective: var(--perspective);
  }

  .n64-input {
    width: 100%;
    background: #2d3748;
    color: white;
    border: 2px solid #4a5568;
    border-radius: 4px;
    padding: var(--input-padding);
    font-size: var(--input-font-size);
    outline: none;
    transition: all 0.2s;
    transform: rotateX(0deg);
  }

  .n64-input:focus {
    border-color: #4a90e2;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3);
    transform: rotateX(-2deg) scale(1.01);
  }

  .n64-input.error {
    border-color: #dc3545;
  }

  .n64-input.success {
    border-color: #28a745;
  }

  .n64-input.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #1a202c;
  }

  .input-message {
    font-size: 0.8em;
    font-weight: 500;
  }

  .input-message.error { color: #dc3545; }
  .input-message.success { color: #28a745; }

  .lighting-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
    border-radius: 4px;
  }

  .input-glow {
    position: absolute;
    inset: -2px;
    border-radius: 6px;
    background: linear-gradient(45deg, #4a90e2, transparent);
    opacity: var(--glow-intensity);
    z-index: -1;
    filter: blur(4px);
  }
</style>
