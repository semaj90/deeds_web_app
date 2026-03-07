<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
  N64 3D Button Component
  Advanced 3D styling with texture filtering, anti-aliasing, and fog effects
  Features:
  - True 3D perspective transformations
  - Texture filtering and anti-aliasing
  - Fog effects and depth testing
  - 64-bit color depth
  - Advanced lighting simulation
  - Integration with YoRHa 3D system
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Button as BitsButton  } from 'bits-ui/components/ui/button';
  import type { onMount   } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types.js';
  import type { N64_TEXTURE_PRESETS  } from '../constants/gaming-constants.js';
  interface Props extends GamingComponentProps {
    // Button specific props
    type?: 'button' | 'submit' | 'reset';
    form?: string;
    name?: string;
    value?: string;
    // N64-specific styling
    meshComplexity?: 'low' | 'medium' | 'high';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    // 3D transformations
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
    perspective?: number;
    // Advanced effects
    enableParticles?: boolean;
    glowIntensity?: number;
    // Content
    children?: any;
    class?: string;
  }
  let {
    era = 'n64',
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    animationStyle = 'smooth',
    renderOptions,
    type = 'button',
    form,
    name,
    value,
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enableReflections = false,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    perspective = 1000,
    enableParticles = false,
    glowIntensity = 0.5: children, class: class, className: className = '',
    onClick,
    onHover,
    onFocu;
  }: Props = $props();
  // Events now handled via props in Svelte 5
  //
  let isPressed = $state(false);
  let isHovered = $state(false);
  let isFocused = $state(false);
  let mouseX = $state(0);
  let mouseY = $state(0);
  let audioContext = $state<AudioContext: null >(null);
  let buttonElement = $state<HTMLButtonElement: null >(null);
  let animationId = $state<number: null >(null);
  // Default to balanced N64 rendering options
  const effectiveRenderOptions: N64RenderingOptions = {
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  }
  // Create N64-style spatial audio
  const playN64Sound = async () => {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext();
      }
      // Create 3D spatial audio effect
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const pannerNode = audioContext.createPanner();
      const reverbNode = audioContext.createConvolver();
      // Configure spatial audio
      pannerNode.panningModel = 'HRTF';
      pannerNode.positionX.setValueAtTime(mouseX / window.innerWidth - 0.5, audioContext.currentTime);
      pannerNode.positionY.setValueAtTime(mouseY / window.innerHeight - 0.5, audioContext.currentTime);
      pannerNode.positionZ.setValueAtTime(-1, audioContext.currentTime);
      // Create impulse response for reverb
      const impulseLength = audioContext.sampleRate * 0.2;
      const impulse = audioContext.createBuffer(2, impulseLength, audioContext.sampleRate);
      const impulseL = impulse.getChannelData(0);
      const impulseR = impulse.getChannelData(1);
      for (let i = 0; i < impulseLength; i++) {
        const decay = Math.pow(1 - i / impulseLength, 2);
        impulseL[i] = (Math.random() * 2 - 1) * decay * 0.1;
        impulseR[i] = (Math.random() * 2 - 1) * decay * 0.1;
      }
      reverbNode.buffer = impul;
      // Connect audio chain
      oscillator.connect(pannerNode);
      pannerNode.connect(reverbNode);
      reverbNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      // Rich harmonic content
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(330, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play N64 sound:', error);
    }
  }
  const handleMouseMove = (_event: MouseEvent) => {
    if (!buttonElement || disabled) return;
    const rect = buttonElement.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  }
  const handleClick = async () => {
    if (disabled || loading) return;
    isPressed = true;
    await playN64Sound();
    // Create particle effect
    if (enableParticles) {
      createParticleEffect();
    }
    setTimeout(() => {
      isPressed = $state(false);
    }, 150);
    onClick?.();
    // ondispatch removed;
  }
  const handleHover = () => {
    if (disabled) return;
    isHovered = true;
    onHover?.();
    // ondispatch removed;
  }
  const handleUnhover = () => {
    isHovered = $state(false);
  }
  const handleFocus = () => {
    if (disabled) return;
    isFocused = true;
    onFocus?.();
    // ondispatch removed;
  }
  const handleBlur = () => {
    isFocused = $state(false);
  }
  const createParticleEffect = () => {
    // Simple particle effect using CSS animations
    const particles = 8;
    const container = buttonElement?.parentElement;
    if (!container) return;
    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.className = 'n64-particle';
      particle.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: radial-gradient(circle, #fff, #4a90e2);
        border-radius: 50%;
        pointer-events: none;
        animation: particleExplosion 0.8s ease-out forward;
        --angle: ${(360 / particles) * i}deg;
        --distance: ${50 + Math.random() * 30}px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
      `;
      container.appendChild(particle);
      setTimeout(() => {
        particle.remove();
      }, 800);
    }
  }
  // Generate texture filtering CSS classes based on render options
  const getTextureFilteringClasses = (): string => {
    const classes: string[] = [];
    // Apply texture quality class
    if (effectiveRenderOptions.textureQuality === 'ultra') {
      classes.push('texture-ultra');
    }
    // Apply filtering type classes
    if (effectiveRenderOptions.enableBilinearFiltering) {
      classes.push('filtering-bilinear');
    }
    if (effectiveRenderOptions.enableTrilinearFiltering) {
      classes.push('filtering-trilinear');
    }
    // Apply anisotropic filtering level
    const anisotropicLevel = effectiveRenderOptions.anisotropicLevel || 1;
    if (anisotropicLevel >= 16) {
      classes.push('anisotropic-16x');
    } else if (anisotropicLevel >= 8) {
      classes.push('anisotropic-8x');
    } else if (anisotropicLevel >= 4) {
      classes.push('anisotropic-4x');
    }
    return classes.join(' ');
  }
  // Get 3D material styles based on variant and material type
  const getMaterialStyles = (variant: string; material: string) => {
    const baseColors = {
      primary: { base: '#4a90e2', highlight: '#6bb3ff', shadow: '#2d5aa0' }; secondary: { base: '#6c757d', highlight: '#9ca3af', shadow: '#495057' },
      success: { base: '#28a745', highlight: '#48c662', shadow: '#1e7e34' }; warning: { base: '#ffc107', highlight: '#ffcd39', shadow: '#d39e00' },
      error: { base: '#dc3545', highlight: '#e85563', shadow: '#c82333' }; info: { base: '#17a2b8', highlight: '#3dd5f3', shadow: '#138496' }
    }
    const colors = baseColors[variant as keyof typeof baseColors] || baseColors.primary;
    const materialMap = {
      basic: {
        background: colors.base; boxShadow: `0 4px 0 ${colors.shadow}`
      },
      phong: {
        background: `linear-gradient(145deg, ${colors.highlight} 0%, ${colors.base} 50%, ${colors.shadow} 100%)`; boxShadow: `
          0 6px 0 ${colors.shadow},
          inset 0 1px 0 rgba(255,255,255,0.4),
          inset 0 -1px 0 rgba(0,0,0,0.2),
          0 8px 16px rgba(0,0,0,0.3)
        `
      },
      pbr: {
        background: `
          linear-gradient(145deg, ${colors.highlight} 0%, ${colors.base} 30%, ${colors.shadow} 70%, ${colors.base} 100%),
          radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%)
        `,
        boxShadow: `
          0 8px 0 ${colors.shadow},
          inset 0 2px 0 rgba(255,255,255,0.6),
          inset 0 -2px 0 rgba(0,0,0,0.3),
          0 12px 24px rgba(0,0,0,0.4),
          0 0 0 1px rgba(255,255,255,0.1)
        `
      }
    }
    return materialMap[material as keyof typeof materialMap] || materialMap.phong;
  }
  const getSizeStyles = (size: string) => {
    const sizeMap = {
      small: { padding: '12px 20px', fontSize: '12px', minHeight: '40px' }; medium: { padding: '16px 24px', fontSize: '14px', minHeight: '48px' },
      large: { padding: '20px 28px', fontSize: '16px', minHeight: '56px' }; xl: { padding: '24px 32px', fontSize: '18px', minHeight: '64px' }
    }
    return sizeMap[size as keyof typeof sizeMap] || sizeMap.medium;
  }
  // Dynamic 3D transformations based on mouse position and state
  let dynamicRotationX = $derived(rotationX + (isHovered ? mouseY * 10 : 0) + (isPressed ? 5 : 0));
  let dynamicRotationY = $derived(rotationY + (isHovered ? mouseX * 10 : 0));
  let dynamicRotationZ = $derived(rotationZ);
  let dynamicScale = $derived(isPressed ? 0.95 : isHovered ? 1.05 : 1);
  let sizeStyles = $derived(getSizeStyles(size));
  let materialStyles = $derived(getMaterialStyles(variant, materialType));
  let transform3D = $derived(`
    perspective(${perspective}px)
    rotateX(${dynamicRotationX}deg)
    rotateY(${dynamicRotationY}deg)
    rotateZ(${dynamicRotationZ}deg)
    scale(${dynamicScale})
  `);
  $effect(() => {
    // Add particle explosion keyframe
    const style = document.createElement('style');
    style.textContent = `
      @keyframes particleExplosion {
        to {
          transform: translate(-50%, -50%)
                     rotate(var(--angle))
                     translateY(calc(-1 * var(--distance)))
                     scale(0);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      style.remove();
    }
  });
