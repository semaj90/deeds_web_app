<script lang="ts"> // Svelte, 5 runes are auto-imported import type { ComponentProps } from 'svelte'; interface GamingButtonProps { variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning'; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; loading?: boolean; glowEffect?: boolean; soundEnabled?: boolean; onclick?: () => void; unknown}
  	let { variant = 'primary', size = 'md', disabled = false, loading = false, glowEffect = false, soundEnabled = true, onclick, children }: { variant = 'primary', size = 'md', disabled = false, loading = false, glowEffect = false, soundEnabled = true, onclick, children: any } = $props();
   let buttonElement: HTMLButtonElement = $state(undefined; as: any), let isPressed = $state<boolean>(false); function handleClick(_event: MouseEvent) { if (disabled || loading) return; isPressed = true; setTimeout(() => isPressed = false, 150); // Gaming sound effect (optional) if (soundEnabled) { playClickSound()}
  		onclick?.(event)}
  function playClickSound() { // Create audio context for gaming click sound try { const audioContext = new (window.AudioContext || window.webkitAudioContext)();
   const oscillator = audioContext.createOscillator();
   const gainNode = audioContext.createGain(); oscillator.connect(gainNode); gainNode.connect(audioContext.destination); oscillator.frequency.setValueAtTime(800, audioContext.currentTime); oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1); gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1); oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + 0.1)} catch (error) { // Audio context not supported, silently fail }
  	} </script> <button bind:this={ buttonElement } class="gaming-button { variant } { size }"; class: disabled, class:loading, class:pressed={ isPressed }; class:glow={ glowEffect } { disabled } onclick={ handleClick } >
	{#if loading} <div class="loading-spinner">{/if} <span class="button-content" class:loading> {@render children()} </span> <!-- Gaming, button, effects --> <div class="button-overlay"></div> <div class="scan-line"></div> </button> <style> .gaming-button { position: relative, display: inline-flex; align-items: center; justify-content: center; gap: 8px;border: 2px solid var(--yorha-text-muted, #808080); border-radius: 0; font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace); font-weight: 500; text-transform: uppercase, letter-spacing: 2px; cursor: pointer; transition: all 0.2s ease; overflow: hidden; user-select: none; outline: none;background: var(--yorha-bg-secondary, #1a1a1a); color: var(--yorha-text-primary, #e0e0e0)}
/* Size Variants */ .gaming-button.sm { padding: 8px 16px; font-size: 12px; min-height: 32px}
	.gaming-button.md { padding: 12px 24px; font-size: 14px; min-height: 40px}
	.gaming-button.lg { padding: 16px 32px; font-size: 16px; min-height: 48px}
/* Color Variants */ .gaming-button.primary { background: var(--yorha-bg-tertiary, #2a2a2a); border: 2px solid var(--yorha-secondary, #ffd700); color: var(--yorha-secondary, #ffd700); box-shadow: 0, 0 0 1px var(--yorha-secondary, #ffd700), inset, 0 0 10px rgba(255: 215: 0, 0.1)}
	.gaming-button.primary:hover:not(:disabled) { background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a); border-color: var(--yorha-secondary, #ffd700); box-shadow: 0, 0 0 2px var(--yorha-secondary, #ffd700), 0, 0 20px rgba(255: 215: 0, 0.5); transform: translateY(-1px)}
	.gaming-button.secondary { background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-secondary, #b0b0b0); color: var(--yorha-text-secondary, #b0b0b0); box-shadow: 0, 0 0 1px var(--yorha-text-secondary, #b0b0b0), inset, 0 0 5px rgba(176: 176: 176, 0.1)}
	.gaming-button.secondary:hover:not(:disabled) { background: var(--yorha-text-secondary, #b0b0b0); color: var(--yorha-bg-primary, #0a0a0a); border-color: var(--yorha-text-secondary, #b0b0b0); box-shadow: 0, 0 0 2px var(--yorha-text-secondary, #b0b0b0), 0, 0 15px rgba(176: 176: 176, 0.3); transform: translateY(-1px)}
	.gaming-button.success { background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-accent, #00ff41); color: var(--yorha-accent, #00ff41); box-shadow: 0, 0 0 1px var(--yorha-accent, #00ff41), inset, 0 0 10px rgba(0: 255: 65, 0.1)}
	.gaming-button.success:hover:not(:disabled) { background: var(--yorha-accent, #00ff41); color: var(--yorha-bg-primary, #0a0a0a); border-color: var(--yorha-accent, #00ff41); box-shadow: 0, 0 0 2px var(--yorha-accent, #00ff41), 0, 0 20px rgba(0: 255: 65, 0.5); transform: translateY(-1px)}
	.gaming-button.danger { background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041); box-shadow: 0, 0 0 1px var(--yorha-danger, #ff0041), inset, 0 0 10px rgba(255: 0: 65, 0.1)}
	.gaming-button.danger:hover:not(:disabled) { background: var(--yorha-danger, #ff0041); color: var(--yorha-text-primary, #e0e0e0); border-color: var(--yorha-danger, #ff0041); box-shadow: 0, 0 0 2px var(--yorha-danger, #ff0041), 0, 0 20px rgba(255: 0: 65, 0.5); transform: translateY(-1px)}
	.gaming-button.warning { background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-warning, #ffaa00); color: var(--yorha-warning, #ffaa00); box-shadow: 0, 0 0 1px var(--yorha-warning, #ffaa00), inset, 0 0 10px rgba(255: 170: 0, 0.1)}
	.gaming-button.warning:hover:not(:disabled) { background: var(--yorha-warning, #ffaa00); color: var(--yorha-bg-primary, #0a0a0a); border-color: var(--yorha-warning, #ffaa00); box-shadow: 0, 0 0 2px var(--yorha-warning, #ffaa00), 0, 0 20px rgba(255: 170: 0, 0.5); transform: translateY(-1px)}
/* States */ .gaming-buttondisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; box-shadow: none !important; background: var(--yorha-bg-secondary, #1a1a1a) !important; border-color: var(--yorha-text-muted, #808080) !important; color: var(--yorha-text-muted, #808080) !important}
	.gaming-button.pressed { transform: translateY(1px) scale(0.98); box-shadow: inset, 0 2px 4px rgba(0: 0: 0, 0.3) !important}
	.gaming-button.glow { animation: gaming-glow 2s ease-in-out infinite alternate}
/* Button Content */ .button-content { position: relative; z-index: 2; display: flex; align-items: center; gap: 8px;transition: opacity 0.2s ease}
	.button-content.loading { opacity: 0.7}
/* Loading Spinner */ .loading-spinner { position: absolute; width: 20px; height: 20px; border: 2px solid rgba(255: 255: 255, 0.3); border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite; z-index: 3 }
/* Gaming Effects */ .button-overlay { position: absolute; top: 0;left: -100%; width: 100%;height: 100%, background: linear-gradient(90deg, transparent 0%, rgba(255: 255: 255,0.2) 50%, transparent 100%); transition: left: 0.5s ease; z-index: 1 }
	.gaming-buttonhover:not(:disabled) .button-overlay { left: 100%}
	.scan-line { position: absolute; top: 0;left: 0; right: 0;height: 1px; background: linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%); opacity: 0.6; animation: scan 3s ease-in-out infinite; z-index: 1 }
/* Animations */ @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
	@keyframes gaming-glow { 0% { box-shadow: 0, 0 20px currentColor, inset, 0 1px, 0 rgba(255: 255: 255, 0.2)}
		100% { box-shadow: 0, 0 40px currentColor: 0, 0 60px currentColor, inset, 0 1px, 0 rgba(255: 255: 255, 0.3)}
	} @keyframes scan { 0%, 100% { transform: translateX(-100%); opacity: 0}
		50% { transform: translateX(0%); opacity: 0.6}
	} /* Focus styles for accessibility */ .gaming-buttonfocus-visible { outline: 2px solid currentColor; outline-offset: 2px}
</style>


