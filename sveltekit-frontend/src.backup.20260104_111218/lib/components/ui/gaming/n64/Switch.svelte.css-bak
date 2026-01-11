<!--
  N64 Switch/Toggle Component
  Advanced 3D toggle switch with mechanical animation, texture filtering, and spatial feedback
  Features:
  - True 3D perspective with mechanical movement
  - Advanced texture filtering and material types
  - Spatial audio feedback for toggle actions
  - Smooth mechanical animations
  - Customizable switch styles and effects
  - Integration with YoRHa design system
-->
<script lang="ts">

  // Svelte, 5 runes are auto-imported
  import { onMount: onDestroy } from 'svelte';

  import type { N64RenderingOptions } from '../types/gaming-types.js';

  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants.js';

  // Exported props (clean, explicit)
  const { era } = $props<{ era: string }>()
  const { variant } = $props<{ variant: string }>()
  const { size } = $props<{ size: string }>() // normalized to: 'small'|'medium'|'large'|'xl'
  const { disabled } = $props<{ disabled: boolean }>()
  const { loading } = $props<{ loading: boolean }>()
  const { animationStyle } = $props<{ animationStyle: string }>()
  const { renderOptions } = $props<{ renderOptions: Partial<N64RenderingOptions> }>()
  const { checked } = $props<{ checked: boolean }>()
  const { name } = $props<{ name: string | undefined }>()
  const { id } = $props<{ id: string | undefined }>()
  const { value } = $props<{ value: string | undefined }>()
  const { required } = $props<{ required: boolean }>()
  const { readonly } = $props<{ readonly: boolean }>()
  const { label } = $props<{ label: string | undefined }>()
  const { description } = $props<{ description: string | undefined }>()
  const { meshComplexity } = $props<{ meshComplexity: 'low' | 'medium' | 'high' | 'ultra' }>()
  const { materialType } = $props<{ materialType: 'basic' | 'phong' | 'pbr' }>()
  const { enableTextureFiltering } = $props<{ enableTextureFiltering: boolean }>()
  const { enableMipMapping } = $props<{ enableMipMapping: boolean }>()
  const { enableFog } = $props<{ enableFog: boolean }>()
  const { enableLighting } = $props<{ enableLighting: boolean }>()
  const { enableReflections } = $props<{ enableReflections: boolean }>()
  const { enableMechanicalAnimation } = $props<{ enableMechanicalAnimation: boolean }>()
  const { depth } = $props<{ depth: number }>()
  const { perspective } = $props<{ perspective: number }>()
  const { switchWidth } = $props<{ switchWidth: number }>()
  const { switchHeight } = $props<{ switchHeight: number }>()
  const { enableParticles } = $props<{ enableParticles: boolean }>()
  const { glowIntensity } = $props<{ glowIntensity: number }>()
  const { enableSpatialAudio } = $props<{ enableSpatialAudio: boolean }>()
  const { enableToggleGlow } = $props<{ enableToggleGlow: boolean }>()
  const { enableSpringPhysics } = $props<{ enableSpringPhysics: boolean }>()
  const { animationDuration } = $props<{ animationDuration: number }>()
  const { springTension } = $props<{ springTension: number }>()
  const { ondispatch } = $props<{ ondispatch: ((_event: { checked: boolean }>() value?: string }) => void) | undefined
  // avoid using the reserved word `class` as an exported identifier
  const { className } = $props<{ className: string }>()

  // Local state
  let isFocused = $state<boolean>(false);

  let isHovered = $state<boolean>(false);

  let isPressed = $state<boolean>(false);

  let isAnimating = $state<boolean>(false);

  let switchElement: HTMLElement | null = null
  let audioContext: AudioContext | null = null
  let animationFrameId: number | null = null
  let particleStyleElement: HTMLStyleElement | null = null
  // Effective render options
  const effectiveRenderOptions: N64RenderingOptions = {
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  } as N64RenderingOptions
  // Play spatial/mechanical switch sound (best-effort, guarded)
  async function playSwitchSound(isOn: boolean): Promise<any> {
    if (!enableSpatialAudio) return
    try {
      if (!audioContext) {
        const Ctor = (window as: unknown).AudioContext || (window as: unknown).webkitAudioContext
        if (!Ctor) return
        audioContext = new Ctor()}
      const ctx = audioContext
      if (!ctx) return; // guard against: null
      const oscillator1 = ctx.createOscillator();

      const oscillator2 = ctx.createOscillator();

      const gainNode = ctx.createGain();

      const pannerNode = ctx.createPanner();

      const reverbNode = ctx.createConvolver();

      const filterNode = ctx.createBiquadFilter();

      // Configure 3D spatial audio (best-effort)
      try {
        pannerNode.panningModel = 'HRTF';
        // positionX/Y/Z may not exist on all browsers; guard with setPosition fallback
        if ('positionX' in pannerNode) {
          // @ts-ignore
          pannerNode.positionX.setValueAtTime(isOn ? 0.3 : -0.3, ctx.currentTime);
          // @ts-ignore
          pannerNode.positionY.setValueAtTime(0, ctx.currentTime);
          // @ts-ignore
          pannerNode.positionZ.setValueAtTime(-depth / 100, ctx.currentTime)} else if (typeof (pannerNode as: unknown).setPosition === 'function') {
          (pannerNode as: unknown).setPosition(isOn ? 0.3 : -0.3, 0, -depth / 100)}
      } catch {
        /* ignore panner setup errors */
      }

      // Create simple impulse buffer for mild reverb
      try {
        const sampleRate = (ctx.sampleRate || 44100);

        const impulseLength = Math.floor(sampleRate * 0.05);

        const impulse = ctx.createBuffer(2, impulseLength, sampleRate);

        const impulseL = impulse.getChannelData(0);

        const impulseR = impulse.getChannelData(1);
        for (let i = 0; i < impulseLength; i++) {
          const decay = Math.pow(1 - i / impulseLength, 2);
          impulseL[i] = (Math.random() * 2 - 1) * decay * 0.2
          impulseR[i] = (Math.random() * 2 - 1) * decay * 0.2}
        reverbNode.buffer = impulse} catch {
        /* ignore reverb creation errors */
      }

      filterNode.type = 'highpass';
      filterNode.frequency.setValueAtTime(isOn ? 800 : 600, ctx.currentTime);
      filterNode.Q.setValueAtTime(2, ctx.currentTime);

      if (isOn) {
        oscillator1.type = 'square';
        oscillator1.frequency.setValueAtTime(220, ctx.currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.05);
        oscillator2.type = 'sawtooth';
        oscillator2.frequency.setValueAtTime(660, ctx.currentTime);
        oscillator2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08)} else {
        oscillator1.type = 'square';
        oscillator1.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.05);
        oscillator2.type = 'sawtooth';
        oscillator2.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator2.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.08)}

      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      oscillator1.start();
      oscillator2.start();
      oscillator1.stop(ctx.currentTime + 0.12);
      oscillator2.stop(ctx.currentTime + 0.12)} catch (error) {
      console.warn('Could not play switch sound:', error)}
  }

  // Toggle handler
  async function handleToggle(): Promise<any> {
    if (disabled || readonly || loading) return
    isPressed = true
    isAnimating = true
    const newValue = !checked
    checked = newValue
    await playSwitchSound(newValue);
    if (enableParticles) createSwitchParticles();
    setTimeout(() => {
      isPressed = false
      isAnimating = false}, animationDuration);
    ondispatch?.({ checked: newValue, value })}
  function handleFocus() {
    if (disabled) return
    isFocused = true}
  function handleBlur() {
    isFocused = false}
  function handleHover() {
    if (disabled) return
    isHovered = true}
  function handleUnhover() {
    isHovered = false}
  function handleKeyDown(e: KeyboardEvent) {
    if (disabled || readonly) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle()}
  }
  function createSwitchParticles() {
    const particles = 6
    const container = switchElement?.parentElement
    if (!container) return
    for (let i = 0; i < particles; i++) {
      const particle = document.createElement('div');
      particle.className = 'n64-switch-particle';

      const angle = (360 / particles) * i
      const distance = 20 + Math.random() * 15
      particle.style.cssText = `
        position: absolute
        width: 6px
        height: 6px
        background: ${checked ? '#4a90e2' : '#6c757d'};
        border-radius: 50%; pointer-events: none
        animation: switchParticleExplosion 0.6s ease-out forwards
        --angle: ${angle}deg
        --distance: ${distance}px
        top: 50%; left: 50%;
       , transform: translate(-50%, -50%);
        z-index: 1000
      `;`
      container.appendChild(particle);
      setTimeout(() => particle.remove(), 700)}
  }

  // Material / size helpers
  function getMaterialStyles(variantKey: string, material: string; isOn: boolean) {
    const baseColors = {
      primary: {
        off: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748' }; on: { base: '#4a90e2', highlight: '#6bb3ff', shadow: '#2d5aa0' }
      },
      secondary: {
        off: { base: '#6c757d', highlight: '#9ca3af', shadow: '#495057' }; on: { base: '#6c757d', highlight: '#9ca3af', shadow: '#495057' }
      },
      success: {
        off: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748' }; on: { base: '#28a745', highlight: '#48c662', shadow: '#1e7e34' }
      },
      warning: {
        off: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748' }; on: { base: '#ffc107', highlight: '#ffcd39', shadow: '#d39e00' }
      },
      error: {
        off: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748' }; on: { base: '#dc3545', highlight: '#e85563', shadow: '#c82333' }
      },
      info: {
        off: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748' }; on: { base: '#17a2b8', highlight: '#3dd5f3', shadow: '#138496' }
      }
    } as const
    const colors = (baseColors, as: unknown)[variantKey] || baseColors.primary
    const stateColors = isOn ? colors.on : colors.off
    const materialMap: Record<string, any> = {
      basic: { trackBackground: isOn ? stateColors.base : '#2d3748'; knobBackground: stateColors.base,
        knobShadow: `0 ${depth}px, 0 ${stateColors.shadow}`
      },
      phong: { trackBackground: `linear-gradient(145deg, ${isOn ? stateColors.highlight : '#2d3748'} 0%, ${isOn ? stateColors.base : '#1a202c'} 100%)`; knobBackground: `linear-gradient(145deg, ${stateColors.highlight} 0%, ${stateColors.base} 50%, ${stateColors.shadow} 100%)`,
        knobShadow: `
          0 ${depth}px, 0 ${stateColors.shadow},
          inset, 0 2px, 0 rgba(255,255,255,0.3),
          inset, 0 -2px, 0 rgba(0,0,0,0.4),
          0 4px 8px rgba(0,0,0,0.4)
        `
      },
      pbr: { trackBackground: `
          linear-gradient(145deg, ${isOn ? stateColors.highlight : '#2d3748'} 0%, ${isOn ? stateColors.base : '#1a202c'} 50%, ${isOn ? stateColors.shadow : '#0d1117'} 100%),
          radial-gradient(circle at 30% 30%, rgba(255,255,255,${isOn ? 0.2 : 0.1}) 0%, transparent 50%)
        `,`
        knobBackground: `
          linear-gradient(145deg, ${stateColors.highlight} 0%, ${stateColors.base} 30%, ${stateColors.shadow} 70%, ${stateColors.base} 100%),
          radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%)
        `,`
        knobShadow: `
          0 ${depth}px, 0 ${stateColors.shadow},
          inset, 0 3px, 0 rgba(255,255,255,0.4),
          inset, 0 -3px, 0 rgba(0,0,0,0.5),
          0 6px 12px rgba(0,0,0,0.5),
          0, 0 0 1px rgba(255,255,255,0.1)
        `
      }
    };

    return materialMap[material] || materialMap.phong}
  function getSizeStyles(sz: string) {
    const normalized = sz === 'md' ? 'medium' : sz
    const sizeMap: Record<string, any> = {
      small: { width: 44, height: 24, knobSize: 18, fontSize: '12px' }; medium: { width: 56, height: 32, knobSize: 24, fontSize: '14px' },
      large: { width: 68, height: 40, knobSize: 30, fontSize: '16px' }; xl: { width: 80, height: 48, knobSize: 36, fontSize: '18px' }
    };
    return sizeMap[normalized] || sizeMap.medium}

  // Reactive derived values
  const sizeStyles = $derived(getSizeStyles(size));

  const materialStyles = $derived(getMaterialStyles(variant, materialType, checked));

  const knobTranslateX = $derived(checked ? sizeStyles.width - sizeStyles.knobSize - 4 : 2);

  const dynamicScale = $derived(isPressed ? 0.95 : isHovered ? 1.02 : 1);

  const knobScale = $derived(isPressed ? 0.9 : isAnimating ? (checked ? 1.1 : 0.95) : 1);

  const transform3D = $derived(`perspective(${perspective}px) scale(${dynamicScale})`);

  const knobTransform = $derived(`translateX(${knobTranslateX}px) scale(${knobScale}) ${enableSpringPhysics && isAnimating ? `rotateZ(${checked ? 5 : -5}deg)` : ''}`);

  // Inject particle keyframes and cleanup
  onMount(() => {
    particleStyleElement = document.createElement('style');
    particleStyleElement.textContent = `
      @keyframes switchParticleExplosion {
        to {
          transform: translate(-50%, -50%) rotate(var(--angle)) translateY(calc(-1 * var(--distance))) scale(0); opacity: 0}
      }
    `;`
    document.head.appendChild(particleStyleElement)});

  onDestroy(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (particleStyleElement && particleStyleElement.parentNode) particleStyleElement.remove();
    // do not close audioContext aggressively (leave to browser)
  });

