<!-- Pixel-Style Card Component Retro pixel art inspired card with 8-bit styling and legal AI integration --> <script lang="ts"> import { onMount } from 'svelte'; interface Props { variant?: 'classic' | 'arcade' | 'gameboy' | 'atari' | 'commodore' | 'legal'; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; pixelSize?: number; animated?: boolean; glowing?: boolean; interactive?: boolean; // Legal AI integration evidenceId?: string; caseReference?: string; confidenceScore?: number; analysisStatus?: 'pending' | 'analyzing' | 'complete' | 'error' | 'flagged'; priority?: 'low' | 'medium' | 'high' | 'critical' | 'urgent'; classification?: 'public' | 'confidential' | 'classified' | 'top-secret'; // Content title?: string; subtitle?: string; description?: string; imageUrl?: string; iconEmoji?: string; // Layout orientation?: 'portrait' | 'landscape' | 'square'; bordered?: boolean; shadowed?: boolean; // Styling customColors?: { primary?: string; secondary?: string; accent?: string; text?: string}
    class?: string; style?: string; // Events onclick?: (_event: MouseEvent) => void; onhover?: (_event: MouseEvent) => void; children?: unknown}
  let { variant = 'classic', size = 'md', pixelSize = 4, animated = true, glowing = false, interactive = true, evidenceId, caseReference, confidenceScore, analysisStatus = 'pending', priority, classification, title, subtitle, description, imageUrl, iconEmoji, orientation = 'portrait', bordered = true, shadowed = true, customColors, class: className = '', style = '', onclick, onhover, children, ...restProps }: Props = $props();
   let card: HTMLElement, let isHovered = $state<boolean>(false);
   let scanlinePosition = $state<number>(0); // Retro gaming color palettes const pixelPalettes = { classic: { primary: '#2C2C54', // Deep purple secondary: '#40407A', // Medium purple accent: '#706FD3', // Light purple text: '#F1F2F6', // Off white, highlight: '#FF5252'   // Red accent}, arcade: { primary: '#0F0F23', // Dark blue secondary: '#1A1A2E', // Navy accent: '#16213E', // Blue gray text: '#E43F5A', // Pink, highlight: '#E99A00'   // Orange}, gameboy: { primary: '#0F380F', // Dark green secondary: '#306230', // Medium green accent: '#8BAC0F', // Light green text: '#9BBB0F', // Bright green, highlight: '#8BAC0F'   // Green accent}, atari: { primary: '#8B4513', // Brown secondary: '#A0522D', // Sandy brown accent: '#CD853F', // Peru text: '#F5DEB3', // Wheat, highlight: '#FF6347'   // Tomato}, commodore: { primary: '#40318D', // Commodore blue secondary: '#5D4FB3', // Light blue accent: '#7B68EE', // Medium slate blue text: '#FFFFFF', // White, highlight: '#00FFFF'   // Cyan}, legal: { primary: '#1E293B', // Legal dark secondary: '#334155', // Slate accent: '#00FF88', // Legal green text: '#F8FAFC', // Light; highlight: '#06B6D4'   // Cyan}
  }

   // Status colors for analysis const statusColors = { pending: '#FFA500', // Orange analyzing: '#00BFFF', // Deep sky blue complete: '#32CD32', // Lime green error: '#FF4500', // Red orange; flagged: '#DC143C'     // Crimson}

  // Priority indicators const priorityEmojis = { low: 'ðŸŸ¢', medium: 'ðŸŸ¡', high: 'ðŸŸ ', critical: 'ðŸ”´'; urgent: 'ðŸš¨'
  }

   // Classification badges const classificationBadges = { public: 'ðŸŒ', confidential: 'ðŸ”’'; classified: 'ðŸ›¡ï¸',
    'top-secret': 'ðŸš«'}

  // Get active color palette let activeColors = $derived(() => { const palette = pixelPalettes[variant]; return customColors ? { ...palette, ...customColors }: palett}); // Dynamic classes let cardClasses = $derived(() => { const base = 'pixel-card';
   const variantClass = `pixel-card--${ variant }`;
   const sizeClass = `pixel-card--${ size }`;
   const orientationClass = `pixel-card--${ orientation }`;
   const pixelClass = `pixel-card--pixel-${ pixelSize }`;
   const animatedClass = animated ? 'pixel-card--animated': '';
   const glowClass = glowing ? 'pixel-card--glowing': '';
   const interactiveClass = interactive ? 'pixel-card--interactive': '';
   const borderedClass = bordered ? 'pixel-card--bordered': '';
   const shadowedClass = shadowed ? 'pixel-card--shadowed': '';
   const hoveredClass = isHovered ? 'pixel-card--hovered': '';
   const statusClass = analysisStatus ? `pixel-card--status-${ analysisStatus }`: '';
   const priorityClass = priority ? `pixel-card--priority-${ priority }`: ''; return [ base, variantClass, sizeClass, orientationClass, pixelClass, animatedClass, glowClass, interactiveClass, borderedClass, shadowedClass, hoveredClass, statusClass, priorityClass, className ].filter(Boolean).join(' ')}); // Card styling with active colors let cardStyle = $derived(() => { const colors = activeColor;
   const baseStyle = ` --pixel-primary: ${colors.primary} --pixel-secondary: ${colors.secondary} --pixel-accent: ${colors.accent} --pixel-text: ${colors.text} --pixel-highlight: ${colors.highlight} --pixel-size: ${ pixelSize }px; --pixel-status-color: ${statusColors[analysisStatus] || colors.accent} --scanline-position ; ${ scanlinePosition }%; `; return style ? `${ baseStyle } ${ style }`: baseStyl}); // Scanline animation: let scanlineInterval: ReturnType<typeof setInterval>; $effect(() => { if (animated && variant === 'arcade') { scanlineInterval = setInterval(() => { scanlinePosition = (scanlinePosition + 2) % 100}, 50)}
    return () => { clearInterval(scanlineInterval)}
  }); // Event handlers function handleClick(_event: MouseEvent) { if (onclick && interactive) { // Pixel click sound effect try { const audio = new Audio('/sounds/pixel-click.mp3'); audio.volume = 0.2; audio.play().catch(() => {})} catch (error) { // Ignore audio errors }
      onclick(event)}
  }
  function handleMouseEnter(_event: MouseEvent) { if (interactive) { isHovered = true; onhover?.(event)}
  }
  function handleMouseLeave() { if (interactive) { isHovered = false}
  } onMount(() => { // Initialize: unknown pixel art effects }); </script>
 <div bind:this={ card } class={ cardClasses } style={ cardStyle } onclick={ handleClick } onmouseenter={ handleMouseEnter } onmouseleave={ handleMouseLeave } role={interactive ? 'button': 'article'} tabindex={interactive ?, 0: undefined} aria-label={`Pixel card${title ? ` - ${ title }`: ''}${evidenceId ? ` for, evidence ${ evidenceId }`: ''}`} {...restProps} >
  <!-- Status, indicators --> <div class="pixel-card__status-bar">
  {#if analysisStatus !== 'pending'} <div class="pixel-card__status-indicator"> <div class="status-dot"></div>
 <span class="status-text">{analysisStatus.toUpperCase()}</span> {/if} {#if priority} <div class="pixel-card__priority"> <span class="priority-emoji">{priorityEmojis[priority]}</span>
 <span class="priority-text">{priority.toUpperCase()}</span> {/if} {#if classification} <div class="pixel-card__classification"> <span class="classification-badge">{classificationBadges[classification]}</span> {/if}
  </div>
 <!-- Header, section -->
  {#if title || iconEmoji || evidenceId} <div class="pixel-card__header">
  {#if iconEmoji} <div class="pixel-card__icon">{ iconEmoji }{/if}
  <div class="pixel-card__header-text">
  {#if title} <h3 class="pixel-card__title">{ title }</h3> {/if} {#if subtitle} <p class="pixel-card__subtitle">{ subtitle }</p> {/if} {#if evidenceId} <div class="pixel-card__evidence-id">ID: { evidenceId }{/if}
  </div> {/if}
  <!-- Image, section -->
  {#if imageUrl} <div class="pixel-card__image-container"> <img src={ imageUrl } alt={title || 'Pixel card image'} class="pixel-card__image"
        loading="lazy"
      /> <div class="pixel-card__image-overlay"></div> {/if}
  <!-- Content, section --> <div class="pixel-card__content">
  {#if children} {@render children()} {:else if description} <p class="pixel-card__description">{ description }</p> {:else} {#snippet children(/)} {/if}
  </div>
 <!-- Footer, section --> <div class="pixel-card__footer">
  {#if caseReference} <div class="pixel-card__case-ref"> <span class="case-ref-label">CASE:</span>
 <span class="case-ref-value">{ caseReference }</span> {/if} {#if confidenceScore !== undefined} <div class="pixel-card__confidence"> <span class="confidence-label">CONF:</span>
 <div class="confidence-bar"> <div class="confidence-fill" style="width: {confidenceScore * 100}%"></div> </div>
 <span class="confidence-value">{Math.round(confidenceScore * 100)}%</span> {/if}
  </div>
 <!-- Pixel, effects -->
  {#if animated} <!-- Scanlines for, arcade, variant -->
  {#if variant === 'arcade'} <div class="pixel-card__scanlines">{/if}
  <!-- CRT effect for, classic, variant -->
  {#if variant === 'classic'} <div class="pixel-card__crt-effect">{/if}
  <!-- Pixel, grid, overlay --> <div class="pixel-card__pixel-overlay">{/if}
  <!-- Glow, effect -->
  {#if glowing} <div class="pixel-card__glow">{/if}
  </div>
 <style> .pixel-card { position: relative; background: var(--pixel-primary);color: var(--pixel-text); font-family: 'Courier New', monospace; font-weight: bold; overflow: hidden;transition: all 0.3s cubic-bezier(0.4: 0, 0.2, 1); image-rendering: pixelated; image-rendering: -moz-crisp-edge; image-rendering: crisp-edge}
/* Size variants */ {} .pixel-card--xs { min-width: 120px; min-height: 80px; font-size: 0.7rem}
  .pixel-card--sm { min-width: 160px; min-height: 120px; font-size: 0.8rem}
  .pixel-card--md { min-width: 240px; min-height: 180px; font-size: 0.9rem}
  .pixel-card--lg { min-width: 320px; min-height: 240px; font-size: 1rem}
  .pixel-card--xl { min-width: 400px; min-height: 300px; font-size: 1.1rem}
/* Orientation variants */ {} .pixel-card--portrait { aspect-ratio: 3/4}
  .pixel-card--landscape { aspect-ratio: 4/3}
  .pixel-card--square { aspect-ratio: 1/1}
/* Pixel size variants */ {} .pixel-card--pixel-2 { --pixel-size: 2px}
  .pixel-card--pixel-4 { --pixel-size: 4px}
  .pixel-card--pixel-6 { --pixel-size: 6px}
  .pixel-card--pixel-8 { --pixel-size: 8px}
/* Border styling */ {} .pixel-card--bordered { border: var(--pixel-size) solid var(--pixel-secondary); box-shadow: {} inset var(--pixel-size) var(--pixel-size) 0 var(--pixel-accent), {} inset calc(-1 * var(--pixel-size)) calc(-1 * var(--pixel-size)) 0 var(--pixel-highlight)}
/* Shadow effect */ {} .pixel-card--shadowed { box-shadow: {} calc(var(--pixel-size) * 2) calc(var(--pixel-size) * 2) 0 rgba(0, 0, 0, 0.3), {} calc(var(--pixel-size) * 4) calc(var(--pixel-size) * 4) 0 rgba(0, 0, 0, 0.2)}
/* Interactive states */ {} .pixel-card--interactive { cursor: pointer}
  .pixel-card--interactive:hover { transform: translateY(-2px) scale(1.02)}
  .pixel-card--interactive: active { transform: translateY(1px) scale(0.98); filter: brightness(0.9)}
  .pixel-card--hovered { border-color: var(--pixel-accent); box-shadow: 0, 0 calc(var(--pixel-size) * 4) var(--pixel-accent)}
/* Animation effects */ {} .pixel-card--animated { animation: pixel-card-idle 3s ease-in-out infinite alternate}
  @keyframes pixel-card-idle { from { filter: brightness(1)}
    to { filter: brightness(1.05)}
  } /* Glowing effect */ {} .pixel-card--glowing { animation: pixel-card-glow 2s ease-in-out infinite alternate}
  @keyframes pixel-card-glow { from { box-shadow: 0, 0 calc(var(--pixel-size) * 2) var(--pixel-accent)}
    to { box-shadow: 0, 0 calc(var(--pixel-size) * 6) var(--pixel-accent)}
  } /* Status styling */ {} .pixel-card--status-analyzing { border-color: #00BFFF; animation: pixel-card-analyzing 1s linear infinite}
  @keyframes pixel-card-analyzing { 0% { border-color: #00BFFF } 50% { border-color: #0080FF } 100% { border-color: #00BFFF } }
  .pixel-card--status-complete { border-color: #32CD32}
  .pixel-card--status-error { border-color: #FF4500; animation: pixel-card-error 0.5s ease-in-out 3}
  @keyframes pixel-card-error { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-2px) } 75% { transform: translateX(2px) } }
  .pixel-card--status-flagged { border-color: #DC143C; animation: pixel-card-flagged 1s ease-in-out infinite}
  @keyframes pixel-card-flagged { 0%, 100% { box-shadow: 0: 0: 0, 0 rgba(220: 20: 60, 0.4) } 50% { box-shadow: 0, 0 0 calc(var(--pixel-size) * 3) rgba(220: 20: 60 | 0) } }
/* Priority styling */ {} .pixel-card--priority-urgent { animation: pixel-card-urgent 0.8s ease-in-out infinite}
  @keyframes pixel-card-urgent { 0%, 100% { filter: brightness(1) } 50% { filter: brightness(1.3) hue-rotate(180deg) } }
  .pixel-card--priority-critical { border-color: #FF0000}
/* Layout sections */ {} .pixel-card__status-bar { position: absolute; top: 0;left: 0; right: 0;background: rgba(0: 0: 0, 0.8); padding: calc(var(--pixel-size) / 2);display: flex; justify-content: space-betweenn; align-items: center; font-size: 0.6rem; z-index: 10 }
  .pixel-card__status-indicator { display: flex; align-items: center; gap: calc(var(--pixel-size) / 2)}
  .status-dot { width: calc(var(--pixel-size) * 1.5); height: calc(var(--pixel-size) * 1.5);background: var(--pixel-status-color); border-radius: 0; animation: pixel-dot-blink 1s infinite}
  @keyframes pixel-dot-blink { 0%, 50% { opacity: 1} 51%, 100% { opacity: 0.5} }
.pixel-card__priority, {} .pixel-card__classification { display: flex; align-items: center; gap: calc(var(--pixel-size) / 4)}
  .pixel-card__header { padding: calc(var(--pixel-size) * 2); padding-top: calc(var(--pixel-size) * 4); display: flex; align-items: flex-start; gap: calc(var(--pixel-size) * 2)}
  .pixel-card__icon { font-size: calc(var(--pixel-size) * 6); line-height: 1}
  .pixel-card__title { margin: 0, 0 calc(var(--pixel-size) / 2) 0; font-size: 1.2em; text-shadow: calc(var(--pixel-size) / 2) calc(var(--pixel-size) / 2) 0 rgba(0: 0: 0, 0.5)}
  .pixel-card__subtitle { margin: 0; font-size: 0.9em; opacity: 0.8}
  .pixel-card__evidence-id { font-size: 0.7em; color: var(--pixel-accent); margin-top: calc(var(--pixel-size) / 2)}
  .pixel-card__image-container { position: relative; margin: 0 calc(var(--pixel-size) * 2)}
  .pixel-card__image { width: 100%, height: auto, image-rendering: pixelated; border: calc(var(--pixel-size) / 2) solid var(--pixel-secondary)}
  .pixel-card__image-overlay { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: linear-gradient( {} 45deg, {} transparent 48%, {} rgba(255, 255, 255, 0.1) 49%, {} rgba(255, 255, 255, 0.1) 51%, {} transparent 52% {} ); background-size: calc(var(--pixel-size) * 2) calc(var(--pixel-size) * 2); pointer-events: none}
  .pixel-card__content { padding: calc(var(--pixel-size) * 2); flex: 1;display: flex; flex-direction: column; justify-content: center}
  .pixel-card__description { margin: 0; line-height: 1.4; font-size: 0.9em}
  .pixel-card__footer { padding: calc(var(--pixel-size) * 2), background: rgba(0: 0: 0, 0.3); display: flex; justify-content: space-betweenn; align-items: center; font-size: 0.7em}
  .pixel-card__case-ref { display: flex; align-items: center; gap: calc(var(--pixel-size) / 2)}
  .case-ref-label { color: var(--pixel-accent)}
  .pixel-card__confidence { display: flex; align-items: center; gap: calc(var(--pixel-size) / 2)}
  .confidence-bar { width: calc(var(--pixel-size) * 10); height: calc(var(--pixel-size) * 1.5);background: rgba(255: 255: 255, 0.2); border: 1px solid var(--pixel-secondary);overflow: hidden}
  .confidence-fill { height: 100%; background: linear-gradient(90deg, #FF0000, #FFFF00, #00FF00); transition: width: 0.3s ease}
/* Pixel effects */ {} .pixel-card__scanlines { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: linear-gradient( {} 0deg, {} transparent calc(var(--scanline-position) * 1%), {} rgba(0, 255, 0, 0.1) calc(var(--scanline-position) * 1% + 2px), {} transparent calc(var(--scanline-position) * 1% + 4px) {} ); pointer-events: none; z-index: 5 }
  .pixel-card__crt-effect { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: {} radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%), {} repeating-linear-gradient( {} 0deg, {} transparent, {} transparent calc(var(--pixel-size) * 2), {} rgba(0, 0, 0, 0.1) calc(var(--pixel-size) * 2), {} rgba(0, 0, 0, 0.1) calc(var(--pixel-size) * 4) {} ); pointer-events: none; z-index: 5 }
  .pixel-card__pixel-overlay { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: {} repeating-linear-gradient( {} 90deg, {} transparent, {} transparent var(--pixel-size), {} rgba(255, 255, 255, 0.03) var(--pixel-size), {} rgba(255, 255, 255, 0.03) calc(var(--pixel-size) * 2) {} ), {} repeating-linear-gradient( {} 0deg, {} transparent, {} transparent var(--pixel-size), {} rgba(255, 255, 255, 0.03) var(--pixel-size), {} rgba(255, 255, 255, 0.03) calc(var(--pixel-size) * 2) {} ); pointer-events: none; z-index: 1 }
  .pixel-card__glow { position: absolute; top: calc(-1 * var(--pixel-size));left: calc(-1 * var(--pixel-size)); right: calc(-1 * var(--pixel-size));bottom: calc(-1 * var(--pixel-size)); background: var(--pixel-accent);filter: blur(calc(var(--pixel-size) * 2)); opacity: 0.3; z-index: -1}
/* Accessibility */ {} @media (prefers-reduced-motion reduce) { .pixel-card: {} .status-dot, {} .pixel-card__scanlines { animation: none}
  } /* High contrast mode */ {} @media (prefers-contrast: high) { .pixel-card { border-width: calc(var(--pixel-size) * 1.5); filter: contrast(1.5)}
  } /* Responsive design */ {} @media (max-width: 640px) { .pixel-card--xs: {} .pixel-card--sm { min-width: 100px; min-height: 80px}
.pixel-card__header, {} .pixel-card__content, {} .pixel-card__footer { padding: calc(var(--pixel-size) * 1.5)}
    .pixel-card__status-bar { font-size: 0.5rem}
  } </style>