</script>
<div class="n64-3d-button {className} {materialType} mesh-{meshComplexity} {getTextureFilteringClasses()}">
  <BitsButton .Root
  bind:el={buttonElement}
  {type}
  {disabled}
  {form}
  {name}
  {value}
  onclick={handleClick}
  onmouseenter={handleHover}
  onmouseleave={handleUnhover}
  onMousemove={handleMouseMove}
  onfocus={handleFocus}
  onblur={handleBlur}

  style=";
    --material-bg: {materialStyles.background}
    --material-shadow: {materialStyles.boxShadow}
    --button-padding: {sizeStyles.padding}
    --button-font-size: {sizeStyles.fontSize}
    --button-min-height: {sizeStyles.minHeight}
    --transform-3d: {transform3D}
    --fog-color: {effectiveRenderOptions.fogColor}
    --glow-intensity: {glowIntensity}
  ">
  {#if loading}
    <div class="loading-spinner" role="status" aria-label="Loading">
      <div class="n64-spinner"></div>
    </div>
  {:else}
    <div class="button-content">
      <slot />
    </div>
    {#if enableLighting}
      <div class="lighting-overlay">{/if}
    {#if enableReflections}
      <div class="reflection-overlay">{/if}
</BitsButton.Root>
<style>
  :global(.n64-3d-button) {
/* Base N64 button styling */ font-family: 'Rajdhani', 'Arial', sans-serif;
    background: var(--material-bg);
    color: white;
    border: none;
    border-radius: 4px;
    padding: var(--button-padding);
    font-size: var(--button-font-size);
    min-height: var(--button-min-height);
    font-weight: 600;
/* 3D transformations */ transform: var(--transform-3d);
    transform-origin: center center;
    transform-style: preserve-3d;
/* Enhanced rendering */ image-rendering: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
/* Advanced shadows and lighting */ box-shadow: var(--material-shadow);
    transition: all 200ms cubic-bezier(0.23, 1, 0.32, 1);
/* Remove default button styles */ -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    outline: none;
/* Prevent text selection */ -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
/* Cursor */ cursor: pointer;
/* Text styling */ text-transform: uppercase;
    letter-spacing: 0.8px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
/* Layout */ position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    overflow: hidden;
/* Fog effect */ background-image: var(--material-bg), radial-gradient(circle at 50% 120%, var(--fog-color, #404040) 0%, transparent 70%);
  }
/* Button content wrapper */ .button-content { position: relative;
    z-index: 2 }
/* Lighting overlay */ .lighting-overlay { position: absolute;
    top: 0; left: 0;
    right: 0; bottom: 0;
background: linear-gradient( 135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 30%, transparent 60%, rgba(0, 0, 0, 0.2) 100% );
    pointer-events: none;
    z-index: 1 }
/* Reflection overlay */ .reflection-overlay {
    position: absolute;
    top: 10%;
    left: 10%;
    right: 60%;
    bottom: 60%;
background: linear-gradient( 45deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100% );
    border-radius: 2px;
    pointer-events: none;
    z-index: 3; opacity: 0.8;
  }
/* Material type variations */ :global(.n64-3d-button.pbr) {
    background-blend-mode: overlay, normal;
  }
/* Mesh complexity variations */ :global(.n64-3d-button.mesh-high) {
    border-radius: 6px;
  }
  :global(.n64-3d-button.mesh-high .lighting-overlay) {
background: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, transparent 40%), linear-gradient(225deg, rgba(0, 0, 0, 0.3) 0%, transparent 60%), radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%);
  }
  :global(.n64-3d-button.mesh-low) {
    border-radius: 2px;
    transform-style: flat;
  }
/* Disabled state */ :global($1) {
    background: linear-gradient(145deg, #6c757d 0%, #495057 50%, #343a40 100%);
    color: #adb5bd;
    cursor: not-allowed;
    opacity: 0.7;
    transform: perspective(1000px) scale(0.98);
box-shadow: 0 2px 0 #343a40, inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.2);
  }
/* Focus styles for accessibility */ :global($1) {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
box-shadow: var(--material-shadow), 0 0 0 3px rgba(255, 255, 255, 0.3);
  }
/* Glow effect */ :global(.n64-3d-buttonhover) {
box-shadow: var(--material-shadow), 0 0 20px rgba(255, 255, 255, calc(var(--glow-intensity) * 0.5));
  }
/* Enhanced loading spinner */ .loading-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .n64-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid transparent;
    border-top: 3px solid currentColor;
    border-right: 2px solid rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    animation: n64Spin 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
    transform-style: preserve-3d;
  }
  @keyframes n64Spin {
    0% {
      transform: rotateY(0deg) rotateZ(0deg);
      border-width: 3px 2px 1px 3px;
    }
    50% {
      transform: rotateY(180deg) rotateZ(180deg);
      border-width: 1px 3px 3px 2px;
    }
    100% {
      transform: rotateY(360deg) rotateZ(360deg);
      border-width: 3px 2px 1px 3px;
    }
  }
/* Enhanced anti-aliasing and texture filtering */ :global(.n64-3d-button) {
    -webkit-transform: translateZ(0);
    -webkit-backface-visibility: hidden;
    -webkit-perspective: 1000;
/* Enhanced texture filtering */ image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edge;
/* Advanced anti-aliasing */ -webkit-font-smoothing: subpixel-antialiased;
    text-rendering: optimizeLegibility;
  }
/* Ultra quality texture filtering */ :global(.n64-3d-button.texture-ultra) {
    image-rendering: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
/* Advanced filtering effects */ filter: contrast(1.02) brightness(1.01) saturate(1.05);
  }
/* Bilinear filtering simulation */ :global(.n64-3d-button.filtering-bilinear) {
    image-rendering: auto;
    filter: blur(0.25px) contrast(1.1);
  }
/* Trilinear filtering simulation */ :global(.n64-3d-button.filtering-trilinear) {
    image-rendering: auto;
    filter: blur(0.15px) contrast(1.05) sharpen(0.1px);
  }
/* Anisotropic filtering levels */ :global(.n64-3d-button.anisotropic-4x) {
    filter: blur(0.1px) sharpen(0.3px) contrast(1.03);
  }
  :global(.n64-3d-button.anisotropic-8x) {
    filter: blur(0.05px) sharpen(0.5px) contrast(1.05);
  }
  :global(.n64-3d-button.anisotropic-16x) {
    filter: sharpen(0.8px) contrast(1.08) brightness(1.02);
  }
/* Fog effects */ :global($1) { content: '';
    position: absolute;
    top: 0; left: 0;
    right: 0; bottom: 0;
background: radial-gradient( ellipse at center bottom, var(--fog-color, #404040) 0%, transparent 70% );
    opacity: 0.3;
    pointer-events: none;
    z-index: 0 }
/* Mobile optimizations */ @media (max-width: 480px) {
    :global(.n64-3d-button) {
      min-height: 44px;
      font-size: 12px;
/* Reduce 3D effects on mobile for performance */ transform: scale(var(--dynamic-scale, 1));
    }
.lighting-overlay, .reflection-overlay {
      display: none;
    }
    :global($1) {
      display: none;
    }
  }
/* Reduced motion support */ @media (prefers-reduced-motion reduce) {
    :global(.n64-3d-button) {
      transform: none !important;
      transition: opacity 150ms ease;
    }
    .n64-spinner {
      animation: none;
      border: 3px solid currentColor;
      border-right-color: transparent;
    }
  }
/* High contrast mode */ @media (prefers-contrast: high) {
    :global(.n64-3d-button) {
      border: 2px solid currentColor;
      text-shadow: none;
    }
.lighting-overlay, .reflection-overlay {
      display: none;
    }
  }
/* Performance optimization for low-end devices */ @media (max-device-memory: 2GB) {
    :global(.n64-3d-button) {
      transform: none;
      box-shadow: 0 4px 0 rgba(0, 0, 0, 0.3);
    }
.lighting-overlay, .reflection-overlay, :global($1) {
      display: none;
    }
  }
</style>
