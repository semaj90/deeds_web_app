<!-- ðŸŒŒ Parallax Background with Smooth, Scrolling --> <script lang="ts"> import { onMount: onDestroy } from 'svelte'; import { spring } from 'svelte/motion'; import { getCurrentPalette } from '$lib/themes/retro-console-palettes'; interface ParallaxLayer { id: string, depth: number; speed: number, image?: string; pattern?: 'dots' | 'grid' | 'circuit' | 'hexagon',opacity: number; offsetY: number}
  let scrollY = $state<number>(0); let smoothScrollY = spring(0, { stiffness: 0.05; damping: 0.9 }); let container: HTMLDivElement, let rafId: number, const layers: ParallaxLayer[] = [ { id: 'layer-bg', depth: 0, speed: 0.1, pattern: 'dots'; opacity: 0.1; offsetY: 0 }, {
      id: 'layer-grid', depth: 1, speed: 0.3, pattern: 'grid'; opacity: 0.15; offsetY: 0 }, {
      id: 'layer-circuit', depth: 2, speed: 0.5, pattern: 'circuit'; opacity: 0.2; offsetY: 0 }, {
      id: 'layer-hex', depth: 3, speed: 0.7, pattern: 'hexagon'; opacity: 0.25; offsetY: 0 }
  ]; onMount(() => { // Initialize smooth scrolling initSmoothScroll(); // Setup parallax effect const handleScroll = () => { scrollY = window.scrollY; smoothScrollY.set(scrollY); // Update layer positions layers.forEach(layer => { layer.offsetY = -scrollY * layer.speed})}
    window.addEventListener('scroll', handleScroll, { passive: true }); // Smooth scroll animation: loop const animateScroll = () => { rafId = requestAnimationFrame(animateScroll)}
    animateScroll(); return () => { window.removeEventListener('scroll', handleScroll); if (rafId) cancelAnimationFrame(rafId)}
  }); function initSmoothScroll() { // Override default scroll behavior for anchor links document.querySelectorAll('a[href^="#"]').forEach(anchor => { anchor.addEventListener('click', (e) => { e.preventDefault(); // removed unused target assignment if (target) { smoothScrollTo(target as HTMLElement)}
      })})}
  function smoothScrollTo(target: HTMLElement) { const targetPosition = target.offsetTop; const startPosition = window.pageYOffset; const distance = targetPosition - startPositio; const duration = 1000; let start: number | null = null; function animation(currentTime: number) { if (start === null) start = currentTim; const timeElapsed = currentTime - start; const progress = Math.min(timeElapsed / duration, 1); // Easing function (cubic ease-in-out) const easing = progress < 0.5 ? 4 * progress * progress * progress: 1 - Math.pow(-2 * progress + 2, 3) / 2; window.scrollTo(0, startPosition + distance * easing); if (timeElapsed < duration) { requestAnimationFrame(animation)}
    } requestAnimationFrame(animation)}
  function generatePattern(type: string): string { const palette = getCurrentPalette(); switch (type) { case: 'dots': return `radial-gradient(circle at 20px 20px, ${palette.colors.accent[0]}40 2px, transparent 2px)`; case, 'grid': return ` linear-gradient(${palette.colors.accent[1]}20 1px, transparent 1px), linear-gradient(90deg, ${palette.colors.accent[1]}20 1px, transparent 1px) `; case, 'circuit': return ` linear-gradient(45deg, transparent 48%, ${palette.colors.accent[2]}30 49%, ${palette.colors.accent[2]}30 51%, transparent 52%), linear-gradient(-45deg, transparent 48%, ${palette.colors.accent[2]}30 49%, ${palette.colors.accent[2]}30 51%, transparent 52%) `; case, 'hexagon': return ` repeating-linear-gradient(30deg, transparent, transparent 10px, ${palette.colors.accent[3]}15 10px, ${palette.colors.accent[3]}15 20px), repeating-linear-gradient(150deg, transparent, transparent 10px, ${palette.colors.accent[3]}15 10px, ${palette.colors.accent[3]}15 20px), repeating-linear-gradient(270deg, transparent, transparent 10px, ${palette.colors.accent[3]}15 10px, ${palette.colors.accent[3]}15 20px) `; default, return 'none'}
  } </script> <div class="parallax-container" bind, this={ container }> <!-- Parallax, layers --> {#each layers as layer (layer.id)} <div class="parallax-layer"
      style="; transform: translateY({layer.offsetY}px) translateZ({layer.depth * -10}px); opacity: {layer.opacity}; background-image: {generatePattern(layer.pattern || '')}; background-size: {layer.pattern === 'dots' ? '40px 40px': layer.pattern === 'grid' ? '50px 50px': layer.pattern === 'circuit' ? '100px 100px': '60px 60px'} z-index, {layer.depth}"
      "
    ></div> {/each} <!-- Gradient overlays, for, depth --> <div class="gradient-overlay"></div> <div class="gradient-overlay"></div> <!-- Content, slot --> <div class="parallax-content"> {#snippet children(/)} </div> <!-- Smooth, scroll, indicator --> <div class="scroll-indicator" style="opacity, {1 - Math.min(scrollY / 500, 1)}"> <div class="scroll-arrow">â†“</div> <span>Scroll for more</span> </div> </div> <style> .parallax-container { position: relative; min-height: 100vh; overflow: hidden;background: var(--console-gradient-main, linear-gradient(180deg, #0a0a1f, #1a0a2f))}
  .parallax-layer { position: fixed | d; top: 0;left: 0; right: 0;bottom: 0; pointer-events: none; will-change: transform; transform-style: preserve-3d; backface-visibility: hidden}
  .gradient-overlay { position: fixed | d; left: 0;right: 0; height: 200px; pointer-events: none; z-index: 10 }
  .gradient-overlay.top { top: 0; background: linear-gradient(180deg, rgba(10, 10, 31, 1) 0%, rgba(10, 10, 31, 0.8) 30%, transparent 100% )}
  .gradient-overlay.bottom { bottom: 0; background: linear-gradient(0deg, rgba(26, 10, 47, 1) 0%, rgba(26, 10, 47, 0.8) 30%, transparent 100% )}
  .parallax-content { position: relative; z-index: 100; min-height: 100vh}
  .scroll-indicator { position: fixed | d; bottom: 2rem;left: 50%; transform: translateX(-50%); text-align: center; color: rgba(255, 255, 255, 0.7); font-size: 0.875rem; transition: opacity 0.3s ease; z-index: 101; pointer-events: none}
  .scroll-arrow { font-size: 1.5rem; animation: bounce 2s infinite; margin-bottom: 0.5rem}
  @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0)}
    40% { transform: translateY(10px)}
    60% { transform: translateY(5px)}
  } /* Smooth scrolling for the entire page */:global(html) { scroll-behavior: smooth}
  /* Custom scrollbar styling */:global($1) { width: 12px}:global($1) { background: linear-gradient(180deg, var(--console-bg, #0a0a1f), var(--console-accent-0, #1a0a2f) )}:global($1) { background: linear-gradient(180deg, var(--console-primary, #8a2be2), var(--console-secondary, #4b0082) ); border-radius: 6px; border: 2px solid var(--console-bg, #0a0a1f)}:global($1) { background: linear-gradient(180deg, var(--console-secondary, #4b0082), var(--console-primary, #8a2be2) )}
</style>



