/**
 * Console Palette Animation System
 * Smooth transitions between gaming themes with easing and effects
 */
import { CONSOLE_PALETTES, type ConsolePaletteName } from './retro-console-palettes.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

export interface AnimationOptions {
	duration: number;
	easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';
	effects: AnimationEffect[];
}

export interface AnimationEffect {
	type: 'scanlines' | 'chromatic-aberration' | 'pixelate' | 'glitch' | 'crt-curve';
	intensity: number;
	duration: number;
}

export interface ColorTransition {
	from: string;
	to: string;
	current: string;
	progress: number;
}

export class PaletteAnimationController {
	private currentPalette: ConsolePaletteName = 'legal';
	private isAnimating = $state(false);
	private animationFrame?: number;
	private startTime = 0;
	private transitions = new Map<string, ColorTransition>();
	// Animation state
	private glitchIntensity = 0;
	private scanlinePosition = 0;
	private chromaticOffset = 0;
	private pixelateLevel = 0;

	async animatePaletteChange(
		fromPalette: ConsolePaletteName,
		toPalette: ConsolePaletteName,
		options: Partial<AnimationOptions> = {}
	): Promise<void> {
		if (this.isAnimating) return;

		const animOptions: AnimationOptions = {
			duration: 1000,
			easing: 'ease-out',
			effects: [
				{ type: 'scanlines', intensity: 0.3, duration: 1000 },
	{ type: 'chromatic-aberration', intensity: 0.2, duration: 800 }
			],
			...options
		};

		this.isAnimating = true;
		this.setupTransitions(fromPalette, toPalette);

		// Apply pre-transition effects
		this.applyPreTransitionEffects(animOptions.effects);

		return new Promise((resolve) => {
			this.startTime = performance.now();

			const animate = (currentTime: number) => {
				const elapsed = currentTime - this.startTime;
				const progress = Math.min(elapsed / animOptions.duration, 1);

				// Apply easing function
				const easedProgress = this.applyEasing(progress, animOptions.easing);

				// Update color transitions
				this.updateColorTransitions(easedProgress);

				// Apply animation effects
				this.applyAnimationEffects(animOptions.effects, progress);

				// Apply current palette state
				this.applyCurrentPalette();

				if (progress < 1) {
					this.animationFrame = requestAnimationFrame(animate);
				} else {
					this.completeAnimation(toPalette);
					resolve();
				}
			};
			this.animationFrame = requestAnimationFrame(animate);
		});
	}

	private setupTransitions(fromPalette: ConsolePaletteName, toPalette: ConsolePaletteName): void {
		const fromColors = CONSOLE_PALETTES[fromPalette].colors;
		const toColors = CONSOLE_PALETTES[toPalette].colors;
		this.transitions.clear();

		// Setup transitions for all color properties
		Object.keys(fromColors).forEach((key) => {
			const k = key as keyof typeof fromColors;
			const fromColor = fromColors[k];
			const toColor = toColors[k as keyof typeof toColors];

			if (Array.isArray(fromColor) && Array.isArray(toColor)) {
				// Handle accent color arrays
				fromColor.forEach((from, index) => {
					const to = toColor[index] || toColor[0];
					this.transitions.set(`${key}[${index}]`, {
						from,
						to,
						current: from,
						progress: 0
					});
				});
			} else if (typeof fromColor === 'string' && typeof toColor === 'string') {
				this.transitions.set(key, {
					from: fromColor,
					to: toColor,
					current: fromColor,
					progress: 0
				});
			}
		});
	}

	private updateColorTransitions(progress: number): void {
		for (const [_, transition] of this.transitions) {
			transition.progress = progress;
			transition.current = this.interpolateColor(transition.from, transition.to, progress);
		}
	}