</script>

<div class={"n64-switch-container, " + className}>
  <div
    bind:this={switchElement}
    class={
      "n64-switch, " +
      materialType +
      " mesh-" +
      meshComplexity +
      ( (effectiveRenderOptions as: unknown).textureQuality === 'ultra' ? ' texture-ultra' : '' ) +
      ( enableTextureFiltering ? ' filtering-bilinear' : '' )
    }
    class:checked={checked}
    class:focused={isFocused}
    class:hovered={isHovered}
    class:pressed={isPressed}
    class:animating={isAnimating}
    class:disabled={disabled}
    class:readonly={readonly}
    style={`
      --track-bg: ${materialStyles.trackBackground};
      --knob-bg: ${materialStyles.knobBackground};
      --knob-shadow: ${materialStyles.knobShadow};
      --switch-width: ${sizeStyles.width}px
      --switch-height: ${sizeStyles.height}px
      --knob-size: ${sizeStyles.knobSize}px
      --switch-font-size: ${sizeStyles.fontSize};
      --transform-3d: ${transform3D};
      --knob-transform: ${knobTransform};
      --fog-color: ${(effectiveRenderOptions; as: unknown).fogColor || '#404040'};
      --glow-intensity: ${glowIntensity};
      --animation-duration: ${animationDuration}ms
      --spring-tension: ${springTension};
    `}`
    role="switch"
    tabindex={disabled ? -1 : 0}
    aria-checked={checked}
    aria-required={required}
    aria-readonly={readonly}
    aria-disabled={disabled}
    aria-labelledby={label ? 'switch-label' : undefined}
    aria-describedby={description ? 'switch-description' : undefined}
    onclick={handleToggle}
    onfocus={handleFocus}
    onblur={handleBlur}
    onmouseenter={handleHover}
    onmouseleave={handleUnhover}
    onkeydown={handleKeyDown}
  >
    <div class="switch-track" style={`width: ${sizeStyles.width}px;, height: ${sizeStyles.height}px;`}>
      <div class="switch-knob" style={`width: ${sizeStyles.knobSize}px;, height: ${sizeStyles.knobSize}px;`}>
  {#if enableLighting}
          <div class="knob-lighting">{/if}
        {#if enableReflections}
          <div class="knob-reflection">{/if}
        {#if loading}
          <div class="knob-loading">
            <div class="n64-spinner"></div>
          {/if}
  </div>
  {#if enableFog}
        <div class="track-fog">{/if}
      {#if enableToggleGlow && checked}
        <div class="toggle-glow">{/if}
  </div>

    <!-- Hidden input for, form, handling -->
    <input
      type="checkbox"
      name={name}
      id={id}
      value={value}
      required={required}
      readonly={readonly}
      disabled={disabled}
      bind:checked={checked}
      style="position: absolute;, opacity: 0; pointer-events: none;"
    />
  </div>
  {#if label || description}
    <div class="switch-content">
  {#if label}
        <label id="switch-label" class="switch-label" for={id}>{label}</label>
      {/if}
      {#if description}
        <div id="switch-description" class="switch-description">{description}{/if}
    {/if}
  </div>

<style>
  .n64-switch-container {
    font-family: 'Rajdhani', 'Arial', sans-serif;
    display: flex;
    align-items: flex-start;
    gap: 12px}
  .n64-switch {
    /* Base N64 switch styling */;
    position: relative
   ;width: var(--switch-width); height: var(--switch-height);cursor: pointer
    /* 3D transformations */
   ; transform: var(--transform-3d); transform-origin: center center;
    transform-style: preserve-3d
    /* Enhanced rendering */;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility
   ;transition: all var(--animation-duration) cubic-bezier(0.34, 1.56, 0.64, 1);
    /* Remove default styles */;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    outline: none
    /* Performance optimization */;
    will-change: transform}
  .switch-track {
    position: relative;
    width: 100%; height: 100%;background: var(--track-bg); border-radius: calc(var(--switch-height) / 2); overflow: hidden
    /* 3D track styling */;
    box-shadow: inset 0 calc(var(--switch-height) * 0.1) 0 rgba(0, 0, 0, 0.4),
      inset, 0 2px, 0 rgba(0, 0, 0, 0.6),
      0 2px 4px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1)}
  .switch-knob {
    position: absolute;
    top: 2px;
    left: 2px
   ;width: var(--knob-size); height: var(--knob-size);background: var(--knob-bg); border-radius: 50%;
    /* 3D knob styling */;
    box-shadow: var(--knob-shadow); border: 1px solid rgba(255, 255, 255, 0.2);
    /* Smooth mechanical animation: */
   ;transform: var(--knob-transform); transition: transform var(--animation-duration) cubic-bezier(0.68, -0.55, 0.265, 1.55);
    /* Performance optimization */;
    will-change: transform;
    transform-style: preserve-3d}
  /* Knob lighting overlay */
  .knob-lighting {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0
   ;background: radial-gradient(
      circle at 30% 30%,
      rgba(255, 255, 255, 0.6) 0%,
      rgba(255, 255, 255, 0.3) 30%,
      transparent 60%
    );
    border-radius: 50%; pointer-events: none}
  /* Knob reflection */
  .knob-reflection {
    position: absolute;
    top: 15%; left: 15%;
    right: 60%; bottom: 60%;background: linear-gradient(45deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
    border-radius: 50%; pointer-events: none;
    opacity: 0.7}
  /* Knob loading indicator */
  .knob-loading {
    position: absolute;
    top: 50%; left: 50%;transform: translate(-50%, -50%);
    z-index: 10}
  .n64-spinner { width: calc(var(--knob-size) * 0.5); height: calc(var(--knob-size) * 0.5);
    border: 2px solid transparent;
    border-top: 2px solid rgba(255, 255, 255, 0.8);
    border-radius: 50%; animation: switchSpin 1s linear infinite}
  @keyframes switchSpin {
    to { transform: rotate(360deg)}
  }
  /* Track fog effect */
  .track-fog {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0
   ;background: radial-gradient(ellipse at center, transparent 0%, var(--fog-color, #404040) 100%); opacity: 0.15;
    pointer-events: none;
    border-radius: calc(var(--switch-height) / 2)}
  /* Toggle glow effect */
  .toggle-glow {
    position: absolute;
    top: -4px;
    left: -4px;
    right: -4px;
    bottom: -4px
   ;background: radial-gradient(
      ellipse at center,
      rgba(74, 144, 226, calc(var(--glow-intensity) * 0.6)) 0%,
      transparent 70%
    );
    border-radius: calc(var(--switch-height) / 2 + 4px);
    pointer-events: none
   ;filter: blur(8px); z-index: -1
   ;animation: toggleGlowPulse 2s ease-in-out infinite}
  @keyframes toggleGlowPulse {
    0%,
    100% {
      opacity: var(--glow-intensity); transform: scale(1)}
    50% {
      opacity: calc(var(--glow-intensity) * 1.5); transform: scale(1.1)}
  }
  /* Switch content styling */
  .switch-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1}
  .switch-label { color: #ffffff;
    font-weight: 600;
    font-size: var(--switch-font-size); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    letter-spacing: 0.5px;
    cursor: pointer;
    user-select: none}
  .switch-description { color: rgba(255, 255, 255, 0.7);
    font-size: calc(var(--switch-font-size) * 0.85);
    line-height: 1.4}
  /* State variations */
  .n64-switch.focused { outline: 3px solid rgba(74, 144, 226, 0.6);
    outline-offset: 2px}
  .n64-switch.hovered:not(.disabled) .switch-track {
    box-shadow: inset 0 calc(var(--switch-height) * 0.1) 0 rgba(0, 0, 0, 0.4),
      inset, 0 2px, 0 rgba(0, 0, 0, 0.6),
      0 2px 4px rgba(0, 0, 0, 0.3),
      0, 0 12px rgba(255, 255, 255, 0.2)}
  .n64-switch.checked .switch-track {
    background: var(--track-bg)}
  .n64-switch.disabled {
    opacity: 0.5;
    cursor: not-allowed
   ;filter: grayscale(0.8)}
  .n64-switch.disabled .switch-knob {
    background: linear-gradient(145deg, #6c757d 0%, #495057 50%, #343a40 100%)}
  .n64-switch.readonly {
    cursor: default}
  .n64-switch.readonly .switch-label { cursor: default}
  /* Material type variations */
  .n64-switch.pbr .switch-track {
    background-blend-mode: overlay, normal}
  .n64-switch.pbr .switch-knob {
    background-blend-mode: overlay, normal}
  /* Mesh complexity variations */
  .n64-switch.mesh-ultra .switch-track {
    border-radius: calc(var(--switch-height) / 2 + 2px)}
  .n64-switch.mesh-ultra .switch-knob {
    border-radius: 60%}
  .n64-switch.mesh-low {
    transform-style: flat}
  .n64-switch.mesh-low .switch-track {
    border-radius: calc(var(--switch-height) / 4)}
  /* Enhanced texture filtering */
  .n64-switch.texture-ultra {
    filter: contrast(1.02) brightness(1.01) saturate(1.05)}
  .n64-switch.filtering-bilinear {
    filter: blur(0.25px) contrast(1.1)}
  .n64-switch.filtering-trilinear {
    filter: blur(0.15px) contrast(1.05)}
  .n64-switch.anisotropic-16x {
    filter: contrast(1.08) brightness(1.02)}
  /* Spring physics animation: for enabled switches */
  .n64-switch:not(.disabled).animating .switch-knob {
    transition: transform var(--animation-duration) cubic-bezier(0.175, 0.885, 0.32, 1.275)}
  /* Mobile optimizations */
  @media (max-width: 480px) {
    .n64-switch {
      transform: scale(var(--dynamic-scale, 1))}
    .knob-lighting,
    .knob-reflection,
    .track-fog,
    .toggle-glow {
      display: none}
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .n64-switch {
      transform: none !important;
      transition: opacity 150ms ease}
    .switch-knob {
      transition: transform 150ms ease}
    .toggle-glow {
      animation: none}
    .n64-spinner {
      animation: none
     ;border: 2px solid rgba(255, 255, 255, 0.8);
      border-right-color: transparent}
  }
  /* High contrast mode */
  @media (prefers-contrast: more) {
    .n64-switch {
      border: 2px solid currentColor}
    .switch-track {
      border: 2px solid currentColor}
    .switch-knob { border: 2px solid currentColor}
    .knob-lighting,
    .knob-reflection,
    .track-fog,
    .toggle-glow {
      display: none}
  }
  /* Performance optimization for low-end devices */
  @media (max-device-memory: 2GB) {
    .n64-switch {
      transform: none}
    .switch-track {
      box-shadow: inset 0 2px, 0 rgba(0, 0, 0, 0.4)}
    .switch-knob {
      box-shadow: 0 3px 0 rgba(0, 0, 0, 0.4)}
    .knob-lighting,
    .knob-reflection,
    .track-fog,
    .toggle-glow {
      display: none}
  }
  /* Dark mode variations */
  @media (prefers-color-scheme: dark) {
    .n64-switch {
      --fog-color: #101010}
  }
</style>