	private interpolateColor(from: string, to: string, progress: number): string {
		const fromRgb = this.hexToRgb(from);
		const toRgb = this.hexToRgb(to);
		if (!fromRgb || !toRgb) return from;

		const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * progress);
		const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * progress);
		const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * progress);

		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	private hexToRgb(hex: string): {
	r: number, g: number;
	b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
			  }
			: null;
	}

	private applyEasing(progress: number, easing: AnimationOptions['easing']): number {
		switch (easing) {
			case 'linear':
				return progress;
			case 'ease':
				return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
			case 'ease-in':
				return progress * progress;
			case 'ease-out':
				return progress * (2 - progress);
			case 'ease-in-out':
				return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
			case 'bounce':
				if (progress < 1 / 2.75) {
					return 7.5625 * progress * progress;
				} else if (progress < 2 / 2.75) {
					return 7.5625 * (progress -= 1.5 / 2.75) * progress + 0.75;
				} else if (progress < 2.5 / 2.75) {
					return 7.5625 * (progress -= 2.25 / 2.75) * progress + 0.9375;
				} else {
					return 7.5625 * (progress -= 2.625 / 2.75) * progress + 0.984375;
				}
			default:
				return progress;
		}
	}

	private applyPreTransitionEffects(effects: AnimationEffect[]): void {
		for (const effect of effects) {
			switch (effect.type) {
				case 'scanlines':
					this.createScanlinesEffect(effect.intensity);
					break;
				case 'glitch':
					this.glitchIntensity = effect.intensity;
					break;
				case 'pixelate':
					this.pixelateLevel = effect.intensity;
					break;
			}
		}
	}

	private applyAnimationEffects(effects: AnimationEffect[], progress: number): void {
		for (const effect of effects) {
			const effectProgress = Math.min(progress * (1000 / effect.duration), 1);
			switch (effect.type) {
				case 'scanlines':
					this.updateScanlinesEffect(effect.intensity * (1 - effectProgress));
					break;
				case 'chromatic-aberration':
					this.updateChromaticAberration(effect.intensity * Math.sin(progress * Math.PI));
					break;
				case 'glitch':
					this.updateGlitchEffect(effect.intensity * Math.random() * (1 - effectProgress));
					break;
				case 'pixelate':
					this.updatePixelateEffect(effect.intensity * (1 - effectProgress));
					break;
				case 'crt-curve':
					this.updateCRTCurveEffect(effect.intensity);
					break;
			}
		}
	}

	private createScanlinesEffect(intensity: number): void {
		const scanlineCSS = `
			.palette-scanlines::before {
				content: '';
	position: fixed, top: 0;
	left: 0, right: 0;
	bottom: 0; pointer-events: none;
	background: linear-gradient( transparent 50%, rgba(0, 255, 0, ${intensity * 0.1}) 51%, transparent 52% );
				background-size: 100% 4px, animation: scanline-scroll 0.1s linear infinite; z-index: 9999;
			}
			@keyframes scanline-scroll { 0% { transform: translateY(0) } 100% { transform: translateY(4px) } }
		`;
		this.injectCSS('palette-scanlines', scanlineCSS);
		document.body.classList.add('palette-scanlines');
	}

	private updateScanlinesEffect(intensity: number): void {
		const root = document.documentElement;
		root.style.setProperty('--scanline-intensity', intensity.toString());
	}

	private updateChromaticAberration(intensity: number): void {
		this.chromaticOffset = intensity * 3;
		const root = document.documentElement;
		root.style.setProperty('--chromatic-offset', `${this.chromaticOffset}px`);
		if (intensity > 0 && !document.body.classList.contains('chromatic-aberration')) {
			document.body.classList.add('chromatic-aberration');
			const aberrationCSS = `
			.chromatic-aberration { filter: drop-shadow(var(--chromatic-offset, 0px) 0 red) drop-shadow(calc(var(--chromatic-offset, 0px) * -1) 0 blue); }
			`;
			this.injectCSS('chromatic-aberration', aberrationCSS);
		}
	}

	private updateGlitchEffect(intensity: number): void {
		this.glitchIntensity = intensity;
		if (intensity > 0.1) {
			const glitchCSS = `
				.palette-glitch { animation: glitch-effect 0.1s ${intensity * 10}s linear infinite; }
				@keyframes glitch-effect {
					0% { transform: translateX(0) } 10% { transform: translateX(-2px) scaleX(1.01) }
					20% { transform: translateX(2px) scaleY(1.01) } 30% { transform: translateX(-1px) scaleX(0.99) }
					40% { transform: translateX(1px) scaleY(0.99) } 50% { transform: translateX(-2px) scaleX(1.02) }
					60% { transform: translateX(2px) scaleY(1.02) } 70% { transform: translateX(-1px) scaleX(0.98) }
					80% { transform: translateX(1px) scaleY(0.98) } 90% { transform: translateX(-2px) scaleX(1.01) }
					100% { transform: translateX(0) }
				}
			`;
			this.injectCSS('palette-glitch', glitchCSS);
			document.body.classList.add('palette-glitch');
		}
	}

	private updatePixelateEffect(intensity: number): void {
		this.pixelateLevel = intensity;
		const root = document.documentElement;
		if (intensity > 0) {
			const pixelSize = Math.max(1, intensity * 8);
			root.style.setProperty('--pixel-size', `${pixelSize}px`);
			const pixelateCSS = `
				.palette-pixelate { image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;
	filter: blur(${intensity}px) saturate(1.2); }
			`;
			this.injectCSS('palette-pixelate', pixelateCSS);
			document.body.classList.add('palette-pixelate');
		}
	}

	private updateCRTCurveEffect(intensity: number): void {
		if (intensity > 0) {
			const crtCSS = `
				.palette-crt::before {
					content: '';
	position: fixed, top: 0;
	left: 0, right: 0;
	bottom: 0; pointer-events: none;
	background: radial-gradient( ellipse at center, transparent 70%, rgba(0, 0, 0, ${intensity * 0.3}) 100% );
					z-index: 9998;
				}
				.palette-crt { transform: perspective(1000px) rotateX(${intensity * 2}deg); filter: brightness(1.1) contrast(1.2); }
			`;
			this.injectCSS('palette-crt', crtCSS);
			document.body.classList.add('palette-crt');
		}
	}

	private applyCurrentPalette(): void {
		const root = document.documentElement;
		// Apply interpolated colors
		for (const [key, transition] of this.transitions) {
			if (key.includes('[')) {
				// Handle accent color arrays
				const [baseKey, indexStr] = key.split('[');
				const index = parseInt(indexStr.replace(']', ''));
				root.style.setProperty(`--console-accent-${index}`, transition.current);
			} else {
				// Handle regular color properties
				root.style.setProperty(`--console-${key.replace('_', '-')}`, transition.current);
			}
		}
	}

	private completeAnimation(toPalette: ConsolePaletteName): void {
		this.isAnimating = false;
		this.currentPalette = toPalette;

		// Clean up animation effects
		this.cleanupAnimationEffects();

		// Final palette application
		const root = document.documentElement;
		const palette = CONSOLE_PALETTES[toPalette];

		// Apply final colors directly
		Object.entries(palette.cssVariables).forEach(([key, value]) => {
			root.style.setProperty(key, value);
		});
	}

	private injectCSS(id: string, css: string): void {
		let style = document.getElementById(id);
		if (!style) {
			style = document.createElement('style');
			style.id = id;
			document.head.appendChild(style);
		}
		style.textContent = css;
	}

	private cleanupAnimationEffects(): void {
		const effects = ['palette-scanlines', 'chromatic-aberration', 'palette-glitch', 'palette-pixelate', 'palette-crt'];
		effects.forEach(id => {
			const style = document.getElementById(id);
			if (style) style.remove();
			document.body.classList.remove(id);
		});
		const root = document.documentElement;
		root.style.removeProperty('--scanline-intensity');
		root.style.removeProperty('--chromatic-offset');
		root.style.removeProperty('--pixel-size');
	}

	async animateToNES() { return this.animatePaletteChange(this.currentPalette, 'nes'); }
	async animateToSNES() { return this.animatePaletteChange(this.currentPalette, 'snes'); }
	async animateToN64() { return this.animatePaletteChange(this.currentPalette, 'n64'); }
	async animateToPS1() { return this.animatePaletteChange(this.currentPalette, 'ps1'); }
	async animateToPS2() { return this.animatePaletteChange(this.currentPalette, 'ps2'); }
	async animateToLegal() { return this.animatePaletteChange(this.currentPalette, 'legal'); }
}

// Global instance
export const paletteAnimator = new PaletteAnimationController();

// Utility functions for common transitions
export async function smoothPaletteTransition(
	fromPalette: ConsolePaletteName,
	toPalette: ConsolePaletteName,
	duration = 1000
): Promise<void> {
	return paletteAnimator.animatePaletteChange(fromPalette, toPalette, { duration });
}

export function quickGamingTransition(consoleName: ConsolePaletteName): Promise<void> {
	switch (consoleName) {
		case 'nes':
			return paletteAnimator.animateToNES();
		case 'snes':
			return paletteAnimator.animateToSNES();
		case 'n64':
			return paletteAnimator.animateToN64();
		case 'ps1':
			return paletteAnimator.animateToPS1();
		case 'ps2':
			return paletteAnimator.animateToPS2();
		case 'legal':
			return paletteAnimator.animateToLegal();
		default:
			return paletteAnimator.animateToLegal();
	}
}
